module.exports = function handler(request, response) {
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json({
        turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || ""
    });
};
