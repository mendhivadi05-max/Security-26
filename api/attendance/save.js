const { firestore, FieldValue } = require("../_firebaseAdmin");
const { jsonBody, rateLimit, requestId, requireAdmin, sendError } = require("../_apiUtils");
const { logAction } = require("../_actionLog");
const { memberName, sendBatch } = require("../_whatsappService");

module.exports = async function handler(request, response) {
    if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        return response.status(405).json({ error: "Method not allowed." });
    }

    try {
        rateLimit(request, { key: "attendance-save", limit: 20, windowMs: 60_000 });
        const user = await requireAdmin(request);

        const body = jsonBody(request);
        const sessionId = (body.sessionId || "").toString().trim();
        const records = body.records && typeof body.records === "object" ? body.records : null;

        if (!sessionId || !records) {
            return response.status(400).json({ error: "Session and attendance records are required." });
        }

        const normalizedRecords = Object.fromEntries(
            Object.entries(records)
                .filter(([memberId]) => memberId)
                .map(([memberId, record]) => [
                    memberId,
                    {
                        name: String(record?.name || "Unnamed"),
                        rollNumber: String(record?.rollNumber || ""),
                        status: record?.status === "Absent" ? "Absent" : "Present"
                    }
                ])
        );

        if (!Object.keys(normalizedRecords).length) {
            return response.status(400).json({ error: "At least one attendance record is required." });
        }

        const db = firestore();
        const sessionSnap = await db.collection("sessions").doc(sessionId).get();
        if (!sessionSnap.exists) {
            return response.status(404).json({ error: "Session not found." });
        }

        const session = sessionSnap.data();
        const attendanceRef = db.collection("attendance").doc(sessionId);
        const existingAttendance = await attendanceRef.get();
        const isFirstSave = !existingAttendance.exists;

        await attendanceRef.set({
            savedAt: Date.now(),
            savedAtServer: FieldValue.serverTimestamp(),
            records: normalizedRecords
        }, { merge: true });

        const absentMemberIds = isFirstSave
            ? Object.entries(normalizedRecords)
            .filter(([, record]) => record?.status === "Absent")
            .map(([memberId]) => memberId)
            : [];

        const absentMembers = [];
        for (const memberId of absentMemberIds) {
            const memberSnap = await db.collection("members").doc(memberId).get();
            if (memberSnap.exists) {
                absentMembers.push({ id: memberSnap.id, ...memberSnap.data() });
            }
        }

        let whatsapp = {
            total: absentMembers.length,
            sent: 0,
            failed: 0,
            results: []
        };

        try {
            whatsapp = await sendBatch({
                members: absentMembers,
                templateKey: "absentNotice",
                requestId: requestId(),
                variableBuilder: member => ({
                    name: memberName(member),
                    meeting_name: session.title || "the club",
                    date: session.date || new Date().toISOString().split("T")[0],
                    time: session.time || "the scheduled time"
                })
            });
        }
        catch (whatsappError) {
            console.error("Absent WhatsApp notices failed after attendance save:", whatsappError);
            whatsapp = {
                total: absentMembers.length,
                sent: 0,
                failed: absentMembers.length,
                results: absentMembers.map(member => ({
                    ok: false,
                    memberId: member.id,
                    error: whatsappError.message || "WhatsApp send failed."
                }))
            };
        }

        await logAction({
            user,
            action: "attendance_saved",
            details: {
                sessionId,
                sessionTitle: session.title || "",
                firstSave: isFirstSave,
                absentCount: absentMembers.length,
                whatsappSent: whatsapp.sent,
                whatsappFailed: whatsapp.failed
            }
        });

        return response.status(200).json({
            saved: true,
            firstSave: isFirstSave,
            absentCount: absentMembers.length,
            whatsapp
        });
    }
    catch (error) {
        return sendError(response, error, "Could not save attendance.");
    }
};
