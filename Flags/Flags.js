import { db } from "../Firebase/Firebase.js";
import { getApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
    collection,
    getDocs,
    doc,
    setDoc,
    updateDoc,
    deleteField,
    query,
    orderBy,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import {
    getFunctions,
    httpsCallable
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-functions.js";

const flagsContainer = document.getElementById("flagsContainer");
const loadingMessage = document.getElementById("loadingMessage");
const noIssuesMessage = document.getElementById("noIssuesMessage");
const memberReminderList = document.getElementById("memberReminderList");
const selectionCount = document.getElementById("selectionCount");
const meetingTimeInput = document.getElementById("meetingTime");
const saveSelectionButton = document.getElementById("saveReminderSelection");
const sendRemindersButton = document.getElementById("sendWhatsAppReminders");
const reminderResult = document.getElementById("reminderResult");
const escapeHtml = value => (value || "").toString().replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
// This must match the region used by the deployed Cloud Function.
const functions = getFunctions(getApp(), "asia-south1");

let reminderMembers = [];

function memberPhone(member) {
    return member.whatsappNumber || member.phone || member.contact?.whatsappNumber || "";
}

function updateSelectionCount() {
    const selected = document.querySelectorAll(".send-reminder-checkbox:checked").length;
    selectionCount.textContent = `${selected} selected`;
}

function renderReminderMembers() {
    if (!reminderMembers.length) {
        memberReminderList.innerHTML = '<p class="empty-reminder-list">No members found.</p>';
        updateSelectionCount();
        return;
    }

    memberReminderList.innerHTML = reminderMembers.map(member => {
        const phone = memberPhone(member);
        const active = member.active !== false;
        const sendReminder = member.sendReminder === true;
        const status = member.reminderStatus || "not_sent";

        return `
            <article class="reminder-member" data-member-id="${member.id}">
                <div class="reminder-member-copy">
                    <strong>${escapeHtml(member.name || "Unnamed")}</strong>
                    <span>${phone ? escapeHtml(phone) : "No WhatsApp number"}</span>
                    <small>Status: ${escapeHtml(status)}</small>
                </div>

                <label class="member-option">
                    <input
                        type="checkbox"
                        class="active-member-checkbox"
                        ${active ? "checked" : ""}>
                    Active
                </label>

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

    // This one-time normalization keeps old member records compatible with
    // the new reminder function without touching attendance documents.
    if (needsNormalization) {
        await normalizationBatch.commit();
    }

    renderReminderMembers();
}

async function saveReminderSelection() {
    const rows = [...document.querySelectorAll(".reminder-member")];
    const batch = writeBatch(db);

    rows.forEach(row => {
        const memberId = row.dataset.memberId;
        const active = row.querySelector(".active-member-checkbox").checked;
        const sendReminder = row.querySelector(".send-reminder-checkbox").checked;

        batch.set(
            doc(db, "members", memberId),
            {
                active,
                sendReminder,
                reminderStatus: sendReminder ? "ready" : "not_selected"
            },
            { merge: true }
        );
    });

    await batch.commit();
    reminderResult.textContent = "Reminder selection saved.";
}

async function sendWhatsAppReminders() {
    const meetingTime = meetingTimeInput.value.trim();

    if (!meetingTime) {
        reminderResult.textContent = "Enter the meeting time before sending.";
        meetingTimeInput.focus();
        return;
    }

    if (!document.querySelector(".send-reminder-checkbox:checked")) {
        reminderResult.textContent = "Select at least one member.";
        return;
    }

    sendRemindersButton.disabled = true;
    saveSelectionButton.disabled = true;
    reminderResult.textContent = "Saving selection and sending reminders...";

    try {
        await saveReminderSelection();

        const callSendReminders = httpsCallable(functions, "sendWhatsAppReminders");
        const response = await callSendReminders({ meetingTime });
        const { attempted, succeeded, failed } = response.data;

        reminderResult.textContent =
            `Finished: ${succeeded} sent, ${failed} failed, ${attempted} attempted.`;

        await loadReminderMembers();
    }
    catch (error) {
        console.error("WhatsApp reminder error:", error);
        reminderResult.textContent =
            error.message || "Could not send WhatsApp reminders.";
    }
    finally {
        sendRemindersButton.disabled = false;
        saveSelectionButton.disabled = false;
    }
}

async function loadFlags() {
    try {
        const [memberDocs, sessionDocs, attendanceDocs, flagDocs] = await Promise.all([
            getDocs(collection(db,"members")),
            getDocs(query(collection(db,"sessions"),orderBy("createdAt"))),
            getDocs(collection(db,"attendance")),
            getDocs(collection(db,"flags"))
        ]);
        const members = {}, streaks = {}, attendance = {}, flags = {};
        memberDocs.forEach(item => { members[item.id]={id:item.id,...item.data()}; streaks[item.id]=0; });
        attendanceDocs.forEach(item => { const data=item.data(); attendance[item.id]=data.records||data; });
        flagDocs.forEach(item => { flags[item.id]=item.data(); });
        sessionDocs.forEach(session => {
            Object.entries(attendance[session.id]||{}).forEach(([memberId,record]) => {
                if (!(memberId in streaks) || !record?.status) return;
                if (record.status==="Present") streaks[memberId]=0;
                if (record.status==="Absent") streaks[memberId]++;
            });
        });
        const ids=Object.keys(members).filter(id=>streaks[id]>=2||flags[id]?.manualFlag);
        loadingMessage.style.display="none";
        noIssuesMessage.style.display=ids.length?"none":"block";
        flagsContainer.innerHTML=ids.map(id=>{
            const member=members[id], flag=flags[id]||{}, streak=streaks[id];
            const manual=Boolean(flag.manualFlag), severe=manual||streak>=3;
            const contacted=streak>=3&&streak<=(flag.contactedAtStreak||0);
            return `<article class="flag-card ${severe?"flagged-card":"warning-card"}">
                <div class="flag-card-top"><div><p class="flag-kicker">${manual?"Manual flag":"Attendance warning"}</p><h2 class="member-name">${escapeHtml(member.name||"Unnamed")}</h2></div><span class="flag-badge">${severe?"FLAGGED":"WARNING"}</span></div>
                ${manual?`<p class="flag-reason">${escapeHtml(flag.reason||"Needs attention")}</p>`:""}
                ${streak>=2?`<p><strong>${streak}</strong> consecutive absences</p>`:""}
                <p>${member.whatsappNumber||member.phone?`WhatsApp: ${escapeHtml(member.whatsappNumber||member.phone)}`:"No WhatsApp number on record"}</p>
                <div class="flag-card-actions">
                    <a class="secondary-link" href="../Database/VolunteerRecords.html?member=${encodeURIComponent(id)}">View profile</a>
                    ${streak>=3&&!contacted?`<button class="contact-button" onclick="markContacted('${id}',${streak})">Mark contacted</button>`:""}
                    ${contacted?'<span class="contacted-text">Contacted</span>':""}
                    ${manual?`<button class="remove-flag-button" onclick="removeFlag('${id}')">Remove flag</button>`:""}
                </div></article>`;
        }).join("");
    } catch(error) {
        console.error("Flags Error:",error);
        loadingMessage.textContent="Error loading attendance records.";
    }
}

window.markContacted=async function(memberId,streak){
    await setDoc(doc(db,"flags",memberId),{contactedAtStreak:streak,contactedAt:Date.now()},{merge:true});
    loadFlags();
};
window.removeFlag=async function(memberId){
    if (!confirm("Remove this person's manual flag?")) return;
    await updateDoc(doc(db,"flags",memberId),{
        manualFlag:deleteField(),
        reason:deleteField(),
        source:deleteField(),
        flaggedAt:deleteField()
    });
    loadFlags();
};
loadFlags();

memberReminderList.addEventListener("change", event => {
    if (event.target.classList.contains("send-reminder-checkbox")) {
        updateSelectionCount();
    }
});

saveSelectionButton.addEventListener("click", async () => {
    saveSelectionButton.disabled = true;
    reminderResult.textContent = "Saving selection...";

    try {
        await saveReminderSelection();
    }
    catch (error) {
        console.error("Reminder selection error:", error);
        reminderResult.textContent = "Could not save the reminder selection.";
    }
    finally {
        saveSelectionButton.disabled = false;
    }
});

sendRemindersButton.addEventListener("click", sendWhatsAppReminders);

loadReminderMembers().catch(error => {
    console.error("Member reminder load error:", error);
    memberReminderList.textContent = "Could not load members.";
});
