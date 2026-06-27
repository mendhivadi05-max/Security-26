import { showSuccess, showErrorToast } from "../Shared/Toast.js";
import { apiPost, loadCollections } from "../Shared/Api.js";

const flagsContainer = document.getElementById("flagsContainer");
const loadingMessage = document.getElementById("loadingMessage");
const noIssuesMessage = document.getElementById("noIssuesMessage");

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function numericTime(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function sessionSortValue(session) {
    if (session.date) {
        const date = new Date(`${session.date}T00:00:00`);
        if (!Number.isNaN(date.getTime())) {
            return date.getTime();
        }
    }
    return numericTime(session.createdAt);
}

function memberPhone(member) {
    return member.contact?.whatsappNumber || member.whatsappNumber || member.phone || "";
}

function attendanceRecords(attendanceDoc) {
    if (attendanceDoc.records && typeof attendanceDoc.records === "object") {
        return attendanceDoc.records;
    }

    return Object.fromEntries(
        Object.entries(attendanceDoc)
            .filter(([key, value]) => key !== "id" && value && typeof value === "object")
    );
}

function buildFlagRows(data) {
    const members = new Map();
    const flags = new Map();
    const attendanceBySession = new Map();
    const streaks = new Map();
    const lastAbsence = new Map();

    (data.members || [])
        .filter(member => member.active !== false && member.archived !== true)
        .forEach(member => {
            members.set(member.id, { id: member.id, ...member });
            streaks.set(member.id, 0);
        });

    (data.flags || []).forEach(flag => {
        if (members.has(flag.id)) {
            flags.set(flag.id, flag);
        }
    });

    (data.attendance || []).forEach(attendanceDoc => {
        attendanceBySession.set(attendanceDoc.id, attendanceRecords(attendanceDoc));
    });

    const sessions = (data.sessions || [])
        .filter(session => session?.id)
        .sort((a, b) => sessionSortValue(a) - sessionSortValue(b));

    sessions.forEach(session => {
        const records = attendanceBySession.get(session.id) || {};

        members.forEach((member, memberId) => {
            const record = records[memberId];
            if (!record || !["Present", "Absent"].includes(record.status)) {
                return;
            }

            if (record.status === "Present") {
                streaks.set(memberId, 0);
                return;
            }

            const nextStreak = (streaks.get(memberId) || 0) + 1;
            streaks.set(memberId, nextStreak);
            lastAbsence.set(memberId, {
                sessionId: session.id,
                title: session.title || "Meeting",
                date: session.date || "No date",
                streak: nextStreak
            });
        });
    });

    return [...members.values()]
        .map(member => {
            const flag = flags.get(member.id) || {};
            const streak = streaks.get(member.id) || 0;
            return {
                member,
                flag,
                streak,
                lastAbsence: lastAbsence.get(member.id) || null,
                manual: flag.manualFlag === true,
                hasReasonReply: Boolean(flag.absenceReason),
                contacted: streak >= 3 && streak <= Number(flag.contactedAtStreak || 0)
            };
        })
        .filter(row => row.streak >= 2 || row.manual || row.hasReasonReply)
        .sort((a, b) => {
            const severity = Number(b.manual || b.streak >= 3) - Number(a.manual || a.streak >= 3);
            return severity || b.streak - a.streak || (a.member.name || "").localeCompare(b.member.name || "");
        });
}

function renderFlagRows(rows) {
    loadingMessage.style.display = "none";
    noIssuesMessage.style.display = rows.length ? "none" : "grid";

    flagsContainer.innerHTML = rows.map(row => {
        const { member, flag, streak, manual, contacted, lastAbsence } = row;
        const severe = manual || streak >= 3 || Boolean(flag.absenceReason);
        const phone = memberPhone(member);
        const absenceReasonAt = Number(flag.absenceReasonAt || 0);
        const replyExpiresAt = Number(flag.reasonReplyExpiresAt || 0);
        const replyWindowOpen = flag.reasonReplyOpen === true && replyExpiresAt > Date.now();
        const replyWindowExpired = flag.reasonReplyOpen === true && replyExpiresAt <= Date.now();

        return `
            <article class="flag-card ${severe ? "flagged-card" : "warning-card"}" data-member-id="${escapeHtml(member.id)}" data-streak="${streak}">
                <div class="flag-card-top">
                    <div>
                        <p class="flag-kicker">${manual ? "Manual flag" : "Attendance warning"}</p>
                        <h2 class="member-name">${escapeHtml(member.name || "Unnamed")}</h2>
                    </div>
                    <span class="flag-badge">${severe ? "FLAGGED" : "WARNING"}</span>
                </div>

                ${manual ? `<p class="flag-reason">${escapeHtml(flag.reason || "Needs attention")}</p>` : ""}
                ${flag.absenceReason ? `
                    <div class="flag-reply">
                        <strong>WhatsApp reason received</strong>
                        <p>${escapeHtml(flag.absenceReason)}</p>
                        ${absenceReasonAt ? `<small>${escapeHtml(new Date(absenceReasonAt).toLocaleString())}</small>` : ""}
                    </div>
                ` : ""}
                ${!flag.absenceReason && replyWindowOpen ? `
                    <p class="flag-reply-status">Reason reply window open until ${escapeHtml(new Date(replyExpiresAt).toLocaleString())}</p>
                ` : ""}
                ${!flag.absenceReason && replyWindowExpired ? `
                    <p class="flag-reply-status is-expired">Reason reply window expired</p>
                ` : ""}
                ${streak >= 2 ? `<p><strong>${streak}</strong> consecutive absences</p>` : ""}
                ${lastAbsence ? `<p class="member-details">Latest absence: ${escapeHtml(lastAbsence.title)} - ${escapeHtml(lastAbsence.date)}</p>` : ""}
                <p>${phone ? `WhatsApp: ${escapeHtml(phone)}` : "No WhatsApp number on record"}</p>

                <div class="flag-card-actions">
                    <a class="secondary-link" href="../Database/VolunteerRecords?member=${encodeURIComponent(member.id)}">View profile</a>
                    ${severe ? '<button type="button" class="contact-button" data-action="send-review">Send WhatsApp review</button>' : ""}
                    ${streak >= 3 && !contacted ? '<button type="button" class="contact-button" data-action="mark-contacted">Mark contacted</button>' : ""}
                    ${contacted ? '<span class="contacted-text">Contacted</span>' : ""}
                    ${manual ? '<button type="button" class="remove-flag-button" data-action="remove-flag">Remove flag</button>' : ""}
                </div>
            </article>
        `;
    }).join("");
}

async function loadFlags() {
    loadingMessage.style.display = "block";
    loadingMessage.textContent = "Loading attendance records...";
    noIssuesMessage.style.display = "none";
    flagsContainer.innerHTML = "";

    try {
        const data = await loadCollections(["members", "sessions", "attendance", "flags"], { force: true });
        renderFlagRows(buildFlagRows(data));
    }
    catch (error) {
        console.error("Flags Error:", error);
        loadingMessage.textContent = "Error loading attendance records.";
        showErrorToast(error.message || "Error loading attendance records.");
    }
}

async function markContacted(memberId, streak) {
    await apiPost("/api/data", {
        action: "setFlagContacted",
        memberId,
        streak
    });
    showSuccess("Marked as contacted.");
    await loadFlags();
}

async function sendFlagMessage(memberId, streak, button) {
    const meetingName = prompt("Meeting name for the WhatsApp template:", "club meeting");
    if (!meetingName) {
        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent = "Sending...";
    }

    try {
        const response = await fetch("/api/whatsapp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
                action: "send-targeted",
                memberIds: [memberId],
                templateKey: "absenceReview",
                variables: { meeting_name: meetingName }
            })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || "Could not send WhatsApp review.");
        }

        if (result.sent > 0 && streak >= 3) {
            await apiPost("/api/data", {
                action: "setFlagContacted",
                memberId,
                streak
            });
        }

        if (result.failed > 0) {
            showErrorToast(`WhatsApp review: ${result.sent} sent, ${result.failed} failed.`);
        }
        else {
            showSuccess("WhatsApp review sent.");
        }
        await loadFlags();
    }
    catch (error) {
        console.error("Flag WhatsApp review error:", error);
        showErrorToast(error.message || "Could not send WhatsApp review.");
        if (button) {
            button.disabled = false;
            button.textContent = "Send WhatsApp review";
        }
    }
}

async function removeFlag(memberId) {
    if (!confirm("Remove this person's manual flag?")) {
        return;
    }

    await apiPost("/api/data", {
        action: "removeManualFlag",
        memberId
    });
    showSuccess("Flag removed.");
    await loadFlags();
}

flagsContainer.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    const card = event.target.closest("[data-member-id]");
    if (!button || !card) {
        return;
    }

    const memberId = card.dataset.memberId;
    const streak = Number(card.dataset.streak || 0);

    try {
        if (button.dataset.action === "mark-contacted") {
            button.disabled = true;
            await markContacted(memberId, streak);
        }
        if (button.dataset.action === "send-review") {
            await sendFlagMessage(memberId, streak, button);
        }
        if (button.dataset.action === "remove-flag") {
            button.disabled = true;
            await removeFlag(memberId);
        }
    }
    catch (error) {
        console.error("Flag action failed:", error);
        showErrorToast(error.message || "Flag action failed.");
        button.disabled = false;
    }
});

loadFlags();
