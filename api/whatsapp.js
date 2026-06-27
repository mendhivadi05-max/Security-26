const { jsonBody, rateLimit, requestId, requireAdmin, sendError } = require("./_apiUtils");
const { logAction } = require("./_actionLog");
const { firestore, FieldValue } = require("./_firebaseAdmin");
const { publicTemplates, TEMPLATE_CONFIG, templateLanguage, templateParameterFormat } = require("./_whatsappTemplates");
const { fetchActiveMembers, fetchMembersByIds, memberName, memberPhone, sendBatch, whatsappSafeguards } = require("./_whatsappService");
const webhookHandler = require("./whatsapp/webhook");

function looksLikeMetaWebhook(request) {
    if (request.method === "GET") {
        return Boolean(request.query?.["hub.mode"] || request.query?.["hub.challenge"]);
    }

    if (request.method !== "POST") {
        return false;
    }

    const body = jsonBody(request);
    return body?.object === "whatsapp_business_account" || Array.isArray(body?.entry);
}

function cleanMemberIds(value) {
    return Array.isArray(value)
        ? [...new Set(value.map(item => String(item || "").trim()).filter(Boolean))]
        : [];
}

function envState(name, { secret = false } = {}) {
    const value = process.env[name] || "";
    return {
        name,
        configured: Boolean(value),
        length: value.length,
        preview: secret || !value ? "" : value
    };
}

function whatsappEnvReady() {
    return [
        "META_WHATSAPP_ACCESS_TOKEN",
        "META_WHATSAPP_PHONE_NUMBER_ID",
        "WHATSAPP_TEMPLATE_MEETING_REMINDER"
    ].every(name => Boolean(process.env[name]));
}

async function checkPhoneNumber() {
    const token = process.env.META_WHATSAPP_ACCESS_TOKEN || "";
    const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID || "";
    const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || "v20.0";

    if (!token || !phoneNumberId) {
        return {
            ok: false,
            error: "META_WHATSAPP_ACCESS_TOKEN and META_WHATSAPP_PHONE_NUMBER_ID are required."
        };
    }

    const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`;
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        return {
            ok: false,
            status: response.status,
            error: result.error?.message || `Meta returned HTTP ${response.status}.`
        };
    }

    return {
        ok: true,
        phoneNumber: {
            id: result.id || "",
            displayPhoneNumber: result.display_phone_number || "",
            verifiedName: result.verified_name || "",
            qualityRating: result.quality_rating || ""
        }
    };
}

async function diagnostics(request, response) {
    const metaPhoneNumber = request.query?.meta === "1"
        ? await checkPhoneNumber()
        : { ok: null, skipped: true };

    return response.status(200).json({
        environment: [
            envState("META_WHATSAPP_ACCESS_TOKEN", { secret: true }),
            envState("META_WHATSAPP_PHONE_NUMBER_ID"),
            envState("META_WHATSAPP_WEBHOOK_VERIFY_TOKEN", { secret: true }),
            envState("META_WHATSAPP_APP_SECRET", { secret: true }),
            envState("WHATSAPP_GRAPH_VERSION"),
            envState("WHATSAPP_TEMPLATE_LANGUAGE"),
            envState("WHATSAPP_TEMPLATE_PARAMETER_FORMAT"),
            envState("WHATSAPP_DEFAULT_COUNTRY_CODE"),
            envState("WHATSAPP_TEMPLATE_MEETING_REMINDER"),
            envState("WHATSAPP_TEMPLATE_ABSENT_NOTICE"),
            envState("WHATSAPP_TEMPLATE_ABSENCE_REVIEW")
        ],
        safeguards: whatsappSafeguards(),
        templates: publicTemplates(),
        templateLanguage: templateLanguage(),
        templateParameterFormat: templateParameterFormat(),
        metaPhoneNumber
    });
}

async function prepareReminders(body, response) {
    const meetingTime = String(body.meetingTime || "").trim();
    const memberIds = cleanMemberIds(body.memberIds);
    const safeguards = whatsappSafeguards();

    if (memberIds.length > safeguards.maxBatchSize) {
        return response.status(400).json({
            error: `Choose no more than ${safeguards.maxBatchSize} members.`
        });
    }

    const members = memberIds.length
        ? await fetchMembersByIds(memberIds)
        : await fetchActiveMembers();

    const recipients = members.map(member => ({
        id: member.id,
        name: memberName(member),
        phone: memberPhone(member),
        ready: Boolean(memberPhone(member))
    }));

    const readyRecipients = recipients.filter(recipient => recipient.ready);

    return response.status(200).json({
        ready: whatsappEnvReady() && Boolean(meetingTime) && readyRecipients.length > 0,
        environmentReady: whatsappEnvReady(),
        meetingTimeReady: Boolean(meetingTime),
        safeguards,
        template: publicTemplates().meetingReminder,
        templateLanguage: templateLanguage(),
        templateParameterFormat: templateParameterFormat(),
        totalSelected: memberIds.length || members.length,
        readyCount: readyRecipients.length,
        skippedCount: recipients.length - readyRecipients.length,
        recipients: recipients.slice(0, safeguards.maxBatchSize)
    });
}

async function sendReminders(body, user, response) {
    const meetingTime = String(body.meetingTime || "").trim();
    if (!meetingTime) {
        return response.status(400).json({ error: "Meeting time is required." });
    }

    const memberIds = cleanMemberIds(body.memberIds);
    const safeguards = whatsappSafeguards();
    if (memberIds.length > safeguards.maxBatchSize) {
        return response.status(400).json({ error: `Choose no more than ${safeguards.maxBatchSize} members.` });
    }

    const members = memberIds.length
        ? await fetchMembersByIds(memberIds)
        : await fetchActiveMembers();
    if (members.length > safeguards.maxBatchSize) {
        return response.status(400).json({
            error: `This would send to ${members.length} members. Select up to ${safeguards.maxBatchSize} recipients per batch.`
        });
    }

    const result = await sendBatch({
        members,
        templateKey: "meetingReminder",
        requestId: requestId(),
        variableBuilder: member => ({
            name: memberName(member),
            meeting_time: meetingTime
        })
    });

    const db = firestore();
    await Promise.all(result.results.map(sendResult => {
        if (!sendResult.memberId) {
            return Promise.resolve();
        }

        return db.collection("members").doc(sendResult.memberId).set({
            lastReminderSentAt: sendResult.ok ? FieldValue.serverTimestamp() : null,
            reminderStatus: sendResult.ok ? "sent" : "failed",
            reminderError: sendResult.ok ? "" : sendResult.error || "Send failed"
        }, { merge: true });
    }));

    await logAction({
        user,
        action: "whatsapp_reminders_sent",
        details: {
            meetingTime,
            attempted: result.total,
            sent: result.sent,
            failed: result.failed,
            memberIds: members.map(member => member.id)
        }
    });

    return response.status(200).json(result);
}

async function sendTargeted(body, user, response) {
    const memberIds = cleanMemberIds(body.memberIds);
    const templateKey = String(body.templateKey || "");
    const variables = body.variables && typeof body.variables === "object" ? body.variables : {};
    const template = TEMPLATE_CONFIG[templateKey];

    if (!template) {
        return response.status(400).json({ error: "Choose a valid WhatsApp template." });
    }

    const safeguards = whatsappSafeguards();
    if (!memberIds.length || memberIds.length > safeguards.maxBatchSize) {
        return response.status(400).json({ error: `Choose between 1 and ${safeguards.maxBatchSize} members.` });
    }

    const missingVariables = template.variables.filter(variable => (
        variable !== "name" && !String(variables[variable] || "").trim()
    ));
    if (missingVariables.length) {
        return response.status(400).json({
            error: `Missing template variables: ${missingVariables.join(", ")}.`
        });
    }

    const members = await fetchMembersByIds(memberIds);
    const result = await sendBatch({
        members,
        templateKey,
        requestId: requestId(),
        variableBuilder: member => {
            const populated = {};
            for (const variable of template.variables) {
                populated[variable] = variable === "name"
                    ? memberName(member)
                    : variables[variable];
            }
            return populated;
        }
    });

    await logAction({
        user,
        action: "whatsapp_targeted_sent",
        details: {
            templateKey,
            attempted: result.total,
            sent: result.sent,
            failed: result.failed,
            memberIds: members.map(member => member.id)
        }
    });

    return response.status(200).json(result);
}

module.exports = async function handler(request, response) {
    try {
        if (looksLikeMetaWebhook(request)) {
            return webhookHandler(request, response);
        }

        const action = request.method === "GET"
            ? String(request.query?.action || "diagnostics")
            : String(jsonBody(request).action || "");

        if (request.method === "GET") {
            await requireAdmin(request);
            if (action === "safeguards") {
                return response.status(200).json({ safeguards: whatsappSafeguards() });
            }
            if (action === "templates") {
                return response.status(200).json({ templates: publicTemplates() });
            }
            if (action === "diagnostics") {
                return diagnostics(request, response);
            }
            return response.status(400).json({ error: "Choose a valid WhatsApp action." });
        }

        if (request.method !== "POST") {
            response.setHeader("Allow", "GET, POST");
            return response.status(405).json({ error: "Method not allowed." });
        }

        rateLimit(request, { key: `whatsapp-${action || "unknown"}`, limit: action === "prepare-reminders" ? 45 : 10, windowMs: 60_000 });
        const user = await requireAdmin(request);
        const body = jsonBody(request);

        if (action === "prepare-reminders") {
            return prepareReminders(body, response);
        }
        if (action === "send-reminders") {
            return sendReminders(body, user, response);
        }
        if (action === "send-targeted") {
            return sendTargeted(body, user, response);
        }

        return response.status(400).json({ error: "Choose a valid WhatsApp action." });
    }
    catch (error) {
        return sendError(response, error, "WhatsApp request failed.");
    }
};
