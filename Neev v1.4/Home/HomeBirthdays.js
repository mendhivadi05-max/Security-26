import { db } from "../Firebase/Firebase.js";

import {
    collection,
    getDocs
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

async function loadVolunteerBirthdays() {
    const snapshot =
        await getDocs(collection(db, "members"));

    const birthdays = {};

    snapshot.forEach(memberDoc => {
        const member =
            memberDoc.data();

        const dateOfBirth =
            (member.dateOfBirth || "").toString();

        const match =
            dateOfBirth.match(/^\d{4}-(\d{2})-(\d{2})$/);

        if (!match) {
            return;
        }

        const key =
            `${match[1]}-${match[2]}`;

        if (!birthdays[key]) {
            birthdays[key] = [];
        }

        birthdays[key].push({
            id: memberDoc.id,
            name: member.name || "Unnamed volunteer",
            course: member.course || "No course",
            batch: member.batch || "No batch"
        });
    });

    window.dispatchEvent(
        new CustomEvent("volunteer-birthdays-loaded", {
            detail: birthdays
        })
    );
}

loadVolunteerBirthdays().catch(error => {
    console.error("Birthday load error:", error);
});
