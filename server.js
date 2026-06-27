const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

function loadLocalEnvironment(filePath) {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        let line = lines[index];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }

        const separator = trimmed.indexOf("=");
        if (separator === -1) {
            continue;
        }

        const name = trimmed.slice(0, separator).trim();
        let value = trimmed.slice(separator + 1).trim();
        const quote = value[0];
        if ((quote === '"' || quote === "'") && !value.endsWith(quote)) {
            while (index + 1 < lines.length && !value.endsWith(quote)) {
                index += 1;
                value += `\n${lines[index]}`;
            }
        }
        if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
            value = value.slice(1, -1);
        }
        value = value.replace(/\\n/g, "\n");
        if (name && process.env[name] === undefined) {
            process.env[name] = value;
        }
    }
}

loadLocalEnvironment(path.join(__dirname, ".env.local"));

const {
    firebasePasswordLogin,
    isTurnstileConfigured,
    normalizeLoginEmail,
    parseCookies,
    sessionCookie,
    verifyFirebaseToken,
    verifyTurnstile
} = require("./api/_auth");

const root = __dirname;
const port = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === "production";

const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml"
};

const blockedStaticNames = new Set([
    ".env",
    ".env.local",
    ".env.production",
    "package-lock.json",
    "firebase-debug.log"
]);

const cleanHtmlRoutes = new Map([
    ["/Auth/Auth", "/Auth/Auth.html"],
    ["/Home/Home", "/Home/Home.html"],
    ["/Attendance/AddAttendance", "/Attendance/AddAttendance.html"],
    ["/MeetingRecords/MeetingRecords", "/MeetingRecords/MeetingRecords.html"],
    ["/Database/Database", "/Database/Database.html"],
    ["/Database/AddVolunteer", "/Database/AddVolunteer.html"],
    ["/Database/VolunteerRecords", "/Database/VolunteerRecords.html"],
    ["/Database/BrowseStatistics", "/Database/BrowseStatistics.html"],
    ["/Flags/Flags", "/Flags/Flags.html"],
    ["/Flags/WhatsappReminder", "/Flags/WhatsappReminder.html"],
    ["/Legal/Privacy", "/Legal/Privacy.html"],
    ["/Legal/Terms", "/Legal/Terms.html"],
    ["/Legal/Cookies", "/Legal/Cookies.html"],
    ["/Legal/AcceptableUse", "/Legal/AcceptableUse.html"],
    ["/Admin/ActivityLog", "/Admin/ActivityLog.html"]
]);

const htmlToCleanRoutes = new Map(
    [...cleanHtmlRoutes.entries()].map(([cleanPath, htmlPath]) => [htmlPath, cleanPath])
);

function cleanRoutePath(pathname) {
    return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}

function htmlRouteFor(pathname) {
    const cleanPath = cleanRoutePath(pathname);
    return cleanHtmlRoutes.get(cleanPath) || cleanPath;
}

function isBlockedStaticFile(filePath) {
    const relative = path.relative(root, filePath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
        return true;
    }

    return relative
        .split(path.sep)
        .some(part => part.startsWith(".") || blockedStaticNames.has(part));
}

function sendJson(response, status, body) {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    response.end(JSON.stringify(body));
}

const securityHeaders = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://challenges.cloudflare.com",
        "script-src-elem 'self' 'unsafe-inline' https://www.gstatic.com https://challenges.cloudflare.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data:",
        "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.googleapis.com wss://*.firebaseio.com https://challenges.cloudflare.com",
        "frame-src https://challenges.cloudflare.com",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'"
    ].join("; ")
};

function readJson(request) {
    return new Promise((resolve, reject) => {
        let body = "";
        request.on("data", chunk => {
            body += chunk;
            if (body.length > 1_000_000) {
                request.destroy();
                reject(new Error("Request too large"));
            }
        });
        request.on("end", () => {
            try {
                request.rawBody = body;
                resolve(body ? JSON.parse(body) : {});
            }
            catch (error) {
                reject(error);
            }
        });
        request.on("error", reject);
    });
}

function createApiResponse(response) {
    return {
        setHeader: (name, value) => response.setHeader(name, value),
        status(statusCode) {
            response.statusCode = statusCode;
            return this;
        },
        json(body) {
            if (!response.headersSent) {
                response.setHeader("Content-Type", "application/json; charset=utf-8");
                response.setHeader("Cache-Control", "no-store");
            }
            response.end(JSON.stringify(body));
        },
        send(body) {
            if (!response.headersSent) {
                response.setHeader("Content-Type", "text/plain; charset=utf-8");
                response.setHeader("Cache-Control", "no-store");
            }
            response.end(String(body ?? ""));
        }
    };
}

function apiModulePath(pathname) {
    if (["/api/auth-config", "/api/login", "/api/session", "/api/logout"].includes(pathname)) {
        return "";
    }

    const parts = pathname
        .replace(/^\/api\//, "")
        .split("/")
        .filter(Boolean);

    if (!parts.length || parts.some(part => part.includes(".."))) {
        return "";
    }

    return path.join(root, "api", ...parts) + ".js";
}

async function dispatchApiModule(request, response, requestUrl, pathname) {
    const modulePath = apiModulePath(pathname);
    if (!modulePath || !fs.existsSync(modulePath)) {
        return false;
    }

    request.query = Object.fromEntries(requestUrl.searchParams.entries());
    if (request.method !== "GET") {
        request.body = await readJson(request);
    }

    const handler = require(modulePath);
    await handler(request, createApiResponse(response));
    return true;
}

async function handleApi(request, response, pathname) {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    if (await dispatchApiModule(request, response, requestUrl, pathname)) {
        return;
    }

    if (pathname === "/api/auth-config" && request.method === "GET") {
        const turnstileEnabled =
            isProduction && isTurnstileConfigured();

        sendJson(response, 200, {
            turnstileEnabled,
            turnstileSiteKey: turnstileEnabled ? process.env.TURNSTILE_SITE_KEY : ""
        });
        return;
    }

    if (pathname === "/api/session" && ["GET", "POST"].includes(request.method)) {
        const user = await verifyFirebaseToken(
            parseCookies(request).clubDeskSession
        );
        if (!user) {
            sendJson(response, 401, { error: "Your session has expired." });
            return;
        }

        sendJson(response, 200, {
            valid: true,
            username: user.displayName || user.email?.split("@")[0] || "User"
        });
        return;
    }

    if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed" });
        return;
    }

    const body = await readJson(request);

    if (pathname === "/api/login") {
        const { email, identifier, password, turnstileToken } = body;
        const loginEmail = normalizeLoginEmail(identifier || email);
        const turnstileEnabled =
            isProduction && isTurnstileConfigured();

        if (!loginEmail || !password || (turnstileEnabled && !turnstileToken)) {
            sendJson(response, 400, { error: "Complete all required login fields." });
            return;
        }

        if (turnstileEnabled) {
            const turnstileAccepted = await verifyTurnstile(
                turnstileToken,
                request.socket.remoteAddress
            );
            if (!turnstileAccepted) {
                sendJson(response, 403, { error: "The human check was not accepted." });
                return;
            }
        }

        const firebaseLogin = await firebasePasswordLogin(loginEmail, password);
        response.setHeader(
            "Set-Cookie",
            sessionCookie(
                firebaseLogin.idToken,
                Number(firebaseLogin.expiresIn) || 3600
            )
        );
        sendJson(response, 200, {
            username: firebaseLogin.displayName || loginEmail.split("@")[0]
        });
        return;
    }

    if (pathname === "/api/logout") {
        response.setHeader("Set-Cookie", sessionCookie("", 0));
        sendJson(response, 200, { success: true });
        return;
    }

    sendJson(response, 404, { error: "Not found" });
}

http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    const cleanRedirect = htmlToCleanRoutes.get(requestUrl.pathname);
    if (cleanRedirect) {
        requestUrl.pathname = cleanRedirect;
        response.writeHead(301, {
            "Location": `${requestUrl.pathname}${requestUrl.search}`,
            "Cache-Control": "no-store"
        });
        response.end();
        return;
    }

    const route = requestUrl.pathname === "/" ? "/index.html" : htmlRouteFor(requestUrl.pathname);

    if (route.startsWith("/api/")) {
        try {
            await handleApi(request, response, route);
        }
        catch (error) {
            console.error("API request failed:", error);
            sendJson(response, error.statusCode || 500, {
                error: error.statusCode ? error.message : "Server error"
            });
        }
        return;
    }

    const publicPages = new Set([
        "/index.html",
        "/Auth/Auth.html",
        "/Legal/Privacy.html",
        "/Legal/Terms.html",
        "/Legal/Cookies.html",
        "/Legal/AcceptableUse.html"
    ]);
    if (
        path.extname(route).toLowerCase() === ".html" &&
        !publicPages.has(route) &&
        !await verifyFirebaseToken(parseCookies(request).clubDeskSession)
    ) {
        response.writeHead(302, {
            "Location": "/Auth/Auth",
            "Cache-Control": "no-store"
        });
        response.end();
        return;
    }

    let filePath;
    try {
        filePath = path.resolve(root, `.${decodeURIComponent(route)}`);
    }
    catch {
        response.writeHead(400);
        response.end("Bad request");
        return;
    }

    if (isBlockedStaticFile(filePath)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
    }

    fs.readFile(filePath, (error, data) => {
        if (error) {
            response.writeHead(404);
            response.end("Not found");
            return;
        }

        response.writeHead(200, {
            ...securityHeaders,
            "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"
        });
        response.end(data);
    });
}).listen(port, () => {
    console.log(`ClubDesk is running at http://localhost:${port}`);
});
