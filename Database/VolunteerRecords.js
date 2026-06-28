import { apiPost, loadCollections } from "../Shared/Api.js";

const searchInput =
    document.getElementById("volunteerSearch");

const searchResults =
    document.getElementById("searchResults");

const recordDetail =
    document.getElementById("recordDetail");

const isProfilePage =
    !searchInput;

let volunteers = [];
let sessionsById = {};
let attendanceByMember = {};
let flagsByMember = {};
let notesByMember = {};
let selectedVolunteerId = "";
let editedVolunteerImage = "";

const DEFAULT_BRANCHES = ["B-Tech", "B-com", "BSc"];
const OTHER_BRANCH_VALUE = "__other";

function branchName(volunteer) {
    return (volunteer?.branch || volunteer?.course || volunteer?.profile?.branch || volunteer?.profile?.course || "")
        .toString()
        .trim();
}

function branchOptionsMarkup(selectedBranch = "") {
    const knownBranches = [...new Set(volunteers.map(branchName).filter(Boolean))];
    const customBranches = knownBranches
        .filter(branch => !DEFAULT_BRANCHES.includes(branch))
        .sort((a, b) => a.localeCompare(b));
    const options = [...DEFAULT_BRANCHES, ...customBranches];
    const hasSelected = selectedBranch && !options.includes(selectedBranch);

    return [
        '<option value="">Select branch</option>',
        ...options.map(branch => `<option ${branch === selectedBranch ? "selected" : ""}>${escapeHtml(branch)}</option>`),
        hasSelected ? `<option selected>${escapeHtml(selectedBranch)}</option>` : "",
        `<option value="${OTHER_BRANCH_VALUE}">Other</option>`
    ].join("");
}

function updateEditCustomBranchVisibility() {
    const select = document.getElementById("editVolunteerCourse");
    const label = document.getElementById("editCustomBranchLabel");
    const input = document.getElementById("editCustomBranch");
    if (!select || !label || !input) {
        return;
    }

    const isOther = select.value === OTHER_BRANCH_VALUE;
    label.hidden = !isOther;
    input.required = isOther;
    if (!isOther) {
        input.value = "";
    }
}

function selectedEditBranch() {
    const select = document.getElementById("editVolunteerCourse");
    const custom = document.getElementById("editCustomBranch");
    return select.value === OTHER_BRANCH_VALUE
        ? custom.value.trim()
        : select.value;
}

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

            const branch =
                normalize(volunteer.branch || volunteer.course);

            return (
                name.startsWith(query) ||
                name.includes(query) ||
                branch.includes(query)
            );
        })
        .slice(0, 10);
}

function renderResults(matches) {
    if (!searchInput || !searchResults) {
        return;
    }

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
                        <small>${escapeHtml(volunteer.branch || volunteer.course || "No branch")}</small>
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

            const meetingName =
                record.title || "Meeting";

            const meetingDate =
                record.date || "No date";

            const tooltip =
                `${meetingName} — ${meetingDate}`;

            return `
                <div
                    class="calendar-box ${className}"
                    data-tooltip="${escapeHtml(tooltip)}"
                    aria-label="${escapeHtml(tooltip)}"
                    tabindex="0">
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
        Boolean(flag.manualFlag || flag.contactedAtStreak || flag.absenceReason);

    const absenceReasonAt =
        Number(flag.absenceReasonAt || 0);
    const replyExpiresAt =
        Number(flag.reasonReplyExpiresAt || 0);
    const replyWindowOpen =
        flag.reasonReplyOpen === true && replyExpiresAt > Date.now();
    const replyWindowExpired =
        flag.reasonReplyOpen === true && replyExpiresAt <= Date.now();

    recordDetail.innerHTML = `
        <article class="profile-card">
            <div class="profile-top">
                ${avatarMarkup(volunteer, "large-avatar")}
                <div class="profile-summary">
                    <h2 class="profile-name">${escapeHtml(volunteer.name || "Unnamed")}</h2>
                    <dl class="detail-list">
                        <div><dt>Date of Birth</dt><dd>${escapeHtml(volunteer.dateOfBirth || "Not provided")}</dd></div>
                        <div><dt>Gender</dt><dd>${escapeHtml(volunteer.gender || "Not provided")}</dd></div>
                        <div><dt>Branch</dt><dd>${escapeHtml(volunteer.branch || volunteer.course || "Not provided")}</dd></div>
                    </dl>
                </div>
            </div>

            <section class="whatsapp-area">
                <span>WhatsApp Number</span>
                <strong>${escapeHtml(volunteer.whatsappNumber || volunteer.phone || "Not provided")}</strong>
            </section>

            ${flagged ? `
                <details class="profile-flag-notice">
                    <summary><span class="profile-alert">!</span> This volunteer has a flag</summary>
                    <p>${escapeHtml(flag.manualFlag ? (flag.reason || "Flagged for attention") : "Attendance requires attention.")}</p>
                    ${flag.absenceReason ? `
                        <div class="profile-reason-reply">
                            <strong>WhatsApp reason received</strong>
                            <span>${escapeHtml(flag.absenceReason)}</span>
                            ${absenceReasonAt ? `<small>${escapeHtml(new Date(absenceReasonAt).toLocaleString())}</small>` : ""}
                        </div>
                    ` : ""}
                    ${!flag.absenceReason && replyWindowOpen ? `
                        <div class="profile-reason-reply is-pending">
                            <strong>Reason reply window open</strong>
                            <span>Expires ${escapeHtml(new Date(replyExpiresAt).toLocaleString())}</span>
                        </div>
                    ` : ""}
                    ${!flag.absenceReason && replyWindowExpired ? `
                        <div class="profile-reason-reply is-expired">
                            <strong>Reason reply window expired</strong>
                            <span>No reason was saved.</span>
                        </div>
                    ` : ""}
                </details>
            ` : ""}

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

            <section class="profile-actions" aria-label="Volunteer actions">
                <button type="button" id="editVolunteerButton" class="secondary-btn">Edit details</button>
                <button type="button" id="deleteVolunteerButton" class="danger-btn">Delete volunteer</button>
                <button type="button" id="profileFlagButton" class="flag-action ${flag.manualFlag ? "is-flagged" : ""}">
                    ${flag.manualFlag ? "Update flag" : "Flag person"}
                </button>
                <button type="button" id="removeProfileFlagButton" class="danger-btn" ${flag.manualFlag ? "" : "disabled"}>Remove flag</button>
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

    document
        .getElementById("editVolunteerButton")
        .addEventListener("click", () => openEditVolunteerDialog(volunteer));

    document
        .getElementById("deleteVolunteerButton")
        .addEventListener("click", () => deleteVolunteer(volunteer));

    document
        .getElementById("removeProfileFlagButton")
        .addEventListener("click", removeProfileFlag);
}

function ensureEditVolunteerDialog() {
    if (document.getElementById("editVolunteerDialog")) return;

    document.body.insertAdjacentHTML("beforeend", `
        <div class="flag-dialog" id="editVolunteerDialog">
            <form class="flag-dialog-card edit-volunteer-form" id="editVolunteerForm">
                <h2>Update volunteer details</h2>
                <label>Full Name<input type="text" id="editVolunteerName" required></label>
                <div class="form-grid">
                    <label>Date of Birth<input type="date" id="editVolunteerDob" required></label>
                    <label>Gender
                        <select id="editVolunteerGender" required>
                            <option value="">Select gender</option>
                            <option>Female</option><option>Male</option><option>Non-binary</option><option>Prefer not to say</option>
                        </select>
                    </label>
                </div>
                <div class="form-grid">
                    <label>Branch
                        <select id="editVolunteerCourse" required>
                            ${branchOptionsMarkup()}
                        </select>
                    </label>
                    <label id="editCustomBranchLabel" hidden>Branch name<input type="text" id="editCustomBranch" maxlength="80" placeholder="Enter branch name"></label>
                </div>
                <label>WhatsApp Number<input type="tel" id="editVolunteerWhatsapp" inputmode="tel" required></label>
                <label>Volunteer Image<input type="file" id="editVolunteerImage" accept="image/*"></label>
                <div class="image-preview edit-image-preview" id="editVolunteerImagePreview">No image selected</div>
                <button type="button" class="secondary-btn remove-image-btn" id="removeVolunteerImage">Remove image</button>
                <div class="flag-dialog-actions">
                    <button type="submit" class="primary-btn">Save changes</button>
                    <button type="button" class="secondary-btn" id="cancelEditVolunteer">Cancel</button>
                </div>
            </form>
        </div>
    `);

    document.getElementById("cancelEditVolunteer").onclick =
        () => document.getElementById("editVolunteerDialog").classList.remove("is-visible");
    document.getElementById("editVolunteerForm").onsubmit = saveVolunteerDetails;
    document.getElementById("editVolunteerImage").onchange = updateEditedVolunteerImage;
    document.getElementById("editVolunteerCourse").onchange = updateEditCustomBranchVisibility;
    document.getElementById("removeVolunteerImage").onclick = () => {
        editedVolunteerImage = "";
        document.getElementById("editVolunteerImage").value = "";
        showEditImagePreview("");
    };
}

function openEditVolunteerDialog(volunteer) {
    ensureEditVolunteerDialog();
    selectedVolunteerId = volunteer.id;
    document.getElementById("editVolunteerName").value = volunteer.name || "";
    document.getElementById("editVolunteerDob").value = volunteer.dateOfBirth || "";
    document.getElementById("editVolunteerGender").value = volunteer.gender || "";
    document.getElementById("editVolunteerCourse").innerHTML = branchOptionsMarkup(branchName(volunteer));
    document.getElementById("editCustomBranch").value = "";
    updateEditCustomBranchVisibility();
    document.getElementById("editVolunteerWhatsapp").value = volunteer.whatsappNumber || volunteer.phone || "";
    document.getElementById("editVolunteerImage").value = "";
    editedVolunteerImage = volunteer.image || "";
    showEditImagePreview(editedVolunteerImage);
    document.getElementById("editVolunteerDialog").classList.add("is-visible");
}

function showEditImagePreview(image) {
    const preview = document.getElementById("editVolunteerImagePreview");
    preview.textContent = image ? "" : "No image selected";
    preview.style.backgroundImage = image ? `url("${image}")` : "";
}

function readImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

async function updateEditedVolunteerImage() {
    const input = document.getElementById("editVolunteerImage");
    const file = input.files[0];
    if (!file) return;

    if (file.size > 650 * 1024) {
        input.value = "";
        alert("Please choose an image smaller than 650 KB.");
        return;
    }

    try {
        editedVolunteerImage = await readImage(file);
        showEditImagePreview(editedVolunteerImage);
    }
    catch (error) {
        console.error("Image read error:", error);
        alert("Could not load that image.");
    }
}

async function saveVolunteerDetails(event) {
    event.preventDefault();
    if (!selectedVolunteerId) return;

    const name = document.getElementById("editVolunteerName").value.trim();
    const dateOfBirth = document.getElementById("editVolunteerDob").value;
    const gender = document.getElementById("editVolunteerGender").value;
    const branch = selectedEditBranch();
    const whatsappNumber = document.getElementById("editVolunteerWhatsapp").value.trim();
    const updatedAt = Date.now();
    const volunteer = volunteers.find(item => item.id === selectedVolunteerId);
    const createdAt = volunteer.createdAt || volunteer.metadata?.createdAt || updatedAt;

    if (!name || !dateOfBirth || !gender || !branch || !whatsappNumber) {
        alert("Please fill all required volunteer details.");
        return;
    }

    const updates = {
        name,
        dateOfBirth,
        gender,
        course: branch,
        branch,
        whatsappNumber,
        image: editedVolunteerImage,
        updatedAt,
        profile: { name, dateOfBirth, gender, course: branch, branch, image: editedVolunteerImage },
        contact: { whatsappNumber },
        metadata: { createdAt, updatedAt, schemaVersion: 2 }
    };

    try {
        const result = await apiPost("/api/data", {
            action: "updateMember",
            memberId: selectedVolunteerId,
            member: updates
        });
        Object.assign(updates, result.member || {});
        Object.assign(volunteer, updates);
        document.getElementById("editVolunteerDialog").classList.remove("is-visible");
        renderVolunteer(volunteer);
        renderResults(searchInput ? getMatches(searchInput.value) : []);
    }
    catch (error) {
        console.error("Volunteer update error:", error);
        alert("Error updating volunteer details.");
    }
}

async function deleteVolunteer(volunteer) {
    const confirmed = confirm(
        `Delete ${volunteer.name || "this volunteer"}?\n\nThis will remove their profile, notes, flags, and attendance entries. This cannot be undone.`
    );

    if (!confirmed) return;

    try {
        await apiPost("/api/data", {
            action: "deleteMember",
            memberId: volunteer.id
        });

        volunteers = volunteers.filter(item => item.id !== volunteer.id);
        delete notesByMember[volunteer.id];
        delete flagsByMember[volunteer.id];
        delete attendanceByMember[volunteer.id];
        selectedVolunteerId = "";
        recordDetail.innerHTML = '<div class="empty-state">Volunteer deleted successfully.</div>';
        if (isProfilePage) {
            window.location.href = "VolunteerRecords";
            return;
        }
        renderResults(searchInput ? getMatches(searchInput.value) : []);
    }
    catch (error) {
        console.error("Volunteer delete error:", error);
        alert("Error deleting volunteer.");
    }
}

async function removeProfileFlag() {
    if (!selectedVolunteerId || !confirm("Remove this person's manual flag?")) return;

    try {
        await apiPost("/api/data", {
            action: "removeManualFlag",
            memberId: selectedVolunteerId
        });
        flagsByMember[selectedVolunteerId] = {
            ...(flagsByMember[selectedVolunteerId] || {}),
            manualFlag: false,
            reason: ""
        };
        renderVolunteer(volunteers.find(item => item.id === selectedVolunteerId));
        renderResults(searchInput ? getMatches(searchInput.value) : []);
    }
    catch (error) {
        console.error("Flag removal error:", error);
        alert("Error removing flag.");
    }
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

    await apiPost("/api/data", {
        action: "setManualFlag",
        memberId: selectedVolunteerId,
        reason
    });

    flagsByMember[selectedVolunteerId] = {
        ...(flagsByMember[selectedVolunteerId] || {}),
        manualFlag: true,
        reason,
        source: "profile",
        flaggedAt: Date.now()
    };

    document.getElementById("profileFlagDialog").classList.remove("is-visible");
    renderVolunteer(volunteers.find(item => item.id === selectedVolunteerId));
    renderResults(searchInput ? getMatches(searchInput.value) : []);
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
        await apiPost("/api/data", {
            action: "setNotes",
            memberId: selectedVolunteerId,
            notes: nextNotes
        });

        notesByMember[selectedVolunteerId] =
            nextNotes;

        const volunteer =
            volunteers.find(item => item.id === selectedVolunteerId);

        renderVolunteer(volunteer);
        renderResults(searchInput ? getMatches(searchInput.value) : []);
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
        await apiPost("/api/data", {
            action: "setNotes",
            memberId: selectedVolunteerId,
            notes: nextNotes
        });

        notesByMember[selectedVolunteerId] =
            nextNotes;

        const volunteer =
            volunteers.find(item => item.id === selectedVolunteerId);

        renderVolunteer(volunteer);
        renderResults(searchInput ? getMatches(searchInput.value) : []);
    }
    catch (error) {
        console.error("Note delete error:", error);
        alert("Error deleting note.");
    }
}

async function loadVolunteers() {
    const data =
        await loadCollections(["members"]);

    volunteers =
        (data.members || []).map(memberDoc => ({
            id: memberDoc.id,
            ...memberDoc,
            ...(memberDoc.profile || {}),
            whatsappNumber:
                memberDoc.contact?.whatsappNumber ||
                memberDoc.whatsappNumber ||
                memberDoc.phone ||
                ""
        }));
}

async function loadSessions() {
    const data =
        await loadCollections(["sessions"]);

    sessionsById = {};

    (data.sessions || []).forEach(sessionDoc => {
        sessionsById[sessionDoc.id] =
            {
                id: sessionDoc.id,
                ...sessionDoc
            };
    });
}

async function loadAttendance() {
    const data =
        await loadCollections(["attendance"]);

    attendanceByMember = {};

    (data.attendance || []).forEach(attendanceDoc => {
        const attendance =
            attendanceDoc;

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
    const data =
        await loadCollections(["flags"]);

    flagsByMember = {};

    (data.flags || []).forEach(flagDoc => {
        flagsByMember[flagDoc.id] =
            flagDoc;
    });
}

async function loadNotes() {
    const data =
        await loadCollections(["memberNotes"]);

    notesByMember = {};

    (data.memberNotes || []).forEach(noteDoc => {
        notesByMember[noteDoc.id] =
            noteDoc.notes || [];
    });
}

async function loadRecordData() {
    const data =
        await loadCollections(["members", "sessions", "attendance", "flags", "memberNotes"]);

    volunteers =
        (data.members || []).map(memberDoc => ({
            id: memberDoc.id,
            ...memberDoc,
            ...(memberDoc.profile || {}),
            whatsappNumber:
                memberDoc.contact?.whatsappNumber ||
                memberDoc.whatsappNumber ||
                memberDoc.phone ||
                ""
        }));

    sessionsById = {};
    (data.sessions || []).forEach(sessionDoc => {
        sessionsById[sessionDoc.id] = {
            id: sessionDoc.id,
            ...sessionDoc
        };
    });

    attendanceByMember = {};
    (data.attendance || []).forEach(attendanceDoc => {
        const attendance =
            attendanceDoc;

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

    flagsByMember = {};
    (data.flags || []).forEach(flagDoc => {
        flagsByMember[flagDoc.id] =
            flagDoc;
    });

    notesByMember = {};
    (data.memberNotes || []).forEach(noteDoc => {
        notesByMember[noteDoc.id] =
            noteDoc.notes || [];
    });
}

if (searchInput && searchResults) {
    searchInput.addEventListener("input", () => {
        renderResults(getMatches(searchInput.value));
    });

    searchResults.addEventListener("click", (event) => {
        const row =
            event.target.closest(".result-row");

        if (!row) {
            return;
        }

        window.location.href =
            `VolunteerProfile?member=${encodeURIComponent(row.dataset.id)}`;
    });
}

async function initializePage() {
    try {
        await loadRecordData();

        const requestedMemberId =
            new URLSearchParams(window.location.search).get("member");

        if (requestedMemberId && !isProfilePage) {
            window.location.replace(
                `VolunteerProfile?member=${encodeURIComponent(requestedMemberId)}`
            );
            return;
        }

        if (requestedMemberId) {
            const volunteer =
                volunteers.find(item => item.id === requestedMemberId);

            if (volunteer) {
                renderVolunteer(volunteer);
                return;
            }

            recordDetail.innerHTML =
                '<div class="empty-state">Volunteer record not found.</div>';
            return;
        }

        if (isProfilePage) {
            recordDetail.innerHTML =
                '<div class="empty-state">Choose a volunteer from the records page.</div>';
        }
    }
    catch (error) {
        console.error("Volunteer records error:", error);
        recordDetail.innerHTML =
            '<div class="empty-state">Could not load volunteer records.</div>';
    }
}

initializePage();
