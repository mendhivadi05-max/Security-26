const { jsonBody, rateLimit, requestId, requireAdmin, sendError } = require("../_apiUtils");
const { logAction } = require("../_actionLog");
const { firestore, FieldValue } = require("../_firebaseAdmin");
const { fetchActiveMembers, fetchMembersByIds, memberName, sendBatch } = require("../_whatsappService");

module.exports = async function handler(request, response) {
    if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        return response.status(405).json({ error: "Method not allowed." });
    }

    try {
        rateLimit(request, { key: "send-reminders", limit: 6, windowMs: 60_000 });
        const user = await requireAdmin(request);

        const body = jsonBody(request);
        const meetingTime = (body.meetingTime || "").toString().trim();
        if (!meetingTime) {
            return response.status(400).json({ error: "Meeting time is required." });
        }

        const memberIds = Array.isArray(body.memberIds) ? body.memberIds.filter(Boolean) : [];
        if (memberIds.length > 200) {
            return response.status(400).json({ error: "Choose no more than 200 members." });
        }

        const members = memberIds.length
            ? await fetchMembersByIds(memberIds)
            : await fetchActiveMembers();
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
                lastReminderSentAt: sendResult.ok
                    ? FieldValue.serverTimestamp()
                    : null,
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
    catch (error) {
        return sendError(response, error, "Could not send meeting reminders.");
    }
};
