import { db } from "../Firebase/Firebase.js";
import { collection, getDocs, doc, setDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const flagsContainer = document.getElementById("flagsContainer");
const loadingMessage = document.getElementById("loadingMessage");
const noIssuesMessage = document.getElementById("noIssuesMessage");
const escapeHtml = value => (value || "").toString().replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

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
                <p>${member.phone?`Phone: ${escapeHtml(member.phone)}`:"No phone number on record"}</p>
                <div class="flag-card-actions">
                    <a class="secondary-link" href="../Database/VolunteerRecords.html?member=${encodeURIComponent(id)}">View profile</a>
                    ${streak>=3&&!contacted?`<button class="contact-button" onclick="markContacted('${id}',${streak})">Mark contacted</button>`:""}
                    ${contacted?'<span class="contacted-text">Contacted</span>':""}
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
loadFlags();
