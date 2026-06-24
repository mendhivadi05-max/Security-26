module.exports = function handler(request, response) {
    if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        return response.status(405).json({ error: "Method not allowed." });
    }

    const turnstileEnabled =
        Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);

    response.setHeader("Cache-Control", "no-store");
    response.status(200).json({
        turnstileEnabled,
        turnstileSiteKey: turnstileEnabled ? process.env.TURNSTILE_SITE_KEY : ""
    });
};
