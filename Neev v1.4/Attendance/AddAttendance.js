import { db } from "../Firebase/Firebase.js";

import {
    collection,
    getDocs,
    getDoc,
    doc,
    setDoc
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

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

if (!sessionId) {
    alert("Session not found.");
    window.location.href = "../Home/Home.html";
}

const attendanceData = {};

let attendanceLocked = false;
let defaultStatus = "Present";
let currentSession = null;
let memberHistory = {};
let flagsByMember = {};

async function loadSession() {
    try {
        const sessionRef =
            doc(db, "sessions", sessionId);

        const sessionSnap =
            await getDoc(sessionRef);

        if (!sessionSnap.exists()) {
            alert("Session does not exist.");
            window.location.href = "../Home/Home.html";
            return;
        }

        const session =
            sessionSnap.data();

        currentSession =
            {
                id: sessionId,
                ...session
            };

        sessionTitle.textContent =
            session.title || "Instant Session";

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

        const today =
            new Date()
                .toISOString()
                .split("T")[0];

        if (session.date && session.date !== today) {
            attendanceLocked = true;
            saveButton.style.display = "none";
            sessionTitle.textContent += " Locked";
        }
    }
    catch (error) {
        console.error(error);
        alert("Error loading session.");
    }
}

async function loadAttendanceHistory() {
    memberHistory = {};

    const sessionsSnapshot =
        await getDocs(
            collection(db, "sessions")
        );

    const sessionDetails = {};

    sessionsSnapshot.forEach((sessionDoc) => {
        sessionDetails[sessionDoc.id] =
            {
                id: sessionDoc.id,
                ...sessionDoc.data()
            };
    });

    const attendanceSnapshot =
        await getDocs(
            collection(db, "attendance")
        );

    attendanceSnapshot.forEach((attendanceDoc) => {
        if (attendanceDoc.id === sessionId) {
            return;
        }

        const attendance =
            attendanceDoc.data();

        const records =
            attendance.records || attendance;

        Object.entries(records).forEach(([memberId, record]) => {
            if (!record || typeof record !== "object" || !record.status) {
                return;
            }

            const session =
                sessionDetails[attendanceDoc.id] || {};

            if (!memberHistory[memberId]) {
                memberHistory[memberId] = [];
            }

            memberHistory[memberId].push({
                status: record.status,
                date: session.date || "No date",
                time: session.time || "",
                title: session.title || "Session",
                savedAt: attendance.savedAt || session.createdAt || 0
            });
        });
    });

    Object.keys(memberHistory).forEach((memberId) => {
        memberHistory[memberId].sort((a, b) => b.savedAt - a.savedAt);
    });
}

function renderHistory(memberId) {
    const history =
        memberHistory[memberId] || [];

    if (history.length === 0) {
        return '<span class="history-empty">No past records</span>';
    }

    return history
        .slice(0, 4)
        .map((record) => {
            const statusClass =
                record.status === "Present" ? "present" : "absent";

            const when =
                `${record.date}${record.time ? `, ${record.time}` : ""}`;

            return `
                <span class="history-pill ${statusClass}">
                    ${record.status} - ${when}
                </span>
            `;
        })
        .join("");
}

async function loadMembers() {
    membersContainer.innerHTML = "";

    try {
        const querySnapshot =
            await getDocs(
                collection(db, "members")
            );

        const flagsSnapshot =
            await getDocs(collection(db, "flags"));

        flagsByMember = {};
        flagsSnapshot.forEach(flagDoc => {
            flagsByMember[flagDoc.id] = flagDoc.data();
        });

        querySnapshot.forEach((memberDoc) => {
            const member =
                memberDoc.data();

            attendanceData[memberDoc.id] = {
                name: member.name,
                rollNumber: member.prn || "",
                status: defaultStatus
            };

            const checked =
                defaultStatus === "Present" ? "checked" : "";

            const manuallyFlagged =
                Boolean(flagsByMember[memberDoc.id]?.manualFlag);

            membersContainer.innerHTML += `
                <div class="member-row ${manuallyFlagged ? "is-flagged" : ""}">
                    <span class="roll-number">${member.prn || "-"}</span>
                    <span class="member-name">
                        <strong>${member.name || "Unnamed"}</strong>
                        <span class="member-history">
                            ${renderHistory(memberDoc.id)}
                        </span>
                    </span>

                    <div class="status-cell">
                        <div class="status-actions">
                            <label class="attendance-toggle">
                                <input
                                    type="checkbox"
                                    ${checked}
                                    onchange="setAttendance('${memberDoc.id}', this)">
                                <span class="toggle-track"></span>
                            </label>
                            <span class="status-label">${defaultStatus}</span>
                            <button
                                type="button"
                                class="flag-action ${manuallyFlagged ? "is-flagged" : ""}"
                                onclick="openFlagDialog('${memberDoc.id}', '${escapeAttribute(member.name || "Unnamed")}')">
                                ${manuallyFlagged ? "Flagged" : "Flag person"}
                            </button>
                        </div>
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

function escapeAttribute(value) {
    return value
        .toString()
        .replaceAll("\\", "\\\\")
        .replaceAll("'", "\\'");
}

function ensureFlagDialog() {
    if (document.getElementById("flagDialog")) {
        return;
    }

    document.body.insertAdjacentHTML("beforeend", `
        <div class="flag-dialog" id="flagDialog">
            <form class="flag-dialog-card" id="flagForm">
                <h2>Flag person</h2>
                <p id="flagPersonName"></p>
                <label>
                    Reason
                    <textarea id="flagReason" rows="4" required placeholder="Why does this person need attention?"></textarea>
                </label>
                <div class="flag-dialog-actions">
                    <button type="submit" class="primary-btn">Save flag</button>
                    <button type="button" class="secondary-btn" id="cancelFlag">Cancel</button>
                </div>
            </form>
        </div>
    `);

    document.getElementById("cancelFlag").onclick = closeFlagDialog;
    document.getElementById("flagForm").onsubmit = saveManualFlag;
}

let flagTargetId = "";

window.openFlagDialog = function(memberId, memberName) {
    if (attendanceLocked) {
        return;
    }

    ensureFlagDialog();
    flagTargetId = memberId;
    document.getElementById("flagPersonName").textContent = memberName;
    document.getElementById("flagReason").value =
        flagsByMember[memberId]?.reason || "";
    document.getElementById("flagDialog").classList.add("is-visible");
};

function closeFlagDialog() {
    document.getElementById("flagDialog")?.classList.remove("is-visible");
    flagTargetId = "";
}

async function saveManualFlag(event) {
    event.preventDefault();

    const reason = document.getElementById("flagReason").value.trim();
    if (!reason || !flagTargetId) return;

    await setDoc(
        doc(db, "flags", flagTargetId),
        {
            manualFlag: true,
            reason,
            source: "attendance",
            sessionId,
            flaggedAt: Date.now()
        },
        { merge: true }
    );

    closeFlagDialog();
    await loadMembers();
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
        alert("Attendance is locked.");
        return;
    }

    try {
        await setDoc(
            doc(db, "attendance", sessionId),
            {
                savedAt: Date.now(),
                records: attendanceData
            }
        );

        alert("Attendance saved successfully!");
        window.location.href = "../Home/Home.html";
    }
    catch (error) {
        console.error(error);
        alert("Error saving attendance.");
    }
};

async function initializePage() {
    await loadSession();
    await loadAttendanceHistory();
    await loadMembers();
}

initializePage();
