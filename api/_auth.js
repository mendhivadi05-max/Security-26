const crypto = require("crypto");

const VERIFY_CACHE_MS = 5 * 60 * 1000;
const VERIFY_CACHE_MAX = 250;
const verifiedTokenCache = new Map();

function firebaseApiKey() {
    if (!process.env.FIREBASE_API_KEY) {
        throw new Error("FIREBASE_API_KEY is not configured.");
    }
    return process.env.FIREBASE_API_KEY;
}

function tokenCacheKey(idToken) {
    return crypto.createHash("sha256").update(idToken).digest("hex");
}

function cachedVerifiedUser(idToken) {
    const key = tokenCacheKey(idToken);
    const cached = verifiedTokenCache.get(key);
    if (!cached || cached.expiresAt <= Date.now()) {
        verifiedTokenCache.delete(key);
        return null;
    }
    return cached.user;
}

function cacheVerifiedUser(idToken, user) {
    const key = tokenCacheKey(idToken);
    verifiedTokenCache.set(key, {
        user,
        expiresAt: Date.now() + VERIFY_CACHE_MS
    });

    if (verifiedTokenCache.size > VERIFY_CACHE_MAX) {
        verifiedTokenCache.delete(verifiedTokenCache.keys().next().value);
    }
}

function parseCookies(request) {
    return Object.fromEntries(
        (request.headers.cookie || "")
            .split(";")
            .map(value => value.trim())
            .filter(Boolean)
            .map(value => {
                const separator = value.indexOf("=");
                return separator === -1
                    ? [value, ""]
                    : [value.slice(0, separator), decodeURIComponent(value.slice(separator + 1))];
            })
    );
}

function sessionCookie(idToken, maxAge) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return `clubDeskSession=${encodeURIComponent(idToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

function normalizeLoginEmail(identifier) {
    const value = String(identifier || "").trim().toLowerCase();
    if (!value) {
        return "";
    }

    if (value.includes("@")) {
        return value;
    }

    const domain = (process.env.LOGIN_EMAIL_DOMAIN || "gmail.com")
        .trim()
        .replace(/^@+/, "")
        .toLowerCase();

    return `${value}@${domain}`;
}

function isTurnstileConfigured() {
    return Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);
}

async function verifyTurnstile(token, remoteIp) {
    if (!process.env.TURNSTILE_SECRET_KEY) {
        throw new Error("TURNSTILE_SECRET_KEY is not configured.");
    }

    const body = new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token || ""
    });
    if (remoteIp) {
        body.set("remoteip", remoteIp);
    }

    try {
        const response = await fetch(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            { method: "POST", body }
        );
        if (!response.ok) {
            throw new Error(`Cloudflare returned HTTP ${response.status}.`);
        }
        const result = await response.json();
        return result.success === true;
    }
    catch (error) {
        throw new Error(
            "The server could not contact Cloudflare Turnstile. Check the server internet connection."
        );
    }
}

async function firebasePasswordLogin(email, password) {
    const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey()}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email,
                password,
                returnSecureToken: true
            })
        }
    );
    const result = await response.json();
    if (!response.ok) {
        const code = result.error?.message || "";
        if (["EMAIL_NOT_FOUND", "INVALID_PASSWORD", "INVALID_LOGIN_CREDENTIALS"].includes(code)) {
            throw new Error("Incorrect username or password.");
        }
        throw new Error("Firebase Authentication rejected the login.");
    }
    return result;
}

async function verifyFirebaseToken(idToken) {
    if (!idToken) {
        return null;
    }

    const cached = cachedVerifiedUser(idToken);
    if (cached) {
        return cached;
    }

    const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey()}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken })
        }
    );
    const result = await response.json();
    const user = response.ok ? result.users?.[0] || null : null;
    if (user) {
        cacheVerifiedUser(idToken, user);
    }
    return user;
}

module.exports = {
    firebasePasswordLogin,
    isTurnstileConfigured,
    normalizeLoginEmail,
    parseCookies,
    sessionCookie,
    verifyFirebaseToken,
    verifyTurnstile
};
