const {
    firebasePasswordLogin,
    sessionCookie,
    verifyTurnstile
} = require("./_auth");

module.exports = async function handler(request, response) {
    if (request.method !== "POST") {
        return response.status(405).json({ error: "Method not allowed." });
    }

    try {
        const { email, password, turnstileToken } = request.body || {};
        if (!email || !password || !turnstileToken) {
            return response.status(400).json({ error: "Complete all login fields." });
        }

        const remoteIp = request.headers["x-forwarded-for"]?.split(",")[0]?.trim();
        if (!await verifyTurnstile(turnstileToken, remoteIp)) {
            return response.status(403).json({ error: "The human check was not accepted." });
        }

        const firebaseLogin = await firebasePasswordLogin(email, password);
        response.setHeader(
            "Set-Cookie",
            sessionCookie(firebaseLogin.idToken, Number(firebaseLogin.expiresIn) || 3600)
        );
        return response.status(200).json({
            username: firebaseLogin.displayName || email.split("@")[0]
        });
    }
    catch (error) {
        const expectedLoginError =
            error.message === "Incorrect username or password." ||
            error.message === "The human check was not accepted.";

        if (!expectedLoginError) {
            console.error("Login failed:", error);
        }

        return response.status(expectedLoginError ? 401 : 500).json({
            error: expectedLoginError
                ? error.message
                : "Login service is unavailable. Please try again."
        });
    }
};
