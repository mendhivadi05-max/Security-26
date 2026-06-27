import { showSuccess, showErrorToast } from "../Shared/Toast.js";
import { apiPost, loadCollections } from "../Shared/Api.js";

const recordsContainer =
    document.getElementById("recordsContainer");

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function isAttendanceLocked(session) {
    if (!session.date) {
        return false;
    }

    const meetingDate = new Date(`${session.date}T00:00:00`);
    if (Number.isNaN(meetingDate.getTime())) {
        return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lockDate = new Date(meetingDate);
    lockDate.setDate(lockDate.getDate() + 2);

    return today > lockDate;
}

async function loadMeetings() {
    recordsContainer.innerHTML = "";

    try {
        const data = await loadCollections(["sessions"]);
        const sessions = data.sessions || [];

        sessions.sort((a, b) =>
            (b.createdAt || 0) - (a.createdAt || 0)
        );

        if (sessions.length === 0) {
            recordsContainer.innerHTML = `
                <div class="empty-state-panel">
                    <strong>No meeting records yet.</strong>
                    <span>Create an instant session from the dashboard to start tracking attendance.</span>
                </div>
            `;
            return;
        }

        sessions.forEach((session) => {
            const locked = isAttendanceLocked(session);
            const updateButton = locked
                ? `<button type="button" disabled title="Attendance locks 2 days after the meeting date">Attendance Locked</button>`
                : `<button type="button" onclick="updateAttendance('${session.id}')">Update Attendance</button>`;

            recordsContainer.innerHTML += `
                <div class="session-card">
                    <h2>${escapeHtml(session.title || "Untitled Meeting")}</h2>
                    <p>Hosted By: ${escapeHtml(session.hostedBy || "Not provided")}</p>
                    <p>Date: ${escapeHtml(session.date || "Not provided")}</p>
                    <p>Time: ${escapeHtml(session.time || "Not provided")}</p>
                    <p>Venue: ${escapeHtml(session.venue || "Not provided")}</p>
                    <p>Description: ${escapeHtml(session.note || session.agenda || "None")}</p>

                    <div class="session-actions">
                        <button type="button" onclick="viewAttendance('${session.id}')">
                            View Attendance
                        </button>
                        ${updateButton}
                        <button type="button" onclick="deleteMeeting('${session.id}')">
                            Delete Meeting
                        </button>
                    </div>
                </div>
            `;
        });
    }
    catch (error) {
        console.error(error);

        recordsContainer.innerHTML = `
            <div class="empty-state-panel">
                <strong>Could not load meeting records.</strong>
                <span>Please refresh and try again.</span>
            </div>
        `;
        showErrorToast("Error loading meeting records.");
    }
}

window.viewAttendance = function (sessionId) {
    window.location.href =
        `../Attendance/AddAttendance?sessionId=${sessionId}&mode=view`;
};

window.updateAttendance = function (sessionId) {
    window.location.href =
        `../Attendance/AddAttendance?sessionId=${sessionId}&mode=edit`;
};

window.deleteMeeting = async function (sessionId) {
    const confirmDelete =
        confirm("Delete this meeting permanently?");

    if (!confirmDelete) {
        return;
    }

    try {
        await apiPost("/api/data", {
            action: "deleteSession",
            sessionId
        });

        showSuccess("Meeting deleted successfully.");
        loadMeetings();
    }
    catch (error) {
        console.error(error);
        showErrorToast("Error deleting meeting.");
    }
};

loadMeetings();
