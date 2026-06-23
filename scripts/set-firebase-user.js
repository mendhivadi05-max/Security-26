const { applicationDefault, initializeApp } = require("firebase-admin/app");
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

initializeApp({
    credential: applicationDefault(),
    projectId: "clubdeskin"
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
