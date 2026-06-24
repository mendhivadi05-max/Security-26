const admin = require("firebase-admin");

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not configured.`);
    }
    return value;
}

function privateKey() {
    return requiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
}

function initializeAdmin() {
    if (admin.apps.length) {
        return admin.app();
    }

    return admin.initializeApp({
        credential: admin.credential.cert({
            projectId: requiredEnv("FIREBASE_PROJECT_ID"),
            clientEmail: requiredEnv("FIREBASE_CLIENT_EMAIL"),
            privateKey: privateKey()
        })
    });
}

function firestore() {
    initializeAdmin();
    return admin.firestore();
}

module.exports = {
    admin,
    firestore
};
