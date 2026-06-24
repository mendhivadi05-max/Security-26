const { firestore, admin } = require("./_firebaseAdmin");

function actorFromUser(user) {
    return {
        uid: user?.localId || user?.uid || "",
        email: user?.email || "",
        displayName: user?.displayName || user?.email?.split("@")[0] || "Unknown user"
    };
}

async function logAction({ user, action, details = {}, source = "server" }) {
    try {
        await firestore().collection("actionLogs").add({
            action,
            details,
            actor: actorFromUser(user),
            source,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAtMs: Date.now()
        });
    }
    catch (error) {
        console.error("Action log failed:", error);
    }
}

module.exports = {
    logAction
};
