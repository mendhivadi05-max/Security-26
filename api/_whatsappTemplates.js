const TEMPLATE_CONFIG = {
    meetingReminder: {
        envName: "WHATSAPP_TEMPLATE_MEETING_REMINDER",
        defaultName: "security_reminder",
        variables: ["name", "meeting_time"]
    },
    absentNotice: {
        envName: "WHATSAPP_TEMPLATE_ABSENT_NOTICE",
        defaultName: "attendance_absent_notice",
        variables: ["name", "meeting_name", "date", "time"]
    },
    absenceReview: {
        envName: "WHATSAPP_TEMPLATE_ABSENCE_REVIEW",
        defaultName: "attendance_flag_review",
        variables: ["name", "meeting_name"]
    }
};

function templateName(templateKey) {
    const config = TEMPLATE_CONFIG[templateKey];
    if (!config) {
        return "";
    }
    return process.env[config.envName] || config.defaultName;
}

function templateLanguage() {
    return process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en";
}

function templateParameterFormat() {
    const format = (process.env.WHATSAPP_TEMPLATE_PARAMETER_FORMAT || "named")
        .trim()
        .toLowerCase();

    return format === "positional" ? "positional" : "named";
}

function publicTemplates() {
    return Object.fromEntries(
        Object.entries(TEMPLATE_CONFIG).map(([key, config]) => [
            key,
            {
                name: templateName(key),
                variables: config.variables,
                parameterFormat: templateParameterFormat()
            }
        ])
    );
}

function templateVariables(templateKey) {
    return TEMPLATE_CONFIG[templateKey]?.variables || [];
}

module.exports = {
    TEMPLATE_CONFIG,
    publicTemplates,
    templateLanguage,
    templateName,
    templateParameterFormat,
    templateVariables
};
