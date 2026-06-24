import { db } from "../Firebase/Firebase.js";
import { showSuccess, showErrorToast } from "../Shared/Toast.js";
import { logClientAction } from "../Shared/ActionLog.js";
import {
    collection,
    getDocs,
    doc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const memberReminderList = document.getElementById("memberReminderList");
const selectionCount = document.getElementById("selectionCount");
const meetingTimeInput = document.getElementById("meetingTime");
const reminderSearchInput = document.getElementById("reminderSearch");
const selectAllRemindersButton = document.getElementById("selectAllReminders");
const saveSelectionButton = document.getElementById("saveReminderSelection");
const sendRemindersButton = document.getElementById("sendWhatsAppReminders");
const reminderResult = document.getElementById("reminderResult");
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
    reminderResult.textContent = "Everyone with a WhatsApp number is selected.";
    showSuccess("Everyone with a WhatsApp number is selected.");
}

function selectedMembers() {
    return reminderMembers.filter(member => member.sendReminder === true && memberPhone(member));
}

async function loadReminderMembers() {
    const memberDocs = await getDocs(collection(db, "members"));
    const normalizationBatch = writeBatch(db);
    let needsNormalization = false;

    reminderMembers = memberDocs.docs.map(memberDoc => {
        const member = { id: memberDoc.id, ...memberDoc.data() };
        const normalizedPhone = memberPhone(member);
        const missingFields =
            typeof member.active !== "boolean" ||
            typeof member.sendReminder !== "boolean" ||
            !Object.hasOwn(member, "reminderStatus") ||
            (normalizedPhone && !member.whatsappNumber);

        if (missingFields) {
            needsNormalization = true;
            normalizationBatch.set(
                memberDoc.ref,
                {
                    phone: member.phone || normalizedPhone,
                    whatsappNumber: member.whatsappNumber || normalizedPhone,
                    active: member.active !== false,
                    sendReminder: member.sendReminder === true,
                    lastReminderSentAt: member.lastReminderSentAt || null,
                    reminderStatus: member.reminderStatus || "not_sent"
                },
                { merge: true }
            );
        }

        return member;
    });

    if (needsNormalization) {
        await normalizationBatch.commit();
    }

    renderReminderMembers();
}

async function saveReminderSelection({ silent = false } = {}) {
    const batch = writeBatch(db);

    reminderMembers.forEach(member => {
        batch.set(
            doc(db, "members", member.id),
            {
                active: member.sendReminder ? true : member.active !== false,
                sendReminder: member.sendReminder === true,
                reminderStatus: member.sendReminder ? "ready" : "not_selected"
            },
            { merge: true }
        );
    });

    await batch.commit();
    if (!silent) {
        reminderResult.textContent = "Reminder selection saved.";
        showSuccess("Reminder selection saved.");
    }
    await logClientAction("whatsapp_reminder_selection_saved", {
        selectedCount: reminderMembers.filter(member => member.sendReminder === true).length
    });
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

    pendingSendMemberIds = memberIds;
    sendConfirmSummary.textContent =
        `${recipients.length} recipient${recipients.length === 1 ? "" : "s"} will receive club_meeting_reminder for ${meetingTime}.`;
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
    reminderResult.textContent = "Sending reminders...";

    try {
        const response = await fetch("/api/whatsapp/send-reminders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ meetingTime, memberIds })
        });
        const result = await response.json();
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
            }
        }
    }

    if (event.target.classList.contains("send-reminder-checkbox")) {
        updateSelectionCount();
    }
});

reminderSearchInput.addEventListener("input", renderReminderMembers);

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

loadReminderMembers().catch(error => {
    console.error("Member reminder load error:", error);
    memberReminderList.textContent = "Could not load members.";
    showErrorToast("Could not load members.");
});
