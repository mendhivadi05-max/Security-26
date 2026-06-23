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

async function loadMembers() {
    membersContainer.innerHTML = "";

    try {
        const querySnapshot =
            await getDocs(
                collection(db, "members")
            );

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

            membersContainer.innerHTML += `
                <div class="member-row">
                    <span class="roll-number">${member.prn || "-"}</span>
                    <span class="member-name">${member.name || "Unnamed"}</span>

                    <div class="status-cell">
                        <label class="attendance-toggle">
                            <input
                                type="checkbox"
                                ${checked}
                                onchange="setAttendance('${memberDoc.id}', this)">
                            <span class="toggle-track"></span>
                        </label>
                        <span class="status-label">${defaultStatus}</span>
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
    await loadMembers();
}

initializePage();
