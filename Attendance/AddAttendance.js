import { showSuccess, showErrorToast } from "../Shared/Toast.js";
import { loadCollections } from "../Shared/Api.js";

const sessionTitle =
    document.querySelector(".session-details h1");

const hostedBy =
    document.getElementById("hostedBy");

const venue =
    document.getElementById("venue");

const sessionTime =
    document.getElementById("sessionTime");

const sessionNote =
    document.getElementById("sessionNote");

const membersContainer =
    document.getElementById("membersContainer");

const saveButton =
    document.getElementById("saveAttendance");

const urlParams =
    new URLSearchParams(window.location.search);

const sessionId =
    urlParams.get("sessionId");

const pageMode =
    urlParams.get("mode") === "view" ? "view" : "edit";

if (!sessionId) {
    alert("Session not found.");
    window.location.href = "../Home/Home";
}

const attendanceData = {};

let attendanceLocked = false;
let defaultStatus = "Present";
let savedAttendanceRecords = {};
let pageData = {};

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function isLockedAfterTwoDays(sessionDate) {
    if (!sessionDate) {
        return false;
    }

    const meetingDate = new Date(`${sessionDate}T00:00:00`);
    if (Number.isNaN(meetingDate.getTime())) {
        return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lockDate = new Date(meetingDate);
    lockDate.setDate(lockDate.getDate() + 2);

    return today > lockDate;
}

async function loadSession() {
    try {
        const session =
            (pageData.sessions || []).find(item => item.id === sessionId);

        if (!session) {
            alert("Session does not exist.");
            window.location.href = "../Home/Home";
            return;
        }

        sessionTitle.textContent =
            session.title || "Add Attendance";

        hostedBy.textContent =
            session.hostedBy || "Not provided";

        venue.textContent =
            session.venue || "Not provided";

        sessionTime.textContent =
            session.time || "Not provided";

        sessionNote.textContent =
            session.note || session.agenda || "None";

        defaultStatus =
            session.defaultStatus || "Present";

        attendanceLocked =
            pageMode === "view" || isLockedAfterTwoDays(session.date);

        if (attendanceLocked) {
            attendanceLocked = true;
            saveButton.style.display = "none";
            sessionTitle.textContent += pageMode === "view"
                ? " View Only"
                : " Locked";
        }
    }
    catch (error) {
        console.error(error);
        alert("Error loading session.");
    }
}

async function loadSavedAttendance() {
    try {
        savedAttendanceRecords =
            pageData.attendance?.find(item => item.id === sessionId)
                ? pageData.attendance.find(item => item.id === sessionId).records || {}
                : {};
    }
    catch (error) {
        console.error(error);
        showErrorToast("Could not load saved attendance.");
        savedAttendanceRecords = {};
    }
}

async function loadMembers() {
    membersContainer.innerHTML = "";

    try {
        (pageData.members || []).forEach((member) => {

            const savedRecord =
                savedAttendanceRecords[member.id] || {};

            const status =
                savedRecord.status || defaultStatus;

            attendanceData[member.id] = {
                name: savedRecord.name || member.name,
                rollNumber: savedRecord.rollNumber || member.prn || "",
                status
            };

            const checked =
                status === "Present" ? "checked" : "";

            membersContainer.innerHTML += `
                <div class="member-row">
                    <span class="roll-number">${escapeHtml(member.prn || "-")}</span>
                    <span class="member-name">${escapeHtml(member.name || "Unnamed")}</span>

                    <div class="status-cell">
                        <label class="attendance-toggle">
                            <input
                                type="checkbox"
                                ${checked}
                                onchange="setAttendance('${member.id}', this)">
                            <span class="toggle-track"></span>
                        </label>
                        <span class="status-label">${status}</span>
                    </div>
                </div>
            `;
        });

        if (attendanceLocked) {
            document
                .querySelectorAll(".attendance-toggle input")
                .forEach(input => {
                    input.disabled = true;
                    input.style.opacity = "0.5";
                });
        }
    }
    catch (error) {
        console.error(error);
        alert("Error loading members.");
    }
}

window.setAttendance = function (memberId, input) {
    if (attendanceLocked) {
        return;
    }

    const status =
        input.checked ? "Present" : "Absent";

    attendanceData[memberId].status =
        status;

    input
        .closest(".status-cell")
        .querySelector(".status-label")
        .textContent = status;
};

saveButton.onclick = async function () {
    if (attendanceLocked) {
        alert(
            pageMode === "view"
                ? "Open Update Attendance to edit this record."
                : "Attendance locks 2 days after the meeting date."
        );
        return;
    }

    try {
        const response =
            await fetch("/api/attendance/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId,
                    records: attendanceData
                })
            });

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Error saving attendance.");
        }

        const whatsappMessage =
            result.firstSave
                ? ` WhatsApp absent notices: ${result.whatsapp.sent} sent, ${result.whatsapp.failed} failed.`
                : " WhatsApp absent notices were skipped because this attendance was already saved once.";

        showSuccess(`Attendance saved successfully!${whatsappMessage}`);
        window.location.href = "../Home/Home";
    }
    catch (error) {
        console.error(error);
        showErrorToast(error.message || "Error saving attendance.");
    }
};

async function initializePage() {
    pageData = await loadCollections(["sessions", "attendance", "members"], { sessionId });
    await loadSession();
    await loadSavedAttendance();
    await loadMembers();
}

initializePage();
