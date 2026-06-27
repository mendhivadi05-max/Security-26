import { loadCollections } from "../Shared/Api.js";

const elements = {
    search: document.getElementById("activitySearch"),
    action: document.getElementById("actionFilter"),
    admin: document.getElementById("adminFilter"),
    summary: document.getElementById("activitySummary"),
    list: document.getElementById("activityList")
};

let logs = [];

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function titleCaseAction(action) {
    return String(action || "unknown_action")
        .replaceAll("_", " ")
        .replace(/\b\w/g, letter => letter.toUpperCase());
}

function createdAtMs(log) {
    return Number(log.createdAtMs || log.createdAt?._seconds * 1000 || 0);
}

function adminName(log) {
    return log.actor?.displayName || log.actor?.email || log.actor?.username || "Unknown admin";
}

function adminKey(log) {
    return log.actor?.email || adminName(log);
}

function formatDate(ms) {
    if (!ms) {
        return "No timestamp";
    }
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(new Date(ms));
}

function detailEntries(details = {}) {
    return Object.entries(details)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .slice(0, 8);
}

function searchableText(log) {
    return [
        log.action,
        adminName(log),
        adminKey(log),
        JSON.stringify(log.details || {})
    ].join(" ").toLowerCase();
}

function filteredLogs() {
    const query = elements.search.value.trim().toLowerCase();
    const action = elements.action.value;
    const admin = elements.admin.value;

    return logs.filter(log => (
        (!query || searchableText(log).includes(query)) &&
        (action === "all" || log.action === action) &&
        (admin === "all" || adminKey(log) === admin)
    ));
}

function renderOptions() {
    const actions = [...new Set(logs.map(log => log.action).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
    const admins = [...new Map(logs.map(log => [adminKey(log), adminName(log)])).entries()]
        .sort((a, b) => a[1].localeCompare(b[1]));

    elements.action.innerHTML = [
        '<option value="all">All actions</option>',
        ...actions.map(action => `<option value="${escapeHtml(action)}">${escapeHtml(titleCaseAction(action))}</option>`)
    ].join("");

    elements.admin.innerHTML = [
        '<option value="all">All admins</option>',
        ...admins.map(([key, name]) => `<option value="${escapeHtml(key)}">${escapeHtml(name)}</option>`)
    ].join("");
}

function renderSummary(rows) {
    const uniqueAdmins = new Set(rows.map(adminKey)).size;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = rows.filter(log => createdAtMs(log) >= todayStart.getTime()).length;
    const writeCount = rows.filter(log => !String(log.action || "").includes("view")).length;

    elements.summary.innerHTML = `
        <article class="summary-tile"><span>Shown</span><strong>${rows.length}</strong></article>
        <article class="summary-tile"><span>Admins</span><strong>${uniqueAdmins}</strong></article>
        <article class="summary-tile"><span>Today</span><strong>${todayCount}</strong></article>
        <article class="summary-tile"><span>Changes</span><strong>${writeCount}</strong></article>
    `;
}

function renderList() {
    const rows = filteredLogs();
    renderSummary(rows);

    if (!rows.length) {
        elements.list.innerHTML = `
            <div class="empty-state-panel">
                <strong>No matching activity found.</strong>
                <span>Try a different filter or search term.</span>
            </div>
        `;
        return;
    }

    elements.list.innerHTML = rows.map(log => {
        const details = detailEntries(log.details);
        return `
            <article class="activity-item">
                <div>
                    <div class="activity-title">
                        <span class="action-badge">${escapeHtml(titleCaseAction(log.action))}</span>
                        <strong>${escapeHtml(adminName(log))}</strong>
                    </div>
                    <p class="activity-meta">${escapeHtml(log.actor?.email || "No email recorded")} - ${escapeHtml(log.source || "server")}</p>
                    <div class="activity-details">
                        ${details.map(([key, value]) => `
                            <span class="detail-chip">${escapeHtml(key)}: ${escapeHtml(Array.isArray(value) ? value.join(", ") : value)}</span>
                        `).join("")}
                    </div>
                </div>
                <time class="activity-time" datetime="${createdAtMs(log) ? new Date(createdAtMs(log)).toISOString() : ""}">
                    ${escapeHtml(formatDate(createdAtMs(log)))}
                </time>
            </article>
        `;
    }).join("");
}

async function loadActivity() {
    const data = await loadCollections(["actionLogs"], { limit: 250 });
    logs = (data.actionLogs || [])
        .sort((a, b) => createdAtMs(b) - createdAtMs(a));

    renderOptions();
    renderList();
}

[elements.search, elements.action, elements.admin].forEach(control => {
    control.addEventListener(control.tagName === "INPUT" ? "input" : "change", renderList);
});

loadActivity().catch(error => {
    console.error("Activity log load error:", error);
    elements.list.innerHTML = `
        <div class="empty-state-panel">
            <strong>Could not load activity.</strong>
            <span>${escapeHtml(error.message || "Please refresh and try again.")}</span>
        </div>
    `;
});
