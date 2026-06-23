const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

function loadLocalEnvironment(filePath) {
    if (!fs.existsSync(filePath)) {
        return;
    }

    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }

        const separator = trimmed.indexOf("=");
        if (separator === -1) {
            continue;
        }

        const name = trimmed.slice(0, separator).trim();
        const value = trimmed.slice(separator + 1).trim();
        if (name && process.env[name] === undefined) {
            process.env[name] = value;
        }
    }
}

loadLocalEnvironment(path.join(__dirname, ".env.local"));

const {
    firebasePasswordLogin,
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

function sendJson(response, status, body) {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    response.end(JSON.stringify(body));
}

function readJson(request) {
    return new Promise((resolve, reject) => {
        let body = "";
        request.on("data", chunk => {
            body += chunk;
            if (body.length > 10_000) {
                request.destroy();
                reject(new Error("Request too large"));
            }
        });
        request.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            }
            catch (error) {
                reject(error);
            }
        });
        request.on("error", reject);
    });
}

async function handleApi(request, response, pathname) {
    if (pathname === "/api/auth-config" && request.method === "GET") {
        sendJson(response, 200, {
            turnstileEnabled: isProduction,
            turnstileSiteKey: isProduction
                ? process.env.TURNSTILE_SITE_KEY || ""
                : ""
        });
        return;
    }

    if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed" });
        return;
    }

    const body = await readJson(request);

    if (pathname === "/api/login") {
        const { email, password, turnstileToken } = body;
        if (!email || !password || (isProduction && !turnstileToken)) {
            sendJson(response, 400, { error: "Complete all required login fields." });
            return;
        }

        if (isProduction) {
            const turnstileAccepted = await verifyTurnstile(
                turnstileToken,
                request.socket.remoteAddress
            );
            if (!turnstileAccepted) {
                sendJson(response, 403, { error: "The human check was not accepted." });
                return;
            }
        }

        const firebaseLogin = await firebasePasswordLogin(email, password);
        response.setHeader(
            "Set-Cookie",
            sessionCookie(
                firebaseLogin.idToken,
                Number(firebaseLogin.expiresIn) || 3600
            )
        );
        sendJson(response, 200, {
            username: firebaseLogin.displayName || email.split("@")[0]
        });
        return;
    }

    if (pathname === "/api/session") {
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

    if (pathname === "/api/logout") {
        response.setHeader("Set-Cookie", sessionCookie("", 0));
        sendJson(response, 200, { success: true });
        return;
    }

    sendJson(response, 404, { error: "Not found" });
}

http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    const route = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;

    if (route.startsWith("/api/")) {
        try {
            await handleApi(request, response, route);
        }
        catch (error) {
            console.error("API request failed:", error);
            sendJson(response, 500, {
                error: error.message || "Server error"
            });
        }
        return;
    }

    const publicPages = new Set(["/index.html", "/Auth/Auth.html"]);
    if (
        path.extname(route).toLowerCase() === ".html" &&
        !publicPages.has(route) &&
        !await verifyFirebaseToken(parseCookies(request).clubDeskSession)
    ) {
        response.writeHead(302, {
            "Location": "/Auth/Auth.html",
            "Cache-Control": "no-store"
        });
        response.end();
        return;
    }

    const filePath = path.normalize(path.join(root, decodeURIComponent(route)));

    if (!filePath.startsWith(root)) {
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
            "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"
        });
        response.end(data);
    });
}).listen(port, () => {
    console.log(`Club Desk is running at http://localhost:${port}`);
});
