const { FieldPath, FieldValue, firestore } = require("./_firebaseAdmin");
const { jsonBody, rateLimit, requireAdmin, sendError } = require("./_apiUtils");
const { logAction } = require("./_actionLog");

const READABLE_COLLECTIONS = new Set([
    "members",
    "birthdays",
    "sessions",
    "attendance",
    "flags",
    "memberNotes",
    "whatsappMessages",
    "actionLogs"
]);

const WRITABLE_COLLECTIONS = new Set([
    "members",
    "sessions",
    "flags",
    "memberNotes"
]);

function cleanId(value) {
    const id = String(value || "").trim();
    if (!id || id.includes("/") || id.includes("..")) {
        return "";
    }
    return id;
}

function cleanString(value, maxLength = 500) {
    return String(value || "").trim().slice(0, maxLength);
}

function cleanImage(value) {
    const image = String(value || "");
    if (!image) {
        return "";
    }
    if (!image.startsWith("data:image/") || image.length > 900_000) {
        const error = new Error("Volunteer image is invalid or too large.");
        error.statusCode = 400;
        throw error;
    }
    return image;
}

function timestampValue(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : Date.now();
}

function boundedLimit(value, fallback, max) {
    const limit = Number(value);
    if (!Number.isFinite(limit) || limit <= 0) {
        return fallback;
    }
    return Math.min(max, Math.floor(limit));
}

async function assertMemberExists(db, memberId) {
    const snapshot = await db.collection("members").doc(memberId).get();
    if (!snapshot.exists) {
        const error = new Error("Volunteer not found.");
        error.statusCode = 404;
        throw error;
    }
    return snapshot;
}

async function readCollection(db, collectionName, request) {
    const sessionId = cleanId(request.query.sessionId);

    if (collectionName === "birthdays") {
        const snapshot = await db.collection("members").get();
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name || data.profile?.name || "Unnamed volunteer",
                branch: data.branch || data.profile?.branch || data.course || data.profile?.course || "No branch",
                course: data.branch || data.profile?.branch || data.course || data.profile?.course || "No branch",
                dateOfBirth: data.dateOfBirth || data.profile?.dateOfBirth || ""
            };
        });
    }

    if ((collectionName === "sessions" || collectionName === "attendance") && sessionId) {
        const doc = await db.collection(collectionName).doc(sessionId).get();
        return doc.exists ? [{ id: doc.id, ...doc.data() }] : [];
    }

    if (collectionName === "actionLogs") {
        const limit = boundedLimit(request.query.limit, 250, 1000);
        const snapshot = await db.collection(collectionName)
            .orderBy("createdAtMs", "desc")
            .limit(limit)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    if (collectionName === "whatsappMessages") {
        const limit = boundedLimit(request.query.limit, 250, 1000);
        const snapshot = await db.collection(collectionName)
            .orderBy("createdAtMs", "desc")
            .limit(limit)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    const snapshot = await db.collection(collectionName).get();
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
}

function memberPayload(input, existing = {}) {
    const name = cleanString(input.name, 120);
    const dateOfBirth = cleanString(input.dateOfBirth, 20);
    const gender = cleanString(input.gender, 40);
    const branch = cleanString(input.branch || input.course, 120);
    const whatsappNumber = cleanString(input.whatsappNumber, 40);
    const image = cleanImage(input.image);
    const now = Date.now();
    const createdAt = timestampValue(existing.createdAt || existing.metadata?.createdAt || input.createdAt || now);

    if (!name || !dateOfBirth || !gender || !branch || !whatsappNumber) {
        const error = new Error("All required volunteer fields must be filled.");
        error.statusCode = 400;
        throw error;
    }

    if (branch.toLowerCase() === "other") {
        const error = new Error("Enter the branch name.");
        error.statusCode = 400;
        throw error;
    }

    if (!/^[\w\s&.,'()/-]{2,80}$/i.test(branch)) {
        const error = new Error("Branch name contains unsupported characters.");
        error.statusCode = 400;
        throw error;
    }

    return {
        name,
        dateOfBirth,
        gender,
        course: branch,
        branch,
        whatsappNumber,
        image,
        active: input.active !== false,
        sendReminder: input.sendReminder === true,
        phone: whatsappNumber,
        updatedAt: now,
        createdAt,
        profile: { name, dateOfBirth, gender, course: branch, branch, image },
        contact: { whatsappNumber },
        metadata: {
            createdAt,
            updatedAt: now,
            schemaVersion: 2
        }
    };
}

function sessionPayload(input) {
    const title = cleanString(input.title, 160);
    const hostedBy = cleanString(input.hostedBy, 120);
    const venue = cleanString(input.venue, 160);
    const time = cleanString(input.time, 40);
    const note = cleanString(input.note, 1000);
    const defaultStatus = input.defaultStatus === "Absent" ? "Absent" : "Present";

    if (!title || !hostedBy || !venue || !time) {
        const error = new Error("All required attendance session fields must be filled.");
        error.statusCode = 400;
        throw error;
    }

    return {
        title,
        hostedBy,
        venue,
        time,
        note,
        defaultStatus,
        date: cleanString(input.date, 20) || new Date().toISOString().split("T")[0],
        locked: input.locked === true,
        createdAt: Date.now()
    };
}

async function listCollections(request, response) {
    rateLimit(request, { key: "data-read", limit: 90, windowMs: 60_000 });
    await requireAdmin(request);

    const requested = String(request.query.collections || "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);
    const collections = requested.filter(name => READABLE_COLLECTIONS.has(name));
    if (!collections.length || collections.length !== requested.length) {
        return response.status(400).json({ error: "Choose valid collections to load." });
    }

    const db = firestore();
    const result = {};
    await Promise.all(collections.map(async collectionName => {
        result[collectionName] = await readCollection(db, collectionName, request);
    }));

    return response.status(200).json({ collections: result });
}

async function deleteVolunteer(db, memberId) {
    const batches = [];
    let batch = db.batch();
    let operationCount = 0;

    function queue(operation) {
        if (operationCount >= 450) {
            batches.push(batch);
            batch = db.batch();
            operationCount = 0;
        }
        operation(batch);
        operationCount += 1;
    }

    queue(currentBatch => currentBatch.delete(db.collection("members").doc(memberId)));
    queue(currentBatch => currentBatch.delete(db.collection("memberNotes").doc(memberId)));
    queue(currentBatch => currentBatch.delete(db.collection("flags").doc(memberId)));

    const attendanceSnapshot = await db.collection("attendance").get();
    attendanceSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.records && Object.hasOwn(data.records, memberId)) {
            queue(currentBatch => {
                currentBatch.update(
                    doc.ref,
                    new FieldPath("records", memberId),
                    FieldValue.delete()
                );
            });
        }
        else if (Object.hasOwn(data, memberId)) {
            queue(currentBatch => {
                currentBatch.update(
                    doc.ref,
                    new FieldPath(memberId),
                    FieldValue.delete()
                );
            });
        }
    });

    batches.push(batch);
    await Promise.all(batches.map(currentBatch => currentBatch.commit()));
}

async function mutate(request, response) {
    rateLimit(request, { key: "data-write", limit: 40, windowMs: 60_000 });
    const user = await requireAdmin(request);
    const body = jsonBody(request);
    const action = String(body.action || "");
    const db = firestore();

    if (action === "createMember") {
        const payload = memberPayload(body.member || {});
        const ref = await db.collection("members").add(payload);
        await logAction({ user, action: "volunteer_created", details: { memberId: ref.id, name: payload.name } });
        return response.status(200).json({ id: ref.id, member: { id: ref.id, ...payload } });
    }

    if (action === "updateMember") {
        const memberId = cleanId(body.memberId);
        if (!memberId) {
            return response.status(400).json({ error: "Volunteer id is required." });
        }
        const ref = db.collection("members").doc(memberId);
        const snapshot = await ref.get();
        if (!snapshot.exists) {
            return response.status(404).json({ error: "Volunteer not found." });
        }
        const payload = memberPayload(body.member || {}, snapshot.data());
        await ref.set(payload, { merge: true });
        await logAction({ user, action: "volunteer_updated", details: { memberId, name: payload.name } });
        return response.status(200).json({ id: memberId, member: { id: memberId, ...payload } });
    }

    if (action === "deleteMember") {
        const memberId = cleanId(body.memberId);
        if (!memberId) {
            return response.status(400).json({ error: "Volunteer id is required." });
        }
        await deleteVolunteer(db, memberId);
        await logAction({ user, action: "volunteer_deleted", details: { memberId } });
        return response.status(200).json({ deleted: true });
    }

    if (action === "createSession") {
        const payload = sessionPayload(body.session || {});
        const ref = await db.collection("sessions").add(payload);
        await logAction({ user, action: "attendance_session_created", details: { sessionId: ref.id, title: payload.title } });
        return response.status(200).json({ id: ref.id, session: { id: ref.id, ...payload } });
    }

    if (action === "deleteSession") {
        const sessionId = cleanId(body.sessionId);
        if (!sessionId) {
            return response.status(400).json({ error: "Session id is required." });
        }
        const batch = db.batch();
        batch.delete(db.collection("sessions").doc(sessionId));
        batch.delete(db.collection("attendance").doc(sessionId));
        await batch.commit();
        await logAction({ user, action: "meeting_deleted", details: { sessionId } });
        return response.status(200).json({ deleted: true });
    }

    if (action === "setFlagContacted") {
        const memberId = cleanId(body.memberId);
        const streak = Math.min(365, Math.max(0, Number(body.streak) || 0));
        if (!memberId) {
            return response.status(400).json({ error: "Volunteer id is required." });
        }
        await assertMemberExists(db, memberId);
        await db.collection("flags").doc(memberId).set({
            contactedAtStreak: streak,
            contactedAt: Date.now()
        }, { merge: true });
        await logAction({ user, action: "flag_marked_contacted", details: { memberId, streak } });
        return response.status(200).json({ saved: true });
    }

    if (action === "setManualFlag") {
        const memberId = cleanId(body.memberId);
        const reason = cleanString(body.reason, 1000);
        if (!memberId || !reason) {
            return response.status(400).json({ error: "Volunteer id and reason are required." });
        }
        await assertMemberExists(db, memberId);
        await db.collection("flags").doc(memberId).set({
            manualFlag: true,
            reason,
            source: "profile",
            flaggedAt: Date.now()
        }, { merge: true });
        await logAction({ user, action: "manual_flag_saved", details: { memberId } });
        return response.status(200).json({ saved: true });
    }

    if (action === "removeManualFlag") {
        const memberId = cleanId(body.memberId);
        if (!memberId) {
            return response.status(400).json({ error: "Volunteer id is required." });
        }
        await assertMemberExists(db, memberId);
        await db.collection("flags").doc(memberId).set({
            manualFlag: FieldValue.delete(),
            reason: FieldValue.delete(),
            source: FieldValue.delete(),
            flaggedAt: FieldValue.delete()
        }, { merge: true });
        await logAction({ user, action: "manual_flag_removed", details: { memberId } });
        return response.status(200).json({ saved: true });
    }

    if (action === "setNotes") {
        const memberId = cleanId(body.memberId);
        const notes = Array.isArray(body.notes) ? body.notes.slice(0, 100).map(note => ({
            text: cleanString(note.text, 1000),
            createdAt: timestampValue(note.createdAt)
        })).filter(note => note.text) : [];
        if (!memberId) {
            return response.status(400).json({ error: "Volunteer id is required." });
        }
        await db.collection("memberNotes").doc(memberId).set({
            notes,
            updatedAt: Date.now()
        });
        await logAction({ user, action: "member_notes_updated", details: { memberId, noteCount: notes.length } });
        return response.status(200).json({ saved: true, notes });
    }

    if (action === "updateMemberReminderSelection") {
        const members = Array.isArray(body.members) ? body.members : [];
        if (members.length > 500) {
            return response.status(400).json({ error: "Too many members in one request." });
        }
        const batch = db.batch();
        members.forEach(member => {
            const memberId = cleanId(member.id);
            if (!memberId || !WRITABLE_COLLECTIONS.has("members")) {
                return;
            }
            batch.set(db.collection("members").doc(memberId), {
                active: member.sendReminder ? true : member.active !== false,
                sendReminder: member.sendReminder === true,
                reminderStatus: member.sendReminder ? "ready" : "not_selected"
            }, { merge: true });
        });
        await batch.commit();
        await logAction({ user, action: "whatsapp_reminder_selection_saved", details: { selectedCount: members.filter(member => member.sendReminder === true).length } });
        return response.status(200).json({ saved: true });
    }

    return response.status(400).json({ error: "Choose a valid data action." });
}

module.exports = async function handler(request, response) {
    try {
        if (request.method === "GET") {
            return await listCollections(request, response);
        }
        if (request.method === "POST") {
            return await mutate(request, response);
        }
        response.setHeader("Allow", "GET, POST");
        return response.status(405).json({ error: "Method not allowed." });
    }
    catch (error) {
        return sendError(response, error, "Data request failed.");
    }
};
