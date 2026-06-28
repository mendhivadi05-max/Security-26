import { showSuccess, showErrorToast } from "../Shared/Toast.js";
import { apiGet, apiPost, loadCollections } from "../Shared/Api.js";

const memberReminderList = document.getElementById("memberReminderList");
const selectionCount = document.getElementById("selectionCount");
const meetingTimeInput = document.getElementById("meetingTime");
const reminderSearchInput = document.getElementById("reminderSearch");
const selectAllRemindersButton = document.getElementById("selectAllReminders");
const saveSelectionButton = document.getElementById("saveReminderSelection");
const sendRemindersButton = document.getElementById("sendWhatsAppReminders");
const reminderResult = document.getElementById("reminderResult");
const safeguardsPanel = document.getElementById("whatsappSafeguards");
const sendConfirmModal = document.getElementById("sendConfirmModal");
const sendConfirmSummary = document.getElementById("sendConfirmSummary");
const sendConfirmRecipients = document.getElementById("sendConfirmRecipients");
const confirmSendRemindersButton = document.getElementById("confirmSendReminders");
const cancelSendRemindersButton = document.getElementById("cancelSendReminders");

const escapeHtml = value => (value || "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

let reminderMembers = [];
let pendingSendMemberIds = [];
let lastFailedMemberIds = [];
let prepareTimer = null;
let prepareController = null;
let latestPreparation = null;
let diagnosticsReady = false;
let readinessState = { message: "", tone: "neutral" };

async function loadSafeguards() {
    try {
        const result = await apiGet("/api/whatsapp?action=safeguards");
        const safeguards = result.safeguards || {};
        safeguardsPanel.innerHTML = `
            <span>Recipient limit: <strong>${escapeHtml(safeguards.maxBatchSize)}</strong></span>
            <span>Daily cap: <strong>${escapeHtml(safeguards.dailySendLimit)}</strong></span>
            <span>Cooldown: <strong>${escapeHtml(safeguards.memberCooldownMinutes)} min</strong></span>
        `;
    }
    catch (error) {
        safeguardsPanel.textContent = error.message || "Could not load WhatsApp safeguards.";
    }
}

function setReadiness(message, tone = "neutral") {
    readinessState = { message, tone };
}

async function warmWhatsAppBackend() {
    try {
        const diagnostics = await apiGet("/api/whatsapp?action=diagnostics");
        diagnosticsReady = true;

        const missing = (diagnostics.environment || [])
            .filter(item => !item.configured && [
                "META_WHATSAPP_ACCESS_TOKEN",
                "META_WHATSAPP_PHONE_NUMBER_ID",
                "WHATSAPP_TEMPLATE_MEETING_REMINDER"
            ].includes(item.name))
            .map(item => item.name);

        if (missing.length) {
            setReadiness(`WhatsApp needs configuration: ${missing.join(", ")}.`, "warning");
            return;
        }

        setReadiness("WhatsApp backend and templates are loaded.", "success");
    }
    catch (error) {
        diagnosticsReady = false;
        setReadiness(error.message || "Could not preload WhatsApp templates.", "warning");
    }
}

function normalizedSearch(value) {
    return (value || "").toString().toLowerCase().replace(/[^\da-z]/g, "");
}

function memberPhone(member) {
    return member.whatsappNumber || member.phone || member.contact?.whatsappNumber || "";
}

function updateSelectionCount() {
    const selected = reminderMembers.filter(member => member.sendReminder === true).length;
    selectionCount.textContent = `${selected} selected`;
}

function renderReminderMembers() {
    const query = normalizedSearch(reminderSearchInput.value);
    const visibleMembers = reminderMembers.filter(member => {
        if (!query) {
            return true;
        }

        return (
            normalizedSearch(member.name).includes(query) ||
            normalizedSearch(memberPhone(member)).includes(query)
        );
    });

    if (!visibleMembers.length) {
        memberReminderList.innerHTML = `
            <div class="empty-state-panel reminder-empty-state">
                <strong>No matching members found.</strong>
                <span>Try a different name or phone number.</span>
            </div>
        `;
        updateSelectionCount();
        return;
    }

    memberReminderList.innerHTML = visibleMembers.map(member => {
        const phone = memberPhone(member);
        const sendReminder = member.sendReminder === true;
        return `
            <article class="reminder-member" data-member-id="${member.id}">
                <div class="reminder-member-copy">
                    <div class="reminder-member-title">
                        <strong>${escapeHtml(member.name || "Unnamed")}</strong>
                        <span>${phone ? escapeHtml(phone) : "No WhatsApp number"}</span>
                    </div>
                </div>

                <label class="member-option">
                    <input
                        type="checkbox"
                        class="send-reminder-checkbox"
                        ${sendReminder ? "checked" : ""}
                        ${phone ? "" : "disabled"}>
                    Send reminder
                </label>
            </article>
        `;
    }).join("");

    updateSelectionCount();
}

function selectEveryone() {
    reminderMembers = reminderMembers.map(member => ({
        ...member,
        active: true,
        sendReminder: Boolean(memberPhone(member))
    }));

    renderReminderMembers();
    scheduleReminderPreparation({ immediate: true });
    reminderResult.textContent = "Everyone with a WhatsApp number is selected.";
    showSuccess("Everyone with a WhatsApp number is selected.");
}

function selectedMembers() {
    return reminderMembers.filter(member => member.sendReminder === true && memberPhone(member));
}

function selectedMemberIds() {
    return selectedMembers().map(member => member.id);
}

function scheduleReminderPreparation({ immediate = false } = {}) {
    clearTimeout(prepareTimer);
    prepareTimer = setTimeout(prepareSelectedReminders, immediate ? 0 : 450);
}

async function prepareSelectedReminders() {
    const memberIds = selectedMemberIds();
    const meetingTime = meetingTimeInput.value.trim();

    if (!diagnosticsReady) {
        setReadiness("Preparing WhatsApp backend...");
    }

    if (!memberIds.length) {
        latestPreparation = null;
        setReadiness("Select members to prepare WhatsApp reminders.");
        return;
    }

    if (prepareController) {
        prepareController.abort();
    }

    prepareController = new AbortController();
    setReadiness("Preparing selected WhatsApp reminders...");

    try {
        const response = await fetch("/api/whatsapp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            signal: prepareController.signal,
            body: JSON.stringify({ action: "prepare-reminders", meetingTime, memberIds })
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(result.error || "Could not prepare reminders.");
        }

        latestPreparation = result;
        if (!result.environmentReady) {
            setReadiness("WhatsApp environment is incomplete. Check Vercel env vars.", "warning");
            return;
        }

        if (!result.meetingTimeReady) {
            setReadiness(`${result.readyCount} recipient${result.readyCount === 1 ? "" : "s"} prepared. Add meeting time before sending.`, "neutral");
            return;
        }

        setReadiness(`${result.readyCount} recipient${result.readyCount === 1 ? "" : "s"} prepared for ${meetingTime}.`, "success");
    }
    catch (error) {
        if (error.name === "AbortError") {
            return;
        }
        latestPreparation = null;
        setReadiness(error.message || "Could not prepare reminders.", "warning");
    }
}

async function loadReminderMembers() {
    const data = await loadCollections(["members"]);

    reminderMembers = (data.members || []).map(member => ({
        ...member,
        active: member.active !== false,
        sendReminder: member.sendReminder === true,
        reminderStatus: member.reminderStatus || "not_sent"
    }));

    renderReminderMembers();
    scheduleReminderPreparation({ immediate: true });
}

async function saveReminderSelection({ silent = false } = {}) {
    await apiPost("/api/data", {
        action: "updateMemberReminderSelection",
        members: reminderMembers.map(member => ({
            id: member.id,
            active: member.active !== false,
            sendReminder: member.sendReminder === true
        }))
    });

    if (!silent) {
        reminderResult.textContent = "Reminder selection saved.";
        showSuccess("Reminder selection saved.");
    }
}

function renderSendResult(result, { allowRetry = true } = {}) {
    const failed = (result.results || [])
        .filter(item => !item.ok)
        .map(item => {
            const member = reminderMembers.find(candidate => candidate.id === item.memberId) || {};
            const name = member.name || item.memberId || "Unknown member";
            const phone = memberPhone(member) || item.to || "No number";
            const error = item.error ? ` - ${item.error}` : "";

            return `<li><strong>${escapeHtml(name)}</strong> <span>${escapeHtml(phone)}</span>${escapeHtml(error)}</li>`;
        });

    reminderResult.innerHTML = `
        <span>Finished: ${result.sent} sent, ${result.failed} failed, ${result.total} attempted.</span>
        ${failed.length ? `
            <div class="failed-reminder-list">
                <strong>Could not deliver to:</strong>
                <ul>${failed.join("")}</ul>
                ${allowRetry ? '<button type="button" class="retry-failed-button" id="retryFailedReminders">Retry failed only</button>' : ""}
            </div>
        ` : ""}
    `;

    lastFailedMemberIds = (result.results || [])
        .filter(item => !item.ok && item.memberId)
        .map(item => item.memberId);
}

function openSendConfirmation(memberIds) {
    const meetingTime = meetingTimeInput.value.trim();
    const recipients = memberIds
        .map(memberId => reminderMembers.find(member => member.id === memberId))
        .filter(Boolean);
    const prepared = latestPreparation?.readyCount ?? recipients.length;

    pendingSendMemberIds = memberIds;
    sendConfirmSummary.textContent =
        `${prepared} recipient${prepared === 1 ? "" : "s"} prepared for club_meeting_reminder at ${meetingTime}.`;
    sendConfirmRecipients.innerHTML = recipients.map(member => `
        <div class="confirm-recipient-row">
            <strong>${escapeHtml(member.name || "Unnamed")}</strong>
            <span>${escapeHtml(memberPhone(member))}</span>
        </div>
    `).join("");
    sendConfirmModal.style.display = "flex";
}

function closeSendConfirmation() {
    sendConfirmModal.style.display = "none";
}

async function sendReminderBatch(memberIds, { allowRetry = true } = {}) {
    const meetingTime = meetingTimeInput.value.trim();

    sendRemindersButton.disabled = true;
    saveSelectionButton.disabled = true;
    confirmSendRemindersButton.disabled = true;
    reminderResult.textContent = "Sending reminders...";

    try {
        const response = await fetch("/api/whatsapp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ action: "send-reminders", meetingTime, memberIds })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || "Could not send WhatsApp reminders.");
        }

        renderSendResult(result, { allowRetry });
        if (result.failed > 0) {
            showErrorToast(`${result.failed} reminder message${result.failed === 1 ? "" : "s"} failed.`);
        }
        else {
            showSuccess(`${result.sent} reminder message${result.sent === 1 ? "" : "s"} sent.`);
        }

        await loadReminderMembers();
    }
    catch (error) {
        console.error("WhatsApp reminder error:", error);
        reminderResult.textContent =
            error.message || "Could not send WhatsApp reminders.";
        showErrorToast(error.message || "Could not send WhatsApp reminders.");
    }
    finally {
        sendRemindersButton.disabled = false;
        saveSelectionButton.disabled = false;
        confirmSendRemindersButton.disabled = false;
    }
}

async function confirmAndSendWhatsAppReminders() {
    const meetingTime = meetingTimeInput.value.trim();

    if (!meetingTime) {
        reminderResult.textContent = "Enter the meeting time before sending.";
        showErrorToast("Enter the meeting time before sending.");
        meetingTimeInput.focus();
        return;
    }

    const memberIds = selectedMembers().map(member => member.id);
    if (!memberIds.length) {
        reminderResult.textContent = "Select at least one member.";
        showErrorToast("Select at least one member.");
        return;
    }

    try {
        await prepareSelectedReminders();
        if (!latestPreparation?.environmentReady) {
            showErrorToast("WhatsApp is not fully configured yet.");
            return;
        }
        await saveReminderSelection({ silent: true });
        openSendConfirmation(memberIds);
    }
    catch (error) {
        console.error("Reminder preparation error:", error);
        showErrorToast("Could not prepare reminders.");
    }
}

memberReminderList.addEventListener("change", event => {
    const row = event.target.closest(".reminder-member");
    if (row) {
        const member = reminderMembers.find(item => item.id === row.dataset.memberId);
        if (member) {
            if (event.target.classList.contains("send-reminder-checkbox")) {
                member.sendReminder = event.target.checked;
                scheduleReminderPreparation();
            }
        }
    }

    if (event.target.classList.contains("send-reminder-checkbox")) {
        updateSelectionCount();
    }
});

reminderSearchInput.addEventListener("input", renderReminderMembers);

meetingTimeInput.addEventListener("input", () => {
    scheduleReminderPreparation();
});

selectAllRemindersButton.addEventListener("click", selectEveryone);

saveSelectionButton.addEventListener("click", async () => {
    saveSelectionButton.disabled = true;
    reminderResult.textContent = "Saving selection...";

    try {
        await saveReminderSelection();
    }
    catch (error) {
        console.error("Reminder selection error:", error);
        reminderResult.textContent = "Could not save the reminder selection.";
        showErrorToast("Could not save the reminder selection.");
    }
    finally {
        saveSelectionButton.disabled = false;
    }
});

sendRemindersButton.addEventListener("click", confirmAndSendWhatsAppReminders);

confirmSendRemindersButton.addEventListener("click", async () => {
    closeSendConfirmation();
    await sendReminderBatch(pendingSendMemberIds);
});

cancelSendRemindersButton.addEventListener("click", closeSendConfirmation);

reminderResult.addEventListener("click", async event => {
    if (!event.target.closest("#retryFailedReminders")) {
        return;
    }

    if (!lastFailedMemberIds.length) {
        showErrorToast("There are no failed reminders to retry.");
        return;
    }

    await sendReminderBatch(lastFailedMemberIds, { allowRetry: false });
});

loadSafeguards();
warmWhatsAppBackend();

loadReminderMembers().catch(error => {
    console.error("Member reminder load error:", error);
    memberReminderList.textContent = "Could not load members.";
    showErrorToast("Could not load members.");
});
