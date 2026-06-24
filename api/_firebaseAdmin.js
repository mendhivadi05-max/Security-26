const admin = require("firebase-admin");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

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
    return getFirestore();
}

module.exports = {
    admin,
    FieldValue,
    firestore
};
