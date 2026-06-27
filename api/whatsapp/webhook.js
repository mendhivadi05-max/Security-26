const { firestore, FieldValue } = require("../_firebaseAdmin");
const { fetchActiveMembers, memberPhone, normalizePhone } = require("../_whatsappService");
const crypto = require("crypto");

const REASON_REPLY_WINDOW_MS = 30 * 60 * 1000;
const REASON_WORD_LIMIT = 50;
const REASON_BUTTON_PAYLOADS = new Set([
    "provide_reason",
    "reason",
    "attendance_reason",
    "absence_reason",
    "provide absence reason",
    "provide reason"
]);

function readRawBody(request) {
    if (typeof request.rawBody === "string") {
        return Promise.resolve(request.rawBody);
    }
    if (Buffer.isBuffer(request.rawBody)) {
        return Promise.resolve(request.rawBody.toString("utf8"));
    }
    if (typeof request.body === "string") {
        return Promise.resolve(request.body);
    }
    if (Buffer.isBuffer(request.body)) {
        return Promise.resolve(request.body.toString("utf8"));
    }

    return new Promise((resolve, reject) => {
        if (!request.readable) {
            resolve(request.body ? JSON.stringify(request.body) : "");
            return;
        }

        let rawBody = "";
        request.setEncoding("utf8");
        request.on("data", chunk => {
            rawBody += chunk;
            if (rawBody.length > 1_000_000) {
                request.destroy();
                reject(new Error("Webhook body is too large."));
            }
        });
        request.on("end", () => resolve(rawBody));
        request.on("error", reject);
    });
}

function timingSafeEqual(left, right) {
    const leftBuffer = Buffer.from(left || "", "utf8");
    const rightBuffer = Buffer.from(right || "", "utf8");
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function parseWebhookBody(request) {
    const rawBody = await readRawBody(request);
    if (!rawBody) {
        return { rawBody: "", body: request.body || {} };
    }

    if (typeof request.body === "object" && request.body !== null && !Buffer.isBuffer(request.body)) {
        return { rawBody, body: request.body };
    }

    return {
        rawBody,
        body: JSON.parse(rawBody)
    };
}

function verifySignature(request, rawBody) {
    const appSecret = process.env.META_WHATSAPP_APP_SECRET;
    if (!appSecret) {
        return process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production";
    }

    const signature = request.headers["x-hub-signature-256"] || "";
    const expected = `sha256=${crypto
        .createHmac("sha256", appSecret)
        .update(rawBody)
        .digest("hex")}`;

    return timingSafeEqual(signature, expected);
}

function verifyWebhook(request, response) {
    const mode = request.query["hub.mode"];
    const token = request.query["hub.verify_token"];
    const challenge = request.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
        return response.status(200).send(challenge);
    }

    return response.status(403).json({ error: "Webhook verification failed." });
}

function cleanDocId(value) {
    return (value || "")
        .toString()
        .replace(/[^\w.-]/g, "_")
        .slice(0, 500);
}

function normalizeButtonValue(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");
}

function isReasonButton(message) {
    if (message.type !== "button" && message.type !== "interactive") {
        return false;
    }

    const values = [
        message.button?.payload,
        message.button?.text,
        message.interactive?.button_reply?.id,
        message.interactive?.button_reply?.title
    ].map(normalizeButtonValue).filter(Boolean);

    return values.some(value => REASON_BUTTON_PAYLOADS.has(value));
}

function cleanReasonText(text) {
    const stripped = String(text || "")
        .replace(/^\s*reason\s*:\s*/i, "")
        .trim();

    const words = stripped.match(/\S+/g) || [];
    return words.slice(0, REASON_WORD_LIMIT).join(" ");
}

async function findMemberByWhatsAppNumber(from) {
    const incomingPhone = normalizePhone(from);
    if (!incomingPhone) {
        return null;
    }

    const members = await fetchActiveMembers();
    return members.find(member => memberPhone(member) === incomingPhone) || null;
}

async function storeReasonReply(message, reason) {
    const member = await findMemberByWhatsAppNumber(message.from || "");
    if (!member) {
        return { handled: false, reason, unmatched: true };
    }

    const now = Date.now();
    const flagRef = firestore().collection("flags").doc(member.id);
    const saved = await firestore().runTransaction(async transaction => {
        const snapshot = await transaction.get(flagRef);
        const flag = snapshot.exists ? snapshot.data() : {};

        if (flag.absenceReason) {
            return false;
        }

        if (
            flag.reasonReplyOpen !== true ||
            Number(flag.reasonReplyExpiresAt || 0) <= now
        ) {
            if (flag.reasonReplyOpen === true) {
                transaction.set(flagRef, {
                    reasonReplyOpen: false,
                    reasonReplyExpiredAt: now
                }, { merge: true });
            }
            return false;
        }

        transaction.set(flagRef, {
            absenceReason: reason,
            absenceReasonAt: now,
            absenceReasonFrom: normalizePhone(message.from || ""),
            absenceReasonMessageId: message.id || "",
            absenceReasonSource: "whatsapp",
            reasonReplyOpen: false,
            reasonReplyClosedAt: now
        }, { merge: true });

        return true;
    });

    if (!saved) {
        return { handled: false, reason, memberId: member.id, ignoredReason: true };
    }

    return { handled: true, reason, memberId: member.id };
}

async function openReasonReplyWindow(message) {
    const member = await findMemberByWhatsAppNumber(message.from || "");
    if (!member) {
        return { handled: false, unmatched: true };
    }

    const now = Date.now();
    const flagRef = firestore().collection("flags").doc(member.id);
    const opened = await firestore().runTransaction(async transaction => {
        const snapshot = await transaction.get(flagRef);
        const flag = snapshot.exists ? snapshot.data() : {};

        if (flag.absenceReason) {
            return false;
        }

        transaction.set(flagRef, {
            reasonReplyOpen: true,
            reasonReplyPromptedAt: now,
            reasonReplyExpiresAt: now + REASON_REPLY_WINDOW_MS,
            reasonReplyButtonMessageId: message.id || "",
            reasonReplyFrom: normalizePhone(message.from || "")
        }, { merge: true });

        return true;
    });

    return {
        handled: opened,
        memberId: member.id,
        reasonWindowOpened: opened,
        ignoredReasonButton: !opened
    };
}

async function storeIncomingMessage(message, metadata, value) {
    const text = message.text?.body || "";
    const reason = message.type === "text" ? cleanReasonText(text) : "";
    const reasonButton = isReasonButton(message);
    const messageDocId = cleanDocId(message.id) || firestore().collection("whatsappIncomingMessages").doc().id;
    const incomingRef = firestore().collection("whatsappIncomingMessages").doc(messageDocId);
    const existing = await incomingRef.get();
    if (existing.exists) {
        console.log("WhatsApp inbound duplicate ignored", {
            messageId: message.id || "",
            from: normalizePhone(message.from || "")
        });
        return;
    }

    const reasonResult = reasonButton
        ? await openReasonReplyWindow(message)
        : reason
            ? await storeReasonReply(message, reason)
            : { handled: false };

    if (!reasonResult.handled) {
        console.log("WhatsApp inbound message ignored", {
            messageId: message.id || "",
            from: normalizePhone(message.from || ""),
            type: message.type || "",
            reasonReply: Boolean(reason),
            reasonButton,
            unmatchedReasonReply: reasonResult.unmatched === true,
            ignoredReason: reasonResult.ignoredReason === true,
            ignoredReasonButton: reasonResult.ignoredReasonButton === true
        });
        return;
    }

    await incomingRef.set({
        messageId: message.id || "",
        from: message.from || "",
        normalizedFrom: normalizePhone(message.from || ""),
        type: message.type || "",
        text: reason || "",
        timestamp: message.timestamp || "",
        phoneNumberId: metadata?.phone_number_id || "",
        displayPhoneNumber: metadata?.display_phone_number || "",
        reason: reasonResult.reason || "",
        matchedMemberId: reasonResult.memberId || "",
        unmatchedReasonReply: reasonResult.unmatched === true,
        reasonButton,
        reasonWindowOpened: reasonResult.reasonWindowOpened === true,
        ignoredReason: reasonResult.ignoredReason === true,
        ignoredReasonButton: reasonResult.ignoredReasonButton === true,
        handled: reasonResult.handled === true,
        createdAt: FieldValue.serverTimestamp()
    });

    console.log("WhatsApp inbound message stored", {
        messageId: message.id || "",
        from: normalizePhone(message.from || ""),
        type: message.type || "",
        reasonReply: Boolean(reason),
        reasonButton,
        reasonWindowOpened: reasonResult.reasonWindowOpened === true,
        handled: reasonResult.handled === true,
        matchedMemberId: reasonResult.memberId || "",
        unmatchedReasonReply: reasonResult.unmatched === true,
        ignoredReason: reasonResult.ignoredReason === true
    });
}

async function handleWebhookEvent(body) {
    const entries = Array.isArray(body.entry) ? body.entry : [];

    for (const entry of entries) {
        const changes = Array.isArray(entry.changes) ? entry.changes : [];
        for (const change of changes) {
            const value = change.value || {};
            const messages = Array.isArray(value.messages) ? value.messages : [];

            for (const message of messages) {
                try {
                    await storeIncomingMessage(message, value.metadata, value);
                }
                catch (error) {
                    console.error("Incoming WhatsApp message storage failed:", error);
                }
            }
        }
    }
}

module.exports = async function handler(request, response) {
    if (request.method === "GET") {
        return verifyWebhook(request, response);
    }

    if (request.method !== "POST") {
        response.setHeader("Allow", "GET, POST");
        return response.status(405).json({ error: "Method not allowed." });
    }

    try {
        const { rawBody, body } = await parseWebhookBody(request);
        if (!verifySignature(request, rawBody)) {
            return response.status(403).json({ error: "Webhook signature verification failed." });
        }

        await handleWebhookEvent(body || {});
    }
    catch (error) {
        console.error("WhatsApp webhook failed:", error);
    }

    return response.status(200).json({ received: true });
};
