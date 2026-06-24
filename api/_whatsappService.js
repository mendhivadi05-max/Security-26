const { firestore, admin } = require("./_firebaseAdmin");
const { templateLanguage, templateName } = require("./_whatsappTemplates");

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v20.0";
const TEMPORARY_ERROR_CODES = new Set([1, 2, 4, 17, 32, 613]);

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not configured.`);
    }
    return value;
}

function normalizePhone(value) {
    return (value || "").toString().replace(/[^\d]/g, "");
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
    const orderedValues = Object.entries(variables).map(([name, value]) => ({
        type: "text",
        parameter_name: name,
        text: String(value ?? "")
    }));

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
    let lastError;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
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

        if (attempt < 3) {
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
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    catch (error) {
        console.error("WhatsApp message log failed:", error);
    }
}

async function fetchActiveMembers() {
    const snapshot = await firestore().collection("members").get();
    return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(isActiveMember);
}

async function fetchMembersByIds(memberIds) {
    const uniqueIds = [...new Set(memberIds)];
    const members = [];

    for (const memberId of uniqueIds) {
        const doc = await firestore().collection("members").doc(memberId).get();
        if (doc.exists) {
            members.push({ id: doc.id, ...doc.data() });
        }
    }

    return members.filter(isActiveMember);
}

async function sendBatch({ members, templateKey, variableBuilder, requestId }) {
    const results = [];

    for (const member of members) {
        const to = memberPhone(member);
        if (!to) {
            results.push({
                ok: false,
                memberId: member.id,
                error: "Member does not have a WhatsApp number."
            });
            continue;
        }

        const variables = variableBuilder(member);
        results.push(
            await sendTemplateMessage({
                to,
                templateKey,
                variables,
                requestId,
                memberId: member.id
            })
        );
    }

    return summarizeResults(results);
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
    sendBatch,
    sendTemplateMessage,
    summarizeResults
};
