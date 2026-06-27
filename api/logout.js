const { sessionCookie } = require("./_auth");
const { assertSameOrigin } = require("./_apiUtils");

module.exports = function handler(request, response) {
    if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        return response.status(405).json({ error: "Method not allowed." });
    }

    assertSameOrigin(request);
    response.setHeader("Set-Cookie", sessionCookie("", 0));
    response.status(200).json({ success: true });
};
