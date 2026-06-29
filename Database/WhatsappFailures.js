import { apiPost, loadCollections } from "../Shared/Api.js";
import { showSuccess, showErrorToast } from "../Shared/Toast.js";

const summary =
    document.getElementById("failureSummary");

const list =
    document.getElementById("failureList");

const count =
    document.getElementById("failureCount");

let failureMessages = [];
let membersById = {};

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

function memberPhone(member, message) {
    return text(member?.contact?.whatsappNumber || member?.whatsappNumber || member?.phone || message.to, "No phone recorded");
}

function templateLabel(templateKey) {
    const labels = {
        meetingReminder: "Meeting reminder",
        absentNotice: "Absent notice",
        absenceReview: "Absence review"
    };

    return labels[templateKey] || text(templateKey, "WhatsApp message");
}

function formatDate(message) {
    const value =
        Number(message.statusUpdatedAtMs || message.createdAtMs || 0);

    return value
        ? new Date(value).toLocaleString()
        : "No timestamp";
}

function failureReason(message) {
    return (
        message.deliveryErrorMessage ||
        message.deliveryErrorTitle ||
        message.deliveryErrorDetails ||
        message.error ||
        "WhatsApp reported this message as failed."
    );
}

function renderSummary() {
    const checked =
        failureMessages.filter(message => message.failureChecked === true).length;

    const unchecked =
        failureMessages.length - checked;

    const people =
        new Set(failureMessages.map(message => message.memberId).filter(Boolean)).size;

    summary.innerHTML = `
        <article class="summary-card absent-summary">
            <span>Open failures</span>
            <strong>${unchecked}</strong>
            <small>Need follow-up</small>
        </article>
        <article class="summary-card present-summary">
            <span>Checked</span>
            <strong>${checked}</strong>
            <small>Reviewed by admin</small>
        </article>
        <article class="summary-card">
            <span>Total failures</span>
            <strong>${failureMessages.length}</strong>
            <small>Recent WhatsApp history</small>
        </article>
        <article class="summary-card">
            <span>People affected</span>
            <strong>${people}</strong>
            <small>Unique volunteer records</small>
        </article>
    `;
}

function renderFailures() {
    count.textContent =
        `${failureMessages.length} shown`;

    renderSummary();

    if (!failureMessages.length) {
        list.innerHTML =
            '<div class="empty-state">No failed WhatsApp messages found.</div>';
        return;
    }

    list.innerHTML =
        failureMessages.map(message => {
            const member =
                membersById[message.memberId] || {};

            return `
                <article class="message-log-row ${message.failureChecked ? "is-checked" : ""}" data-message-id="${escapeHtml(message.id)}">
                    <div class="message-log-main">
                        <strong>${escapeHtml(memberName(member))}</strong>
                        <small>${escapeHtml(memberPhone(member, message))}</small>
                    </div>
                    <div class="message-log-template">
                        <strong>${escapeHtml(templateLabel(message.templateKey))}</strong>
                        <small>${escapeHtml(failureReason(message))}</small>
                        ${message.deliveryErrorCode ? `<small>Error code: ${escapeHtml(message.deliveryErrorCode)}</small>` : ""}
                    </div>
                    <div class="message-log-meta">
                        <span class="message-status is-failed">${escapeHtml(message.status || "failed")}</span>
                        <small>${escapeHtml(formatDate(message))}</small>
                        <button type="button" class="secondary-btn mark-failure-button" ${message.failureChecked ? "disabled" : ""}>
                            ${message.failureChecked ? "Checked" : "Mark checked"}
                        </button>
                    </div>
                </article>
            `;
        }).join("");
}

async function markFailureChecked(messageId) {
    const message =
        failureMessages.find(item => item.id === messageId);

    if (!message || message.failureChecked) {
        return;
    }

    try {
        await apiPost("/api/data", {
            action: "markWhatsAppFailureChecked",
            messageId
        });

        message.failureChecked = true;
        message.failureCheckedAtMs = Date.now();
        renderFailures();
        showSuccess("Failure marked as checked.");
    }
    catch (error) {
        console.error("Failure review save error:", error);
        showErrorToast("Could not mark that failure as checked.");
    }
}

async function initializePage() {
    try {
        const data =
            await loadCollections(["members", "whatsappMessages"], {
                limit: 500,
                force: true
            });

        membersById = {};
        (data.members || []).forEach(member => {
            membersById[member.id] = member;
        });

        failureMessages =
            (data.whatsappMessages || [])
                .filter(message => {
                    const status =
                        text(message.status, "").toLowerCase();

                    return (
                        message.direction !== "incoming" &&
                        (["failed", "undelivered"].includes(status) || message.deliveryErrorCode || message.deliveryErrorMessage || message.error)
                    );
                })
                .sort((a, b) => Number(b.statusUpdatedAtMs || b.createdAtMs || 0) - Number(a.statusUpdatedAtMs || a.createdAtMs || 0));

        renderFailures();
    }
    catch (error) {
        console.error("WhatsApp failures load error:", error);
        summary.innerHTML =
            '<div class="empty-state">Could not load delivery failures.</div>';
        list.innerHTML = "";
    }
}

list.addEventListener("click", event => {
    const button =
        event.target.closest(".mark-failure-button");

    if (!button) {
        return;
    }

    const row =
        event.target.closest("[data-message-id]");

    if (row) {
        markFailureChecked(row.dataset.messageId);
    }
});

initializePage();
