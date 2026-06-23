const FIREBASE_API_KEY =
    process.env.FIREBASE_API_KEY ||
    "AIzaSyDW2tNJCiXLEEUirjEzxHUaBQL6026KcGY";

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
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
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

    const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken })
        }
    );
    const result = await response.json();
    return response.ok ? result.users?.[0] || null : null;
}

module.exports = {
    firebasePasswordLogin,
    parseCookies,
    sessionCookie,
    verifyFirebaseToken,
    verifyTurnstile
};
