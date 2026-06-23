const { parseCookies, verifyFirebaseToken } = require("./_auth");

module.exports = async function handler(request, response) {
    if (!["GET", "POST"].includes(request.method)) {
        response.setHeader("Allow", "GET, POST");
        return response.status(405).json({ error: "Method not allowed." });
    }

    try {
        const user = await verifyFirebaseToken(parseCookies(request).clubDeskSession);
        if (!user) {
            return response.status(401).json({ error: "Your session has expired." });
        }
        return response.status(200).json({
            valid: true,
            username: user.displayName || user.email?.split("@")[0] || "User"
        });
    }
    catch (error) {
        console.error("Session validation failed:", error);
        return response.status(500).json({ error: "Session service is unavailable." });
    }
};
