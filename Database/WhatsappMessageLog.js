import { loadCollections } from "../Shared/Api.js";

const summary =
    document.getElementById("messageSummary");

const list =
    document.getElementById("messageLogList");

const count =
    document.getElementById("messageCount");

function text(value, fallback = "Not provided") {
    const result =
        String(value || "").trim();

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

function memberName(member) {
    return text(member?.name || member?.profile?.name, "Unknown volunteer");
}

function memberPhone(member) {
    return text(member?.contact?.whatsappNumber || member?.whatsappNumber || member?.phone, "");
}

function phoneLabel(message, member) {
    return text(memberPhone(member) || message.to, "No phone recorded");
}

function formatDate(message) {
    const value =
        Number(message.statusUpdatedAtMs || message.createdAtMs || 0);

    return value
        ? new Date(value).toLocaleString()
        : "No timestamp";
}

function templateLabel(templateKey) {
    const labels = {
        meetingReminder: "Meeting reminder",
        absentNotice: "Absent notice",
        absenceReview: "Absence review"
    };

    return labels[templateKey] || text(templateKey, "WhatsApp message");
}

function statusClass(status) {
    const normalized =
        text(status, "unknown").toLowerCase();

    if (["sent", "delivered", "read"].includes(normalized)) {
        return "is-success";
    }

    if (["failed", "undelivered", "deleted"].includes(normalized)) {
        return "is-failed";
    }

    return "is-pending";
}

function messageDetail(message) {
    const variables =
        message.variables && typeof message.variables === "object"
            ? message.variables
            : {};

    if (message.templateKey === "meetingReminder") {
        return `Meeting time: ${text(variables.meeting_time, "Not included")}`;
    }

    if (message.templateKey === "absentNotice") {
        return [
            `Meeting: ${text(variables.meeting_name, "Not included")}`,
            `Date: ${text(variables.date, "Not included")}`,
            `Time: ${text(variables.time, "Not included")}`
        ].join(" | ");
    }

    if (message.templateKey === "absenceReview") {
        return `Meeting: ${text(variables.meeting_name, "Not included")}`;
    }

    return Object.entries(variables)
        .map(([key, value]) => `${key}: ${value}`)
        .join(" | ") || "No template variables recorded";
}

function renderSummary(messages) {
    const sent =
        messages.filter(message => ["sent", "delivered", "read"].includes(text(message.status, "").toLowerCase())).length;

    const failed =
        messages.filter(message => ["failed", "undelivered"].includes(text(message.status, "").toLowerCase())).length;

    const delivered =
        messages.filter(message => ["delivered", "read"].includes(text(message.status, "").toLowerCase())).length;

    const volunteers =
        new Set(messages.map(message => message.memberId).filter(Boolean)).size;

    summary.innerHTML = `
        <article class="summary-card">
            <span>Tracked messages</span>
            <strong>${messages.length}</strong>
            <small>Recent WhatsApp sends</small>
        </article>
        <article class="summary-card present-summary">
            <span>Accepted or sent</span>
            <strong>${sent}</strong>
            <small>Meta accepted these messages</small>
        </article>
        <article class="summary-card">
            <span>Delivered/read</span>
            <strong>${delivered}</strong>
            <small>Updated by webhook status</small>
        </article>
        <article class="summary-card absent-summary">
            <span>Failed</span>
            <strong>${failed}</strong>
            <small>Includes delivery failures</small>
        </article>
        <article class="summary-card">
            <span>Volunteers reached</span>
            <strong>${volunteers}</strong>
            <small>Unique volunteer records</small>
        </article>
    `;
}

function renderMessages(messages, membersById) {
    count.textContent =
        `${messages.length} shown`;

    if (!messages.length) {
        list.innerHTML =
            '<div class="empty-state">No WhatsApp messages have been tracked yet.</div>';
        return;
    }

    list.innerHTML =
        messages.map(message => {
            const member =
                membersById[message.memberId] || {};

            const error =
                message.deliveryErrorMessage ||
                message.deliveryErrorTitle ||
                message.deliveryErrorDetails ||
                message.error ||
                "";

            return `
                <article class="message-log-row">
                    <div class="message-log-main">
                        <strong>${escapeHtml(memberName(member))}</strong>
                        <small>${escapeHtml(phoneLabel(message, member))}</small>
                    </div>
                    <div class="message-log-template">
                        <strong>${escapeHtml(templateLabel(message.templateKey))}</strong>
                        <small>${escapeHtml(messageDetail(message))}</small>
                    </div>
                    <div class="message-log-meta">
                        <span class="message-status ${statusClass(message.status)}">${escapeHtml(message.status || "sent")}</span>
                        <small>${escapeHtml(formatDate(message))}</small>
                        ${error ? `<small class="message-error">${escapeHtml(error)}</small>` : ""}
                    </div>
                </article>
            `;
        }).join("");
}

async function initializePage() {
    try {
        const data =
            await loadCollections(["members", "whatsappMessages"], {
                limit: 500,
                force: true
            });

        const membersById = {};
        (data.members || []).forEach(member => {
            membersById[member.id] = member;
        });

        const messages =
            (data.whatsappMessages || [])
                .filter(message => message.direction !== "incoming")
                .sort((a, b) => Number(b.statusUpdatedAtMs || b.createdAtMs || 0) - Number(a.statusUpdatedAtMs || a.createdAtMs || 0));

        renderSummary(messages);
        renderMessages(messages, membersById);
    }
    catch (error) {
        console.error("WhatsApp message log load error:", error);
        summary.innerHTML =
            '<div class="empty-state">Could not load WhatsApp message history.</div>';
        list.innerHTML = "";
    }
}

initializePage();
