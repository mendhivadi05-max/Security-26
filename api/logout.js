const { sessionCookie } = require("./_auth");

module.exports = function handler(request, response) {
    response.setHeader("Set-Cookie", sessionCookie("", 0));
    response.status(200).json({ success: true });
};
