const COLLECTION_CACHE_PREFIX = "clubDeskCollectionCache:";
const COLLECTION_CACHE_TTL_MS = 2 * 60_000;

function cacheKey(path) {
    return `${COLLECTION_CACHE_PREFIX}${path}`;
}

function readCached(path) {
    try {
        const cached = JSON.parse(sessionStorage.getItem(cacheKey(path)) || "null");
        if (!cached || cached.expiresAt <= Date.now()) {
            sessionStorage.removeItem(cacheKey(path));
            return null;
        }
        return cached.value;
    }
    catch {
        return null;
    }
}

function writeCached(path, value) {
    try {
        sessionStorage.setItem(cacheKey(path), JSON.stringify({
            value,
            expiresAt: Date.now() + COLLECTION_CACHE_TTL_MS
        }));
    }
    catch {
        // Cache storage is a performance hint only.
    }
}

function clearCollectionCache() {
    try {
        Object.keys(sessionStorage)
            .filter(key => key.startsWith(COLLECTION_CACHE_PREFIX))
            .forEach(key => sessionStorage.removeItem(key));
    }
    catch {
        // Ignore unavailable storage.
    }
}

export async function apiGet(path) {
    const response = await fetch(path, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin"
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(result.error || "Request failed.");
    }
    return result;
}

export async function apiPost(path, data = {}) {
    const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "same-origin"
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(result.error || "Request failed.");
    }
    clearCollectionCache();
    return result;
}

export async function loadCollections(collections, options = {}) {
    const params = new URLSearchParams();
    params.set("collections", collections.join(","));

    Object.entries(options).forEach(([key, value]) => {
        if (key !== "force" && value !== undefined && value !== null && value !== "") {
            params.set(key, value);
        }
    });

    const path = `/api/data?${params.toString()}`;
    if (!options.force) {
        const cached = readCached(path);
        if (cached) {
            return cached;
        }
    }

    const result = await apiGet(path);
    writeCached(path, result.collections || {});
    return result.collections || {};
}

export function preloadCollections(collections, options = {}) {
    return loadCollections(collections, options).catch(() => null);
}
