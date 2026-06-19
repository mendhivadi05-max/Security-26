import { db } from "../Firebase/Firebase.js";

import {
    collection,
    getDocs,
    doc,
    setDoc
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const searchInput =
    document.getElementById("volunteerSearch");

const searchResults =
    document.getElementById("searchResults");

const recordDetail =
    document.getElementById("recordDetail");

let volunteers = [];
let sessionsById = {};
let attendanceByMember = {};
let flagsByMember = {};
let notesByMember = {};
let selectedVolunteerId = "";

function initials(name) {
    return (name || "?")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part[0])
        .join("")
        .toUpperCase();
}

function avatarMarkup(volunteer, extraClass = "") {
    if (volunteer.image) {
        return `
            <div class="avatar ${extraClass}" style="background-image:url('${volunteer.image}')"></div>
        `;
    }

    return `
        <div class="avatar ${extraClass}">
            ${initials(volunteer.name)}
        </div>
    `;
}

function normalize(value) {
    return (value || "").toString().toLowerCase();
}

function escapeHtml(value) {
    return (value || "")
        .toString()
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getMatches(term) {
    const query =
        normalize(term);

    if (query === "") {
        return [];
    }

    return volunteers
        .filter(volunteer => {
            const name =
                normalize(volunteer.name);

            const course =
                normalize(volunteer.course);

            const batch =
                normalize(volunteer.batch);

            return (
                name.startsWith(query) ||
                name.includes(query) ||
                course.includes(query) ||
                batch.includes(query)
            );
        })
        .slice(0, 10);
}

function renderResults(matches) {
    if (searchInput.value.trim() === "") {
        searchResults.innerHTML = "";
        return;
    }

    if (matches.length === 0) {
        searchResults.innerHTML =
            '<div class="no-results">No matching volunteers found.</div>';
        return;
    }

    searchResults.innerHTML =
        matches
            .map(volunteer => `
                <button class="result-row" data-id="${volunteer.id}">
                    ${avatarMarkup(volunteer)}
                    <span>
                        <strong>${escapeHtml(volunteer.name || "Unnamed")}</strong>
                        <small>${escapeHtml(volunteer.course || "No course")} - ${escapeHtml(volunteer.batch || "No batch")}</small>
                    </span>
                    ${notesByMember[volunteer.id]?.length ? '<span class="alert-mark">!</span>' : ""}
                </button>
            `)
            .join("");
}

function attendanceSummary(memberId) {
    const records =
        attendanceByMember[memberId] || [];

    const counted =
        records.filter(record => record.status === "Present" || record.status === "Absent");

    const present =
        counted.filter(record => record.status === "Present").length;

    const absent =
        counted.filter(record => record.status === "Absent").length;

    const percentage =
        counted.length === 0 ? 0 : Math.round((present / counted.length) * 100);

    return {
        records,
        counted,
        present,
        absent,
        percentage
    };
}

function renderCalendar(records) {
    const recentRecords =
        [...records]
            .sort((a, b) => b.savedAt - a.savedAt)
            .slice(0, 16);

    if (recentRecords.length === 0) {
        return '<div class="calendar-empty">No attendance yet</div>';
    }

    return recentRecords
        .map(record => {
            const className =
                record.status === "Present" ? "present-box" : "absent-box";

            return `
                <div class="calendar-box ${className}" title="${record.title} - ${record.date}">
                    ${record.status === "Present" ? "P" : "A"}
                </div>
            `;
        })
        .join("");
}

function renderNotes(memberId) {
    const notes =
        notesByMember[memberId] || [];

    if (notes.length === 0) {
        return '<p class="muted">No comments yet.</p>';
    }

    return notes
        .map(note => `
            <div class="note-item">
                <div class="note-copy">
                    <p>${escapeHtml(note.text)}</p>
                    <small>${new Date(note.createdAt).toLocaleString()}</small>
                </div>
                <button
                    type="button"
                    class="delete-note-btn"
                    data-note-created-at="${note.createdAt}"
                    aria-label="Delete note"
                    title="Delete note">
                    &times;
                </button>
            </div>
        `)
        .join("");
}

function renderVolunteer(volunteer) {
    selectedVolunteerId =
        volunteer.id;

    const summary =
        attendanceSummary(volunteer.id);

    const notes =
        notesByMember[volunteer.id] || [];

    const flag =
        flagsByMember[volunteer.id] || {};

    const flagged =
        Boolean(flag.manualFlag || flag.contactedAtStreak);

    recordDetail.innerHTML = `
        <article class="profile-card">
            <div class="profile-top">
                ${avatarMarkup(volunteer, "large-avatar")}
                <div style="flex:1">
                    <div class="profile-heading-row">
                        <div>
                            <h2 class="profile-name">
                                ${escapeHtml(volunteer.name || "Unnamed")}
                                ${flagged ? '<span class="profile-alert">!</span>' : ""}
                            </h2>
                            ${flag.manualFlag ? `<p class="profile-flag-copy">${escapeHtml(flag.reason || "Flagged for attention")}</p>` : ""}
                        </div>
                        <button type="button" id="profileFlagButton" class="flag-action ${flag.manualFlag ? "is-flagged" : ""}">
                            ${flag.manualFlag ? "Update flag" : "Flag person"}
                        </button>
                    </div>
                    <dl class="detail-list">
                        <div><dt>Date of Birth</dt><dd>${escapeHtml(volunteer.dateOfBirth || "Not provided")}</dd></div>
                        <div><dt>Gender</dt><dd>${escapeHtml(volunteer.gender || "Not provided")}</dd></div>
                        <div><dt>Course</dt><dd>${escapeHtml(volunteer.course || "Not provided")}</dd></div>
                        <div><dt>Batch</dt><dd>${escapeHtml(volunteer.batch || "Not provided")}</dd></div>
                    </dl>
                </div>
            </div>

            <div class="record-grid">
                <section class="attendance-card">
                    <h3>Attendance</h3>
                    <div
                        class="pie-chart"
                        style="--present:${summary.percentage}">
                        <span>${summary.percentage}%</span>
                    </div>
                    <p>${summary.present} present, ${summary.absent} absent</p>
                </section>

                <section class="calendar-card">
                    <h3>Recent Attendance</h3>
                    <div class="mini-calendar">
                        ${renderCalendar(summary.counted)}
                    </div>
                </section>
            </div>

            <section class="notes-card">
                <h3>Comments / Notes</h3>
                <div id="notesList">
                    ${renderNotes(volunteer.id)}
                </div>
                <form id="noteForm" class="note-form">
                    <textarea id="noteText" rows="3" placeholder="Add a comment or note"></textarea>
                    <button type="submit" class="primary-btn">Add Note</button>
                </form>
            </section>
        </article>
    `;

    document
        .getElementById("noteForm")
        .addEventListener("submit", saveNote);

    document
        .getElementById("notesList")
        .addEventListener("click", deleteNote);

    document
        .getElementById("profileFlagButton")
        .addEventListener("click", () => openProfileFlagDialog(volunteer));
}

function ensureProfileFlagDialog() {
    if (document.getElementById("profileFlagDialog")) return;

    document.body.insertAdjacentHTML("beforeend", `
        <div class="flag-dialog" id="profileFlagDialog">
            <form class="flag-dialog-card" id="profileFlagForm">
                <h2>Flag person</h2>
                <p id="profileFlagName"></p>
                <label>
                    Reason
                    <textarea id="profileFlagReason" rows="4" required placeholder="Why does this person need attention?"></textarea>
                </label>
                <div class="flag-dialog-actions">
                    <button type="submit" class="primary-btn">Save flag</button>
                    <button type="button" class="secondary-btn" id="cancelProfileFlag">Cancel</button>
                </div>
            </form>
        </div>
    `);

    document.getElementById("cancelProfileFlag").onclick =
        () => document.getElementById("profileFlagDialog").classList.remove("is-visible");
    document.getElementById("profileFlagForm").onsubmit = saveProfileFlag;
}

function openProfileFlagDialog(volunteer) {
    ensureProfileFlagDialog();
    selectedVolunteerId = volunteer.id;
    document.getElementById("profileFlagName").textContent = volunteer.name || "Unnamed";
    document.getElementById("profileFlagReason").value =
        flagsByMember[volunteer.id]?.reason || "";
    document.getElementById("profileFlagDialog").classList.add("is-visible");
}

async function saveProfileFlag(event) {
    event.preventDefault();
    const reason = document.getElementById("profileFlagReason").value.trim();
    if (!reason || !selectedVolunteerId) return;

    await setDoc(
        doc(db, "flags", selectedVolunteerId),
        {
            manualFlag: true,
            reason,
            source: "profile",
            flaggedAt: Date.now()
        },
        { merge: true }
    );

    flagsByMember[selectedVolunteerId] = {
        ...(flagsByMember[selectedVolunteerId] || {}),
        manualFlag: true,
        reason,
        source: "profile",
        flaggedAt: Date.now()
    };

    document.getElementById("profileFlagDialog").classList.remove("is-visible");
    renderVolunteer(volunteers.find(item => item.id === selectedVolunteerId));
    renderResults(getMatches(searchInput.value));
}

async function saveNote(event) {
    event.preventDefault();

    const textarea =
        document.getElementById("noteText");

    const text =
        textarea.value.trim();

    if (!text || !selectedVolunteerId) {
        return;
    }

    const existingNotes =
        notesByMember[selectedVolunteerId] || [];

    const nextNotes =
        [
            {
                text,
                createdAt: Date.now()
            },
            ...existingNotes
        ];

    try {
        await setDoc(
            doc(db, "memberNotes", selectedVolunteerId),
            {
                notes: nextNotes,
                updatedAt: Date.now()
            }
        );

        notesByMember[selectedVolunteerId] =
            nextNotes;

        const volunteer =
            volunteers.find(item => item.id === selectedVolunteerId);

        renderVolunteer(volunteer);
        renderResults(getMatches(searchInput.value));
    }
    catch (error) {
        console.error("Note save error:", error);
        alert("Error saving note.");
    }
}

async function deleteNote(event) {
    const button =
        event.target.closest(".delete-note-btn");

    if (!button || !selectedVolunteerId) {
        return;
    }

    const createdAt =
        Number(button.dataset.noteCreatedAt);

    const nextNotes =
        (notesByMember[selectedVolunteerId] || [])
            .filter(note => Number(note.createdAt) !== createdAt);

    try {
        await setDoc(
            doc(db, "memberNotes", selectedVolunteerId),
            {
                notes: nextNotes,
                updatedAt: Date.now()
            }
        );

        notesByMember[selectedVolunteerId] =
            nextNotes;

        const volunteer =
            volunteers.find(item => item.id === selectedVolunteerId);

        renderVolunteer(volunteer);
        renderResults(getMatches(searchInput.value));
    }
    catch (error) {
        console.error("Note delete error:", error);
        alert("Error deleting note.");
    }
}

async function loadVolunteers() {
    const snapshot =
        await getDocs(collection(db, "members"));

    volunteers =
        snapshot.docs.map(memberDoc => ({
            id: memberDoc.id,
            ...memberDoc.data()
        }));
}

async function loadSessions() {
    const snapshot =
        await getDocs(collection(db, "sessions"));

    sessionsById = {};

    snapshot.forEach(sessionDoc => {
        sessionsById[sessionDoc.id] =
            {
                id: sessionDoc.id,
                ...sessionDoc.data()
            };
    });
}

async function loadAttendance() {
    const snapshot =
        await getDocs(collection(db, "attendance"));

    attendanceByMember = {};

    snapshot.forEach(attendanceDoc => {
        const attendance =
            attendanceDoc.data();

        const records =
            attendance.records || attendance;

        Object.entries(records).forEach(([memberId, record]) => {
            if (!record || typeof record !== "object" || !record.status) {
                return;
            }

            const session =
                sessionsById[attendanceDoc.id] || {};

            if (!attendanceByMember[memberId]) {
                attendanceByMember[memberId] = [];
            }

            attendanceByMember[memberId].push({
                status: record.status,
                date: session.date || "No date",
                title: session.title || "Session",
                savedAt: attendance.savedAt || session.createdAt || 0
            });
        });
    });
}

async function loadFlags() {
    const snapshot =
        await getDocs(collection(db, "flags"));

    flagsByMember = {};

    snapshot.forEach(flagDoc => {
        flagsByMember[flagDoc.id] =
            flagDoc.data();
    });
}

async function loadNotes() {
    const snapshot =
        await getDocs(collection(db, "memberNotes"));

    notesByMember = {};

    snapshot.forEach(noteDoc => {
        notesByMember[noteDoc.id] =
            noteDoc.data().notes || [];
    });
}

searchInput.addEventListener("input", () => {
    renderResults(getMatches(searchInput.value));
});

searchResults.addEventListener("click", (event) => {
    const row =
        event.target.closest(".result-row");

    if (!row) {
        return;
    }

    const volunteer =
        volunteers.find(item => item.id === row.dataset.id);

    if (volunteer) {
        renderVolunteer(volunteer);
    }
});

async function initializePage() {
    try {
        await loadVolunteers();
        await loadSessions();
        await loadAttendance();
        await loadFlags();
        await loadNotes();

        const requestedMemberId =
            new URLSearchParams(window.location.search).get("member");

        if (requestedMemberId) {
            const volunteer =
                volunteers.find(item => item.id === requestedMemberId);

            if (volunteer) {
                searchInput.value = volunteer.name || "";
                renderResults(getMatches(searchInput.value));
                renderVolunteer(volunteer);
            }
        }
    }
    catch (error) {
        console.error("Volunteer records error:", error);
        recordDetail.innerHTML =
            '<div class="empty-state">Could not load volunteer records.</div>';
    }
}

initializePage();
