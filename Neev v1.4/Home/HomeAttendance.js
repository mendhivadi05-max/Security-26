import { db } from "../Firebase/Firebase.js";

import {
    collection,
    addDoc
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const attendanceTile =
    document.getElementById("addAttendanceTile");

const attendanceModal =
    document.getElementById("attendanceSetupModal");

const attendanceForm =
    document.getElementById("attendanceSetupForm");

const cancelButton =
    document.getElementById("cancelAttendanceSetup");

const defaultStatusToggle =
    document.getElementById("defaultAttendanceStatus");

const defaultStatusLabel =
    document.getElementById("defaultAttendanceLabel");

function openAttendanceModal() {
    attendanceModal.style.display = "flex";
}

function closeAttendanceModal() {
    attendanceModal.style.display = "none";
}

function updateDefaultStatusLabel() {
    defaultStatusLabel.textContent =
        defaultStatusToggle.checked ? "Present" : "Absent";
}

attendanceTile.addEventListener("click", (event) => {
    event.preventDefault();
    openAttendanceModal();
});

cancelButton.addEventListener("click", () => {
    closeAttendanceModal();
});

defaultStatusToggle.addEventListener("change", updateDefaultStatusLabel);

attendanceForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title =
        document.getElementById("attendanceTitle").value.trim();

    const hostedBy =
        document.getElementById("attendanceHost").value.trim();

    const venue =
        document.getElementById("attendanceVenue").value.trim();

    const time =
        document.getElementById("attendanceTime").value;

    const note =
        document.getElementById("attendanceNote").value.trim();

    const defaultStatus =
        defaultStatusToggle.checked ? "Present" : "Absent";

    if (title === "" || hostedBy === "" || venue === "" || time === "") {
        alert("Please fill all required attendance details.");
        return;
    }

    try {
        const sessionRef =
            await addDoc(
                collection(db, "sessions"),
                {
                    title,
                    hostedBy,
                    venue,
                    time,
                    note,
                    defaultStatus,
                    date: new Date().toISOString().split("T")[0],
                    locked: false,
                    createdAt: Date.now()
                }
            );

        window.location.href =
            `../Attendance/AddAttendance.html?sessionId=${sessionRef.id}`;
    }
    catch (error) {
        console.error("Attendance setup error:", error);
        alert("Error creating attendance session.");
    }
});

updateDefaultStatusLabel();
