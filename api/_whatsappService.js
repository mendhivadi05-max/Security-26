const { firestore, FieldValue } = require("./_firebaseAdmin");
const { templateLanguage, templateName, templateParameterFormat, templateVariables } = require("./_whatsappTemplates");

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v20.0";
const TEMPORARY_ERROR_CODES = new Set([1, 2, 4, 17, 32, 613]);

function integerEnv(name, fallback, min, max) {
    const value = Number(process.env[name]);
    if (!Number.isFinite(value)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.floor(value)));
}

function whatsappSafeguards() {
    return {
        maxBatchSize: integerEnv("WHATSAPP_MAX_BATCH_SIZE", 150, 1, 200),
        dailySendLimit: integerEnv("WHATSAPP_DAILY_SEND_LIMIT", 375, 1, 5000),
        memberCooldownMinutes: integerEnv("WHATSAPP_MEMBER_COOLDOWN_MINUTES", 180, 0, 1440),
        sendRetryAttempts: integerEnv("WHATSAPP_SEND_RETRY_ATTEMPTS", 1, 1, 3)
    };
}

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not configured.`);
    }
    return value;
}

function normalizePhone(value) {
    const digits = (value || "").toString().replace(/[^\d]/g, "");
    const defaultCountryCode = (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || "91")
        .toString()
        .replace(/[^\d]/g, "");

    if (defaultCountryCode && digits.length === 10) {
        return `${defaultCountryCode}${digits}`;
    }

    return digits;
}

function memberName(member) {
    return member.name || member.profile?.name || "Member";
}

function memberPhone(member) {
    return normalizePhone(
        member.contact?.whatsappNumber ||
        member.whatsappNumber ||
        member.phone ||
        ""
    );
}

function isActiveMember(member) {
    return member.active !== false && member.status !== "inactive" && member.archived !== true;
}

function templatePayload(to, templateKey, variables) {
    const namedParameters = templateParameterFormat() === "named";
    const orderedValues = templateVariables(templateKey).map(variable => {
        const parameter = {
            type: "text",
            text: String(variables?.[variable] ?? "")
        };

        if (namedParameters) {
            parameter.parameter_name = variable;
        }

        return parameter;
    });

    return {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
            name: templateName(templateKey),
            language: { code: templateLanguage() },
            components: orderedValues.length
                ? [
                    {
                        type: "body",
                        parameters: orderedValues
                    }
                ]
                : []
        }
    };
}

function isTemporaryMetaFailure(status, body) {
    const code = Number(body?.error?.code);
    return status === 429 || status >= 500 || TEMPORARY_ERROR_CODES.has(code);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendTemplateMessage({ to, templateKey, variables, requestId, memberId }) {
    const phoneNumberId = requiredEnv("META_WHATSAPP_PHONE_NUMBER_ID");
    const token = requiredEnv("META_WHATSAPP_ACCESS_TOKEN");
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
    const payload = templatePayload(to, templateKey, variables);
    const retryAttempts = whatsappSafeguards().sendRetryAttempts;
    let lastError;

    for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
        const startedAt = Date.now();
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
            const result = await response.json().catch(() => ({}));

            if (response.ok) {
                const messageId = result.messages?.[0]?.id || "";
                await logMessage({
                    direction: "outgoing",
                    status: "sent",
                    templateKey,
                    to,
                    requestId,
                    memberId,
                    messageId,
                    variables,
                    latencyMs: Date.now() - startedAt,
                    attempts: attempt
                });
                return { ok: true, to, memberId, messageId, attempts: attempt };
            }

            lastError = new Error(result.error?.message || `Meta returned HTTP ${response.status}.`);
            lastError.meta = result.error || result;
            lastError.status = response.status;

            if (!isTemporaryMetaFailure(response.status, result)) {
                break;
            }
        }
        catch (error) {
            lastError = error;
        }

        if (attempt < retryAttempts) {
            await sleep(300 * attempt);
        }
    }

    await logMessage({
        direction: "outgoing",
        status: "failed",
        templateKey,
        to,
        requestId,
        memberId,
        variables,
        error: lastError?.message || "Unknown WhatsApp send failure."
    });

    return {
        ok: false,
        to,
        memberId,
        error: lastError?.message || "Unknown WhatsApp send failure."
    };
}

async function logMessage(entry) {
    try {
        await firestore().collection("whatsappMessages").add({
            ...entry,
            createdAtMs: Date.now(),
            createdAt: FieldValue.serverTimestamp()
        });
    }
    catch (error) {
        console.error("WhatsApp message log failed:", error);
    }
}

function todayKey() {
    return new Date().toISOString().slice(0, 10);
}

function lockDocId(templateKey, memberId) {
    return `${templateKey}_${memberId}`.replace(/[^\w.-]/g, "_").slice(0, 500);
}

async function reserveDailyQuota(count) {
    if (!count) {
        return;
    }

    const safeguards = whatsappSafeguards();
    const db = firestore();
    const usageRef = db.collection("whatsappDailyUsage").doc(todayKey());

    await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(usageRef);
        const used = snapshot.exists ? Number(snapshot.data().reserved || 0) : 0;
        if (used + count > safeguards.dailySendLimit) {
            const error = new Error(
                `WhatsApp daily send limit reached. ${used}/${safeguards.dailySendLimit} messages are already reserved today.`
            );
            error.statusCode = 429;
            throw error;
        }

        transaction.set(usageRef, {
            reserved: used + count,
            limit: safeguards.dailySendLimit,
            updatedAt: FieldValue.serverTimestamp(),
            updatedAtMs: Date.now()
        }, { merge: true });
    });
}

function chunkArray(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

async function recentlyMessagedMemberIds(members, templateKey) {
    const cooldownMinutes = whatsappSafeguards().memberCooldownMinutes;
    if (!cooldownMinutes) {
        return new Set();
    }

    const since = Date.now() - cooldownMinutes * 60_000;
    const memberIds = members.map(member => member.id).filter(Boolean);
    const blockedIds = new Set();

    for (const chunk of chunkArray(memberIds, 30)) {
        const snapshot = await firestore()
            .collection("whatsappMessages")
            .where("memberId", "in", chunk)
            .get();

        snapshot.docs.forEach(doc => {
            const message = doc.data();
            if (
                message.templateKey === templateKey &&
                message.status === "sent" &&
                Number(message.createdAtMs || 0) >= since
            ) {
                blockedIds.add(message.memberId);
            }
        });
    }

    return blockedIds;
}

async function reserveSendLocks(members, templateKey) {
    const cooldownMinutes = whatsappSafeguards().memberCooldownMinutes;
    if (!cooldownMinutes || !members.length) {
        return new Set();
    }

    const now = Date.now();
    const expiresAtMs = now + cooldownMinutes * 60_000;
    const db = firestore();
    const lockRefs = members.map(member => ({
        member,
        ref: db.collection("whatsappSendLocks").doc(lockDocId(templateKey, member.id))
    }));
    const blockedIds = new Set();

    await db.runTransaction(async transaction => {
        const snapshots = await Promise.all(lockRefs.map(item => transaction.get(item.ref)));
        snapshots.forEach((snapshot, index) => {
            const member = lockRefs[index].member;
            const lock = snapshot.exists ? snapshot.data() : null;
            if (Number(lock?.expiresAtMs || 0) > now) {
                blockedIds.add(member.id);
                return;
            }

            transaction.set(lockRefs[index].ref, {
                memberId: member.id,
                templateKey,
                reservedAtMs: now,
                expiresAtMs,
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
        });
    });

    return blockedIds;
}

async function mapWithConcurrency(items, limit, callback) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await callback(items[currentIndex], currentIndex);
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, worker)
    );

    return results;
}

async function fetchActiveMembers() {
    const snapshot = await firestore().collection("members").get();
    return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(isActiveMember);
}

async function fetchMembersByIds(memberIds) {
    const uniqueIds = [...new Set(memberIds)];
    const db = firestore();
    const refs = uniqueIds.map(memberId => db.collection("members").doc(memberId));

    if (!refs.length) {
        return [];
    }

    const docs = await db.getAll(...refs);
    return docs
        .filter(doc => doc.exists)
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(isActiveMember);
}

async function sendBatch({ members, templateKey, variableBuilder, requestId }) {
    const skippedResults = [];
    const safeguards = whatsappSafeguards();
    const uniqueMembers = [...new Map(members.map(member => [member.id, member])).values()];

    if (uniqueMembers.length > safeguards.maxBatchSize) {
        const error = new Error(`Choose no more than ${safeguards.maxBatchSize} WhatsApp recipients at once.`);
        error.statusCode = 400;
        throw error;
    }

    const cooldownMemberIds = await recentlyMessagedMemberIds(uniqueMembers, templateKey);
    const lockMemberIds = await reserveSendLocks(
        uniqueMembers.filter(member => !cooldownMemberIds.has(member.id)),
        templateKey
    );
    const sendableMembers = [];

    for (const member of uniqueMembers) {
        const to = memberPhone(member);
        if (!to) {
            skippedResults.push({
                ok: false,
                memberId: member.id,
                error: "Member does not have a WhatsApp number."
            });
            continue;
        }

        if (cooldownMemberIds.has(member.id) || lockMemberIds.has(member.id)) {
            skippedResults.push({
                ok: false,
                memberId: member.id,
                to,
                error: `Skipped by cooldown. This template was sent to this member within the last ${safeguards.memberCooldownMinutes} minutes.`
            });
            continue;
        }

        sendableMembers.push({ member, to });
    }

    await reserveDailyQuota(sendableMembers.length);

    const sentResults = await mapWithConcurrency(sendableMembers, 5, async ({ member, to }) => {
        const variables = variableBuilder(member);
        return sendTemplateMessage({
            to,
            templateKey,
            variables,
            requestId,
            memberId: member.id
        });
    });

    return summarizeResults([...skippedResults, ...sentResults]);
}

function summarizeResults(results) {
    return {
        total: results.length,
        sent: results.filter(result => result.ok).length,
        failed: results.filter(result => !result.ok).length,
        results
    };
}

module.exports = {
    fetchActiveMembers,
    fetchMembersByIds,
    isActiveMember,
    memberName,
    memberPhone,
    normalizePhone,
    sendBatch,
    sendTemplateMessage,
    summarizeResults,
    templatePayload,
    whatsappSafeguards
};
