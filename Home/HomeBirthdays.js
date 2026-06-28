import { loadCollections } from "../Shared/Api.js";

async function loadVolunteerBirthdays() {
    const data =
        await loadCollections(["birthdays"]);

    const birthdays = {};

    (data.birthdays || []).forEach(memberDoc => {
        const member =
            memberDoc;

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
            branch: member.branch || member.course || "No branch",
            course: member.branch || member.course || "No branch"
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
