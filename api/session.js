const { parseCookies, verifyFirebaseToken } = require("./_auth");

module.exports = async function handler(request, response) {
    const user = await verifyFirebaseToken(parseCookies(request).clubDeskSession);
    if (!user) {
        return response.status(401).json({ error: "Your session has expired." });
    }
    return response.status(200).json({
        valid: true,
        username: user.displayName || user.email?.split("@")[0] || "User"
    });
};
