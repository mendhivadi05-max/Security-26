const projectId = "clubdeskin";
const apiKey = "AIzaSyDW2tNJCiXLEEUirjEzxHUaBQL6026KcGY";
const root = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const collections = ["attendance", "sessions", "memberNotes", "flags", "members"];

const endpoint = path =>
  `${root}${path}${path.includes("?") ? "&" : "?"}key=${apiKey}`;

async function request(path, options = {}) {
  const response = await fetch(endpoint(path), {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}

async function listDocuments(collectionId) {
  const documents = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ pageSize: "100" });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await request(`/${collectionId}?${query}`);
    documents.push(...(page.documents || []));
    pageToken = page.nextPageToken || "";
  } while (pageToken);
  return documents;
}

async function clearCollection(collectionId) {
  const documents = await listDocuments(collectionId);
  for (const document of documents) {
    await request(`/${document.name.split("/documents/")[1]}`, { method: "DELETE" });
  }
  return documents.length;
}

async function put(collectionId, documentId, fields) {
  await request(`/${collectionId}/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
}

const users = [
  { id: "wa-9820166830", name: "WhatsApp User 1", phone: "9820166830" },
  { id: "wa-9702746664", name: "WhatsApp User 2", phone: "9702746664" },
  { id: "wa-9967986864", name: "WhatsApp User 3", phone: "9967986864" },
];

const deleted = {};
for (const collectionId of collections) {
  deleted[collectionId] = await clearCollection(collectionId);
}

const now = Date.now();
for (const [index, user] of users.entries()) {
  const createdAt = now + index;
  const e164 = `+91${user.phone}`;
  const metaNumber = `91${user.phone}`;

  await put("members", user.id, {
    name: { stringValue: user.name },
    dateOfBirth: { stringValue: "2000-01-01" },
    gender: { stringValue: "Other" },
    course: { stringValue: "WhatsApp Bot Pilot" },
    batch: { stringValue: "2026" },
    prn: { stringValue: `WA${String(index + 1).padStart(3, "0")}` },
    phone: { stringValue: metaNumber },
    whatsappNumber: { stringValue: metaNumber },
    whatsappE164: { stringValue: e164 },
    countryCode: { stringValue: "91" },
    active: { booleanValue: true },
    sendReminder: { booleanValue: true },
    reminderStatus: { stringValue: "ready" },
    lastReminderSentAt: { nullValue: null },
    botOptIn: { booleanValue: true },
    botLanguage: { stringValue: "en" },
    botTags: {
      arrayValue: {
        values: [
          { stringValue: "attendance" },
          { stringValue: "class-reminders" },
          { stringValue: "pilot-user" },
        ],
      },
    },
    image: { stringValue: "" },
    createdAt: { integerValue: String(createdAt) },
    contact: {
      mapValue: {
        fields: {
          whatsappNumber: { stringValue: metaNumber },
          localNumber: { stringValue: user.phone },
          e164: { stringValue: e164 },
        },
      },
    },
    profile: {
      mapValue: {
        fields: {
          name: { stringValue: user.name },
          dateOfBirth: { stringValue: "2000-01-01" },
          gender: { stringValue: "Other" },
          course: { stringValue: "WhatsApp Bot Pilot" },
          batch: { stringValue: "2026" },
          image: { stringValue: "" },
        },
      },
    },
    metadata: {
      mapValue: {
        fields: {
          createdAt: { integerValue: String(createdAt) },
          updatedAt: { integerValue: String(createdAt) },
          schemaVersion: { integerValue: "2" },
          source: { stringValue: "whatsapp-bot-seed" },
        },
      },
    },
  });
}

const attendanceSummary = Object.fromEntries(users.map(user => [user.phone, []]));

for (let index = 0; index < 10; index += 1) {
  const sessionId = `class-${String(index + 1).padStart(2, "0")}`;
  const dateObject = new Date(Date.UTC(2026, 5, 12 + index));
  const date = dateObject.toISOString().slice(0, 10);
  const createdAt = dateObject.getTime() + 10 * 60 * 60 * 1000;

  await put("sessions", sessionId, {
    title: { stringValue: `Class ${index + 1}` },
    hostedBy: { stringValue: "Neev" },
    venue: { stringValue: "Classroom" },
    time: { stringValue: "10:00" },
    note: { stringValue: "WhatsApp bot attendance test class" },
    defaultStatus: { stringValue: "Present" },
    date: { stringValue: date },
    locked: { booleanValue: index < 9 },
    createdAt: { integerValue: String(createdAt) },
    reminderChannel: { stringValue: "whatsapp" },
    reminderTemplate: { stringValue: "club_meeting_reminder" },
  });

  const recordFields = {};
  for (const [userIndex, user] of users.entries()) {
    const status = Math.random() < 0.72 ? "Present" : "Absent";
    attendanceSummary[user.phone].push(status);
    recordFields[user.id] = {
      mapValue: {
        fields: {
          name: { stringValue: user.name },
          rollNumber: { stringValue: `WA${String(userIndex + 1).padStart(3, "0")}` },
          status: { stringValue: status },
          whatsappNumber: { stringValue: `91${user.phone}` },
        },
      },
    };
  }

  await put("attendance", sessionId, {
    savedAt: { integerValue: String(createdAt + 60 * 60 * 1000) },
    records: { mapValue: { fields: recordFields } },
  });
}

const verification = {};
for (const collectionId of collections) {
  verification[collectionId] = (await listDocuments(collectionId)).length;
}

console.log(JSON.stringify({ deleted, verification, attendanceSummary }, null, 2));
