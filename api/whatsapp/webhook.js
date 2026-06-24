const { firestore, FieldValue } = require("../_firebaseAdmin");

function verifyWebhook(request, response) {
    const mode = request.query["hub.mode"];
    const token = request.query["hub.verify_token"];
    const challenge = request.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
        return response.status(200).send(challenge);
    }

    return response.status(403).json({ error: "Webhook verification failed." });
}

async function storeIncomingMessage(message, metadata, value) {
    await firestore().collection("whatsappIncomingMessages").add({
        messageId: message.id || "",
        from: message.from || "",
        type: message.type || "",
        text: message.text?.body || "",
        timestamp: message.timestamp || "",
        phoneNumberId: metadata?.phone_number_id || "",
        displayPhoneNumber: metadata?.display_phone_number || "",
        raw: value,
        handled: false,
        createdAt: FieldValue.serverTimestamp()
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
        await handleWebhookEvent(request.body || {});
    }
    catch (error) {
        console.error("WhatsApp webhook failed:", error);
    }

    return response.status(200).json({ received: true });
};
