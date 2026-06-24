import { db } from "../Firebase/Firebase.js";
import {
    collection,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

export async function logClientAction(action, details = {}) {
    try {
        await addDoc(collection(db, "actionLogs"), {
            action,
            details,
            actor: {
                username: sessionStorage.getItem("currentUserId") || "Unknown user"
            },
            source: "client",
            createdAt: serverTimestamp(),
            createdAtMs: Date.now()
        });
    }
    catch (error) {
        console.error("Action log failed:", error);
    }
}
