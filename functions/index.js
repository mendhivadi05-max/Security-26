const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const {
    randomBytes,
    randomInt,
    scrypt: scryptCallback,
    timingSafeEqual,
    createHash
} = require("crypto");
const { promisify } = require("util");

initializeApp();

const db = getFirestore();
const whatsappToken = defineSecret("WHATSAPP_TOKEN");
const phoneNumberId = defineSecret("PHONE_NUMBER_ID");

const TEMPLATE_NAME = "club_meeting_reminder";
const TEMPLATE_LANGUAGE = "en";
const scrypt = promisify(scryptCallback);
const CAPTCHA_LIFETIME_MS = 5 * 60 * 1000;
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function normalizeUsername(value) {
    return (value || "").toString().trim().toLowerCase();
}

function hashToken(value) {
    return createHash("sha256").update(value).digest("hex");
}

async function verifyPassword(password, user) {
    if (!user.passwordHash || !user.passwordSalt) {
        return false;
    }

    const derived = await scrypt(password, user.passwordSalt, 64);
    const expected = Buffer.from(user.passwordHash, "hex");
    return expected.length === derived.length && timingSafeEqual(expected, derived);
}

exports.createLoginCaptcha = onCall(
    { region: "asia-south1" },
    async () => {
        const left = randomInt(2, 10);
        const right = randomInt(1, 10);
        const captchaId = randomBytes(24).toString("hex");

        await db.collection("authChallenges").doc(captchaId).set({
            answer: String(left + right),
            expiresAt: Date.now() + CAPTCHA_LIFETIME_MS,
            used: false,
            createdAt: FieldValue.serverTimestamp()
        });

        return {
            captchaId,
            question: `What is ${left} + ${right}?`
        };
    }
);

exports.verifyLogin = onCall(
    { region: "asia-south1" },
    async request => {
        const username = normalizeUsername(request.data?.username);
        const password = request.data?.password?.toString() || "";
        const captchaId = request.data?.captchaId?.toString() || "";
        const captchaAnswer = request.data?.captchaAnswer?.toString().trim() || "";

        if (
            !username ||
            username.length > 100 ||
            !password ||
            password.length > 500 ||
            !/^[a-f0-9]{48}$/.test(captchaId)
        ) {
            throw new HttpsError("invalid-argument", "Invalid login request.");
        }

        const challengeRef = db.collection("authChallenges").doc(captchaId);
        const challenge = await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(challengeRef);
            if (!snapshot.exists) {
                return null;
            }

            const value = snapshot.data();
            transaction.update(challengeRef, { used: true });
            return value;
        });

        if (
            !challenge ||
            challenge.used ||
            challenge.expiresAt < Date.now() ||
            challenge.answer !== captchaAnswer
        ) {
            throw new HttpsError(
                "failed-precondition",
                "The human-check answer was incorrect or expired."
            );
        }

        const rateRef = db.collection("authRateLimits").doc(hashToken(username));
        const rateSnapshot = await rateRef.get();
        const rate = rateSnapshot.data() || {};

        if (rate.lockedUntil && rate.lockedUntil > Date.now()) {
            throw new HttpsError(
                "resource-exhausted",
                "Too many failed attempts. Try again later."
            );
        }

        const userSnapshot = await db.collection("authUsers").doc(username).get();
        const user = userSnapshot.data();
        const accepted = user?.active !== false && await verifyPassword(password, user || {});

        if (!accepted) {
            const failures = (rate.failures || 0) + 1;
            await rateRef.set({
                failures: failures >= MAX_LOGIN_FAILURES ? 0 : failures,
                lockedUntil: failures >= MAX_LOGIN_FAILURES
                    ? Date.now() + LOCKOUT_MS
                    : 0,
                updatedAt: FieldValue.serverTimestamp()
            });

            throw new HttpsError(
                "permission-denied",
                "Incorrect username or password."
            );
        }

        await rateRef.delete();

        const sessionToken = randomBytes(32).toString("base64url");
        await db.collection("authSessions").doc(hashToken(sessionToken)).set({
            username,
            expiresAt: Date.now() + SESSION_LIFETIME_MS,
            createdAt: FieldValue.serverTimestamp()
        });

        return { sessionToken, username };
    }
);

exports.validateSession = onCall(
    { region: "asia-south1" },
    async request => {
        const sessionToken = request.data?.sessionToken?.toString() || "";
        if (!sessionToken) {
            throw new HttpsError("unauthenticated", "Login required.");
        }

        const session = await db
            .collection("authSessions")
            .doc(hashToken(sessionToken))
            .get();
        const data = session.data();

        if (!data || data.expiresAt < Date.now()) {
            throw new HttpsError("unauthenticated", "Your session has expired.");
        }

        return { valid: true, username: data.username };
    }
);

function normalizeWhatsAppNumber(value) {
    // Meta expects digits with country code, without spaces or a leading +.
    return (value || "").toString().replace(/\D/g, "");
}

exports.sendWhatsAppReminders = onCall(
    {
        region: "asia-south1",
        secrets: [whatsappToken, phoneNumberId],
        timeoutSeconds: 300
    },
    async request => {
        const meetingTime = request.data?.meetingTime?.toString().trim();

        if (!meetingTime || meetingTime.length > 100) {
            throw new HttpsError(
                "invalid-argument",
                "A valid meeting time is required."
            );
        }

        const membersSnapshot = await db
            .collection("members")
            .where("active", "==", true)
            .where("sendReminder", "==", true)
            .get();

        if (membersSnapshot.empty) {
            return { attempted: 0, succeeded: 0, failed: 0 };
        }

        let succeeded = 0;
        let failed = 0;

        // Process members individually so one bad number does not stop everyone.
        for (const memberDoc of membersSnapshot.docs) {
            const member = memberDoc.data();
            const number = normalizeWhatsAppNumber(
                member.whatsappNumber ||
                member.phone ||
                member.contact?.whatsappNumber
            );

            if (!number) {
                failed++;
                await memberDoc.ref.set(
                    {
                        reminderStatus: "failed",
                        reminderError: "Missing WhatsApp number",
                        lastReminderAttemptAt: FieldValue.serverTimestamp()
                    },
                    { merge: true }
                );
                continue;
            }

            try {
                const response = await fetch(
                    `https://graph.facebook.com/v23.0/${phoneNumberId.value()}/messages`,
                    {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${whatsappToken.value()}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            messaging_product: "whatsapp",
                            to: number,
                            type: "template",
                            template: {
                                name: TEMPLATE_NAME,
                                language: { code: TEMPLATE_LANGUAGE },
                                components: [
                                    {
                                        type: "body",
                                        parameters: [
                                            {
                                                type: "text",
                                                text: member.name || "Member"
                                            },
                                            {
                                                type: "text",
                                                text: meetingTime
                                            }
                                        ]
                                    }
                                ]
                            }
                        })
                    }
                );

                const responseBody = await response.json();

                if (!response.ok) {
                    throw new Error(
                        responseBody.error?.message ||
                        `Meta API returned HTTP ${response.status}`
                    );
                }

                succeeded++;
                await memberDoc.ref.set(
                    {
                        reminderStatus: "sent",
                        reminderError: FieldValue.delete(),
                        lastReminderSentAt: FieldValue.serverTimestamp(),
                        lastReminderAttemptAt: FieldValue.serverTimestamp(),
                        lastReminderMessageId: responseBody.messages?.[0]?.id || null
                    },
                    { merge: true }
                );

                logger.info("WhatsApp reminder sent", {
                    memberId: memberDoc.id,
                    messageId: responseBody.messages?.[0]?.id || null
                });
            }
            catch (error) {
                failed++;
                const safeMessage = error.message?.slice(0, 500) || "Unknown error";

                await memberDoc.ref.set(
                    {
                        reminderStatus: "failed",
                        reminderError: safeMessage,
                        lastReminderAttemptAt: FieldValue.serverTimestamp()
                    },
                    { merge: true }
                );

                logger.error("WhatsApp reminder failed", {
                    memberId: memberDoc.id,
                    error: safeMessage
                });
            }
        }

        return {
            attempted: membersSnapshot.size,
            succeeded,
            failed
        };
    }
);
