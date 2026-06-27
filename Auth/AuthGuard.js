const SESSION_CACHE_KEY = "clubDeskSessionCache";
const SESSION_CACHE_MS = 2 * 60 * 1000;

function cachedSession() {
    try {
        const cached = JSON.parse(sessionStorage.getItem(SESSION_CACHE_KEY) || "null");
        if (!cached || cached.expiresAt <= Date.now() || !cached.username) {
            sessionStorage.removeItem(SESSION_CACHE_KEY);
            return null;
        }
        return cached;
    }
    catch {
        return null;
    }
}

function cacheSession(username) {
    try {
        sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({
            username,
            expiresAt: Date.now() + SESSION_CACHE_MS
        }));
    }
    catch {
        // Session cache is a navigation speed hint only.
    }
}

async function guardPage() {
    document.body.style.visibility = "visible";
    const cached = cachedSession();
    if (cached) {
        sessionStorage.setItem("currentUserId", cached.username);
        verifySession({ background: true });
        return;
    }

    await verifySession();
}

async function verifySession({ background = false } = {}) {
    try {
        const response = await fetch("/api/session", {
            method: "GET",
            cache: "no-store"
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error);
        }

        sessionStorage.setItem("currentUserId", result.username);
        cacheSession(result.username);
    }
    catch {
        sessionStorage.removeItem("currentUserId");
        sessionStorage.removeItem(SESSION_CACHE_KEY);
        if (background) {
            await new Promise(resolve => window.setTimeout(resolve, 150));
        }
        window.location.replace("../Auth/Auth");
    }
}

guardPage();
