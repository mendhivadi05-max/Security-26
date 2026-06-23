import { db } from "../Firebase/Firebase.js";

import {
    collection,
    getDocs
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const elements = {
    search: document.getElementById("statisticsSearch"),
    meeting: document.getElementById("meetingFilter"),
    batch: document.getElementById("batchFilter"),
    gender: document.getElementById("genderFilter"),
    year: document.getElementById("yearFilter"),
    summary: document.getElementById("summaryGrid"),
    meetingList: document.getElementById("meetingList"),
    meetingCount: document.getElementById("meetingCount"),
    breakdownList: document.getElementById("breakdownList"),
    tabs: document.getElementById("breakdownTabs")
};

let members = {};
let sessions = {};
let attendanceRows = [];
let activeGroup = "batch";

function text(value, fallback = "Unknown") {
    const result =
        (value || "").toString().trim();

    return result || fallback;
}

function escapeHtml(value) {
    return text(value, "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function memberYear(member) {
    const batch =
        text(member.batch, "");

    const match =
        batch.match(/\b(19|20)\d{2}\b/);

    if (match) {
        return match[0];
    }

    const createdAt =
        Number(member.createdAt);

    return createdAt
        ? new Date(createdAt).getFullYear().toString()
        : "Unknown";
}

function addOptions(select, values) {
    [...new Set(values)]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .forEach(value => {
            const option =
                document.createElement("option");

            option.value = value;
            option.textContent = value;
            select.append(option);
        });
}

function filteredRows() {
    const query =
        elements.search.value.trim().toLowerCase();

    return attendanceRows.filter(row => {
        const matchesSearch =
            !query ||
            [
                row.sessionTitle,
                row.sessionDate,
                row.memberName,
                row.course,
                row.batch,
                row.gender,
                row.year,
                row.status
            ].some(value => value.toLowerCase().includes(query));

        return (
            matchesSearch &&
            (elements.meeting.value === "all" || row.sessionId === elements.meeting.value) &&
            (elements.batch.value === "all" || row.batch === elements.batch.value) &&
            (elements.gender.value === "all" || row.gender === elements.gender.value) &&
            (elements.year.value === "all" || row.year === elements.year.value)
        );
    });
}

function summarize(rows) {
    const present =
        rows.filter(row => row.status === "Present").length;

    const absent =
        rows.filter(row => row.status === "Absent").length;

    const total =
        present + absent;

    return {
        present,
        absent,
        total,
        rate: total ? Math.round((present / total) * 100) : 0
    };
}

function renderSummary(rows) {
    const summary =
        summarize(rows);

    const meetingTotal =
        new Set(rows.map(row => row.sessionId)).size;

    const volunteerTotal =
        new Set(rows.map(row => row.memberId)).size;

    elements.summary.innerHTML = `
        <article class="summary-card">
            <span>Attendance rate</span>
            <strong>${summary.rate}%</strong>
            <small>${summary.present} present of ${summary.total}</small>
        </article>
        <article class="summary-card present-summary">
            <span>Present</span>
            <strong>${summary.present}</strong>
            <small>Across filtered meetings</small>
        </article>
        <article class="summary-card absent-summary">
            <span>Absent</span>
            <strong>${summary.absent}</strong>
            <small>Across filtered meetings</small>
        </article>
        <article class="summary-card">
            <span>Coverage</span>
            <strong>${meetingTotal}</strong>
            <small>${volunteerTotal} volunteers</small>
        </article>
    `;
}

function groupedStats(rows, key) {
    const groups = {};

    rows.forEach(row => {
        const label =
            row[key];

        if (!groups[label]) {
            groups[label] = [];
        }

        groups[label].push(row);
    });

    return Object.entries(groups)
        .map(([label, groupRows]) => ({
            label,
            ...summarize(groupRows)
        }))
        .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function renderMeetingList(rows) {
    const meetings =
        groupedStats(rows, "sessionId")
            .map(item => ({
                ...item,
                session: sessions[item.label] || {}
            }))
            .sort((a, b) => text(b.session.date, "").localeCompare(text(a.session.date, "")));

    elements.meetingCount.textContent =
        `${meetings.length} shown`;

    if (!meetings.length) {
        elements.meetingList.innerHTML =
            '<div class="empty-state">No meetings match these filters.</div>';
        return;
    }

    elements.meetingList.innerHTML =
        meetings.map(item => `
            <button class="meeting-row" type="button" data-session-id="${item.label}">
                <span class="meeting-copy">
                    <strong>${escapeHtml(item.session.title || "Untitled meeting")}</strong>
                    <small>${escapeHtml(item.session.date || "No date")}</small>
                </span>
                <span class="attendance-bar" aria-label="${item.rate}% present">
                    <span style="width:${item.rate}%"></span>
                </span>
                <span class="meeting-numbers">
                    <strong>${item.rate}%</strong>
                    <small>${item.present} P / ${item.absent} A</small>
                </span>
            </button>
        `).join("");
}

function renderBreakdown(rows) {
    const groups =
        groupedStats(rows, activeGroup);

    if (!groups.length) {
        elements.breakdownList.innerHTML =
            '<div class="empty-state">No breakdown data available.</div>';
        return;
    }

    elements.breakdownList.innerHTML =
        groups.map(group => `
            <div class="breakdown-row">
                <div>
                    <strong>${escapeHtml(group.label)}</strong>
                    <small>${group.total} attendance records</small>
                </div>
                <div class="split-bar">
                    <span class="split-present" style="width:${group.rate}%"></span>
                </div>
                <div class="breakdown-values">
                    <span class="present-text">${group.present} present</span>
                    <span class="absent-text">${group.absent} absent</span>
                </div>
            </div>
        `).join("");
}

function render() {
    const rows =
        filteredRows();

    renderSummary(rows);
    renderMeetingList(rows);
    renderBreakdown(rows);
}

async function loadData() {
    const [memberSnapshot, sessionSnapshot, attendanceSnapshot] =
        await Promise.all([
            getDocs(collection(db, "members")),
            getDocs(collection(db, "sessions")),
            getDocs(collection(db, "attendance"))
        ]);

    memberSnapshot.forEach(memberDoc => {
        members[memberDoc.id] = {
            id: memberDoc.id,
            ...memberDoc.data()
        };
    });

    sessionSnapshot.forEach(sessionDoc => {
        sessions[sessionDoc.id] = {
            id: sessionDoc.id,
            ...sessionDoc.data()
        };
    });

    attendanceSnapshot.forEach(attendanceDoc => {
        const attendance =
            attendanceDoc.data();

        const records =
            attendance.records || attendance;

        Object.entries(records).forEach(([memberId, record]) => {
            if (!record || !["Present", "Absent"].includes(record.status)) {
                return;
            }

            const member =
                members[memberId] || {};

            const session =
                sessions[attendanceDoc.id] || {};

            attendanceRows.push({
                sessionId: attendanceDoc.id,
                sessionTitle: text(session.title, "Untitled meeting"),
                sessionDate: text(session.date, "No date"),
                memberId,
                memberName: text(member.name),
                course: text(member.course),
                batch: text(member.batch),
                gender: text(member.gender),
                year: memberYear(member),
                status: record.status
            });
        });
    });

    Object.values(sessions)
        .sort((a, b) => text(b.date, "").localeCompare(text(a.date, "")))
        .forEach(session => {
            const option =
                document.createElement("option");

            option.value = session.id;
            option.textContent =
                `${text(session.title, "Untitled meeting")} - ${text(session.date, "No date")}`;
            elements.meeting.append(option);
        });

    addOptions(elements.batch, Object.values(members).map(member => text(member.batch)));
    addOptions(elements.gender, Object.values(members).map(member => text(member.gender)));
    addOptions(elements.year, Object.values(members).map(memberYear));

    const query =
        new URLSearchParams(window.location.search).get("q");

    if (query) {
        const normalizedQuery =
            query.toLowerCase();

        const groupMatch =
            ["batch", "gender", "year"]
                .find(group => normalizedQuery.includes(group));

        if (groupMatch) {
            activeGroup = groupMatch;

            elements.tabs.querySelectorAll("button").forEach(tab => {
                tab.classList.toggle("is-active", tab.dataset.group === activeGroup);
            });
        }
        else {
            elements.search.value = query;
        }
    }

    render();
}

[elements.search, elements.meeting, elements.batch, elements.gender, elements.year]
    .forEach(control => {
        control.addEventListener(control.tagName === "INPUT" ? "input" : "change", render);
    });

elements.tabs.addEventListener("click", event => {
    const button =
        event.target.closest("button[data-group]");

    if (!button) {
        return;
    }

    activeGroup = button.dataset.group;

    elements.tabs.querySelectorAll("button").forEach(tab => {
        tab.classList.toggle("is-active", tab === button);
    });

    renderBreakdown(filteredRows());
});

elements.meetingList.addEventListener("click", event => {
    const row =
        event.target.closest("[data-session-id]");

    if (!row) {
        return;
    }

    elements.meeting.value = row.dataset.sessionId;
    render();
});

loadData().catch(error => {
    console.error("Statistics load error:", error);
    elements.summary.innerHTML =
        '<div class="empty-state">Could not load attendance statistics.</div>';
});
