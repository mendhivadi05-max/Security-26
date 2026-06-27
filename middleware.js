import { next } from "@vercel/functions";

const PUBLIC_HTML = new Set([
    "/index.html",
    "/Auth/Auth.html",
    "/Legal/Privacy.html",
    "/Legal/Terms.html",
    "/Legal/Cookies.html",
    "/Legal/AcceptableUse.html"
]);

const CLEAN_HTML_ROUTES = new Map([
    ["/Auth/Auth", "/Auth/Auth.html"],
    ["/Home/Home", "/Home/Home.html"],
    ["/Attendance/AddAttendance", "/Attendance/AddAttendance.html"],
    ["/MeetingRecords/MeetingRecords", "/MeetingRecords/MeetingRecords.html"],
    ["/Database/Database", "/Database/Database.html"],
    ["/Database/AddVolunteer", "/Database/AddVolunteer.html"],
    ["/Database/VolunteerRecords", "/Database/VolunteerRecords.html"],
    ["/Database/BrowseStatistics", "/Database/BrowseStatistics.html"],
    ["/Flags/Flags", "/Flags/Flags.html"],
    ["/Flags/WhatsappReminder", "/Flags/WhatsappReminder.html"],
    ["/Legal/Privacy", "/Legal/Privacy.html"],
    ["/Legal/Terms", "/Legal/Terms.html"],
    ["/Legal/Cookies", "/Legal/Cookies.html"],
    ["/Legal/AcceptableUse", "/Legal/AcceptableUse.html"],
    ["/Admin/ActivityLog", "/Admin/ActivityLog.html"]
]);

const HTML_TO_CLEAN_ROUTES = new Map(
    [...CLEAN_HTML_ROUTES.entries()].map(([cleanPath, htmlPath]) => [htmlPath, cleanPath])
);

function routePathname(pathname) {
    const withoutTrailingSlash = pathname.length > 1
        ? pathname.replace(/\/$/, "")
        : pathname;
    return CLEAN_HTML_ROUTES.get(withoutTrailingSlash) || withoutTrailingSlash;
}

function parseCookies(cookieHeader) {
    return Object.fromEntries(
        (cookieHeader || "")
            .split(";")
            .map(value => value.trim())
            .filter(Boolean)
            .map(value => {
                const separator = value.indexOf("=");
                return separator === -1
                    ? [value, ""]
                    : [value.slice(0, separator), decodeURIComponent(value.slice(separator + 1))];
            })
    );
}

export default async function middleware(request) {
    const url = new URL(request.url);
    const cleanRedirect = HTML_TO_CLEAN_ROUTES.get(url.pathname);
    if (cleanRedirect) {
        url.pathname = cleanRedirect;
        return Response.redirect(url, 301);
    }

    const pathname = url.pathname === "/" ? "/index.html" : routePathname(url.pathname);

    if (!pathname.endsWith(".html") || PUBLIC_HTML.has(pathname)) {
        return next();
    }

    const cookies = parseCookies(request.headers.get("cookie"));
    if (cookies.clubDeskSession) {
        return next();
    }

    const redirectUrl = new URL("/Auth/Auth", request.url);
    return Response.redirect(redirectUrl, 302);
}

export const config = {
    runtime: "edge",
    matcher: ["/((?!api/|_next/|.*\\.(?:css|js|png|jpg|jpeg|svg|ico|webp)$).*)"]
};
