import { showErrorToast } from "../Shared/Toast.js";
import { apiPost } from "../Shared/Api.js";

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
        showErrorToast("Please fill all required attendance details.");
        return;
    }

    try {
        const result =
            await apiPost("/api/data", {
                action: "createSession",
                session: {
                    title,
                    hostedBy,
                    venue,
                    time,
                    note,
                    defaultStatus
                }
            });

        window.location.href =
            `../Attendance/AddAttendance?sessionId=${result.id}`;
    }
    catch (error) {
        console.error("Attendance setup error:", error);
        showErrorToast("Error creating attendance session.");
    }
});

updateDefaultStatusLabel();
