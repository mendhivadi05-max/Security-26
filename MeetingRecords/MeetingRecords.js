import { db } from "../Firebase/Firebase.js";
import { showSuccess, showErrorToast } from "../Shared/Toast.js";
import { logClientAction } from "../Shared/ActionLog.js";

import {
    collection,
    getDocs,
    deleteDoc,
    doc
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";


const recordsContainer =
    document.getElementById("recordsContainer");


async function loadMeetings() {

    recordsContainer.innerHTML = "";


    try {

        const querySnapshot =
            await getDocs(
                collection(db, "sessions")
            );


        const sessions = [];


        querySnapshot.forEach((sessionDoc) => {

            sessions.push({

                id: sessionDoc.id,

                ...sessionDoc.data()

            });

        });


        sessions.sort((a, b) =>

            b.createdAt - a.createdAt

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

            recordsContainer.innerHTML += `

                <div class="session-card">

                    <h2>

                        ${session.title}

                    </h2>

                    <p>

                        Hosted By:
                        ${session.hostedBy}

                    </p>

                    <p>

                        Date:
                        ${session.date}

                    </p>

                    <p>

                        Time:
                        ${session.time}

                    </p>

                    <p>

                        Venue:
                        ${session.venue}

                    </p>

                    <p>

                        Description:
                        ${session.note || session.agenda || "None"}

                    </p>

                    <button
                        onclick="viewAttendance('${session.id}')">

                        View Attendance

                    </button>

                    <button
                        onclick="deleteMeeting('${session.id}')">

                        Delete Meeting

                    </button>

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


window.viewAttendance = function (
    sessionId
) {

    window.location.href =

        `../Attendance/AddAttendance.html?sessionId=${sessionId}`;

};


window.deleteMeeting = async function (
    sessionId
) {

    const confirmDelete =
        confirm(

            "Delete this meeting permanently?"

        );


    if (!confirmDelete) {

        return;

    }


    try {

        await deleteDoc(

            doc(

                db,

                "sessions",

                sessionId

            )

        );


        showSuccess("Meeting deleted successfully.");
        await logClientAction("meeting_deleted", { sessionId });


        loadMeetings();

    }

    catch (error) {

        console.error(error);

        showErrorToast("Error deleting meeting.");

    }

};


loadMeetings();
