const { jsonBody, rateLimit, requestId, requireAdmin, sendError } = require("../_apiUtils");
const { logAction } = require("../_actionLog");
const { TEMPLATE_CONFIG } = require("../_whatsappTemplates");
const { fetchMembersByIds, memberName, sendBatch } = require("../_whatsappService");

module.exports = async function handler(request, response) {
    if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        return response.status(405).json({ error: "Method not allowed." });
    }

    try {
        rateLimit(request, { key: "send-targeted", limit: 10, windowMs: 60_000 });
        const user = await requireAdmin(request);

        const body = jsonBody(request);
        const memberIds = Array.isArray(body.memberIds) ? body.memberIds.filter(Boolean) : [];
        const templateKey = (body.templateKey || "").toString();
        const variables = body.variables && typeof body.variables === "object" ? body.variables : {};
        const template = TEMPLATE_CONFIG[templateKey];

        if (!template) {
            return response.status(400).json({ error: "Choose a valid WhatsApp template." });
        }
        if (!memberIds.length || memberIds.length > 200) {
            return response.status(400).json({ error: "Choose between 1 and 200 members." });
        }

        const missingVariables = template.variables.filter(variable => (
            variable !== "name" && !String(variables[variable] || "").trim()
        ));
        if (missingVariables.length) {
            return response.status(400).json({
                error: `Missing template variables: ${missingVariables.join(", ")}.`
            });
        }

        const members = await fetchMembersByIds(memberIds);
        const result = await sendBatch({
            members,
            templateKey,
            requestId: requestId(),
            variableBuilder: member => {
                const populated = {};
                for (const variable of template.variables) {
                    populated[variable] = variable === "name"
                        ? memberName(member)
                        : variables[variable];
                }
                return populated;
            }
        });

        await logAction({
            user,
            action: "whatsapp_targeted_sent",
            details: {
                templateKey,
                attempted: result.total,
                sent: result.sent,
                failed: result.failed,
                memberIds: members.map(member => member.id)
            }
        });

        return response.status(200).json(result);
    }
    catch (error) {
        return sendError(response, error, "Could not send targeted WhatsApp messages.");
    }
};
