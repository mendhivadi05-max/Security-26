import { db } from "../Firebase/Firebase.js";

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

        alert(
            "Error loading meeting records."
        );

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


        alert(
            "Meeting deleted successfully."
        );


        loadMeetings();

    }

    catch (error) {

        console.error(error);

        alert(
            "Error deleting meeting."
        );

    }

};


loadMeetings();
