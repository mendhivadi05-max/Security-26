const crypto = require("crypto");
const { parseCookies, verifyFirebaseToken } = require("./_auth");

const buckets = new Map();

function requestIp(request) {
    return (
        request.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        request.socket?.remoteAddress ||
        "unknown"
    );
}

function jsonBody(request) {
    if (request.body && typeof request.body === "object") {
        return request.body;
    }

    if (typeof request.body === "string" && request.body.trim()) {
        return JSON.parse(request.body);
    }

    return {};
}

function requestId() {
    return crypto.randomUUID();
}

function requestHost(request) {
    return (
        request.headers["x-forwarded-host"] ||
        request.headers.host ||
        ""
    ).toString().split(",")[0].trim().toLowerCase();
}

function assertSameOrigin(request) {
    const origin = request.headers.origin || request.headers.referer;
    if (!origin) {
        return;
    }

    let originHost = "";
    try {
        originHost = new URL(origin).host.toLowerCase();
    }
    catch {
        const error = new Error("Invalid request origin.");
        error.statusCode = 403;
        throw error;
    }

    if (originHost !== requestHost(request)) {
        const error = new Error("Request origin is not allowed.");
        error.statusCode = 403;
        throw error;
    }
}

async function requireAdmin(request) {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method || "GET")) {
        assertSameOrigin(request);
    }

    const user = await verifyFirebaseToken(parseCookies(request).clubDeskSession);
    if (!user) {
        const error = new Error("Your session has expired.");
        error.statusCode = 401;
        throw error;
    }
    return user;
}

function rateLimit(request, options = {}) {
    const limit = options.limit || 12;
    const windowMs = options.windowMs || 60_000;
    const key = `${options.key || "default"}:${requestIp(request)}`;
    const now = Date.now();
    const bucket = buckets.get(key) || { resetAt: now + windowMs, count: 0 };

    if (bucket.resetAt <= now) {
        bucket.resetAt = now + windowMs;
        bucket.count = 0;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > limit) {
        const error = new Error("Too many requests. Please wait and try again.");
        error.statusCode = 429;
        throw error;
    }
}

function sendError(response, error, fallback = "Request failed.") {
    const status = error.statusCode || 500;
    if (status >= 500) {
        console.error(fallback, error);
    }
    return response.status(status).json({
        error: status >= 500 ? fallback : error.message
    });
}

module.exports = {
    assertSameOrigin,
    jsonBody,
    rateLimit,
    requestId,
    requireAdmin,
    sendError
};
