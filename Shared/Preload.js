import { preloadCollections } from "./Api.js";

const ROUTES_TO_PREFETCH = [
    "../MeetingRecords/MeetingRecords",
    "../Attendance/AddAttendance",
    "../Database/VolunteerRecords",
    "../Database/BrowseStatistics",
    "../Database/AddVolunteer",
    "../Flags/WhatsappReminder",
    "../Flags/Flags"
];

const COLLECTIONS_TO_WARM = [
    [["sessions"]],
    [["birthdays"]],
    [["members"]],
    [["members", "sessions", "attendance", "flags"]],
    [["members", "sessions", "attendance"]],
    [["members", "sessions", "attendance", "flags", "memberNotes"]]
];

function idle(callback) {
    if ("requestIdleCallback" in window) {
        window.requestIdleCallback(callback, { timeout: 2500 });
        return;
    }
    window.setTimeout(callback, 900);
}

function pause(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}

function prefetchRoute(route) {
    if (document.querySelector(`link[rel="prefetch"][href="${route}"]`)) {
        return;
    }
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = route;
    link.as = "document";
    document.head.append(link);
}

function prefetchLocalHref(href) {
    if (!href || href.startsWith("#") || href.startsWith("http")) {
        return;
    }
    prefetchRoute(href);
}

document.addEventListener("mouseover", event => {
    const link = event.target.closest?.("a[href]");
    if (link) {
        prefetchLocalHref(link.getAttribute("href"));
    }
}, { passive: true });

document.addEventListener("touchstart", event => {
    const link = event.target.closest?.("a[href]");
    if (link) {
        prefetchLocalHref(link.getAttribute("href"));
    }
}, { passive: true });

async function warmCollections() {
    for (const [collections, options = {}] of COLLECTIONS_TO_WARM) {
        await preloadCollections(collections, options);
        await pause(180);
    }
}

function warmWhatsApp() {
    fetch("/api/whatsapp?action=safeguards", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
    }).catch(() => {});

    fetch("/api/whatsapp?action=diagnostics", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
    }).catch(() => {});
}

idle(() => {
    ROUTES_TO_PREFETCH.forEach(prefetchRoute);
    warmCollections();
    warmWhatsApp();
});
