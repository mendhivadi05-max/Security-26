module.exports = function handler(request, response) {
    if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        return response.status(405).json({ error: "Method not allowed." });
    }

    response.setHeader("Cache-Control", "no-store");
    response.status(200).json({
        turnstileEnabled: true,
        turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || ""
    });
};
