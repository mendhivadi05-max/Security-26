const { applicationDefault, cert, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const email = (process.argv[2] || "").trim().toLowerCase();
const password = process.argv[3] || "";
const displayName = process.argv[4] || email.split("@")[0];

if (!email.includes("@") || password.length < 12) {
    console.error(
        "Usage: node scripts/set-firebase-user.js <email> <password-of-12+-characters> [display-name]"
    );
    process.exit(1);
}

function loadLocalEnvironment(filePath) {
    const fs = require("fs");
    if (!fs.existsSync(filePath)) {
        return;
    }

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (!line || line.startsWith("#")) {
            continue;
        }

        const separator = line.indexOf("=");
        if (separator === -1) {
            continue;
        }

        const name = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        const quote = value[0];
        if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
            value = value.slice(1, -1);
        }
        value = value.replace(/\\n/g, "\n");
        if (name && process.env[name] === undefined) {
            process.env[name] = value;
        }
    }
}

function credential() {
    if (
        process.env.FIREBASE_PROJECT_ID &&
        process.env.FIREBASE_CLIENT_EMAIL &&
        process.env.FIREBASE_PRIVATE_KEY
    ) {
        return cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
        });
    }

    return applicationDefault();
}

loadLocalEnvironment(require("path").join(__dirname, "..", ".env.local"));

initializeApp({
    credential: credential(),
    projectId: process.env.FIREBASE_PROJECT_ID || "clubdeskin"
});

async function main() {
    const auth = getAuth();
    try {
        const existing = await auth.getUserByEmail(email);
        await auth.updateUser(existing.uid, { password, displayName, disabled: false });
        console.log(`Updated Firebase Authentication user: ${email}`);
    }
    catch (error) {
        if (error.code !== "auth/user-not-found") {
            throw error;
        }
        await auth.createUser({ email, password, displayName, disabled: false });
        console.log(`Created Firebase Authentication user: ${email}`);
    }
}

main().catch(error => {
    console.error(error.message || error);
    process.exit(1);
});
