const fs = require("fs");
const path = require("path");
const { cert, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

function loadLocalEnvironment(filePath) {
    if (!fs.existsSync(filePath)) {
        return;
    }

    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!match) {
            continue;
        }

        let value = match[2].trim();
        const quote = value[0];
        if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
            value = value.slice(1, -1);
        }
        if (process.env[match[1]] === undefined) {
            process.env[match[1]] = value.replace(/\\n/g, "\n");
        }
    }
}

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email.includes("@")) {
    console.error("Usage: node scripts/delete-firebase-user.js <email>");
    process.exit(1);
}

loadLocalEnvironment(path.join(__dirname, "..", ".env.local"));

initializeApp({
    credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY
    })
});

async function main() {
    try {
        const user = await getAuth().getUserByEmail(email);
        await getAuth().deleteUser(user.uid);
        console.log(`Deleted Firebase Authentication user: ${email}`);
    }
    catch (error) {
        if (error.code === "auth/user-not-found") {
            console.log(`Firebase Authentication user was already absent: ${email}`);
            return;
        }
        throw error;
    }
}

main().catch(error => {
    console.error(error.message || error);
    process.exit(1);
});
