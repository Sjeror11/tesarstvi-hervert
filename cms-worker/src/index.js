const SESSION_COOKIE_NAME = "th_admin_session";

export default {
    async fetch(request, env) {
        try {
            const url = new URL(request.url);

            if (request.method === "OPTIONS") {
                return new Response(null, { status: 204, headers: buildCorsHeaders(request, env) });
            }

            if (url.pathname === "/health") {
                return jsonResponse(request, env, 200, { ok: true });
            }

            if (url.pathname === "/media" || url.pathname.startsWith("/media/")) {
                return handleMedia(request, env, url);
            }

            if (url.pathname === "/api/public/galleries") {
                return handlePublicGalleries(request, env);
            }

            if (url.pathname === "/api/login" && request.method === "POST") {
                return handleLogin(request, env);
            }

            if (url.pathname === "/api/logout" && request.method === "POST") {
                return handleLogout(request, env);
            }

            if (url.pathname === "/api/me" && request.method === "GET") {
                return handleMe(request, env);
            }

            if (url.pathname === "/api/admin/photos" && request.method === "GET") {
                return requireAuth(request, env, function () {
                    return handleAdminPhotos(request, env);
                });
            }

            if (url.pathname === "/api/admin/change-password" && request.method === "POST") {
                return requireAuth(request, env, function (session) {
                    return handleChangePassword(request, env, session);
                });
            }

            if (url.pathname === "/api/admin/photos/upload" && request.method === "POST") {
                return requireAuth(request, env, function () {
                    return handleUpload(request, env);
                });
            }

            if (url.pathname.startsWith("/api/admin/photos/") && request.method === "DELETE") {
                return requireAuth(request, env, function (session) {
                    return handleDeletePhoto(request, env, url, session);
                });
            }

            return jsonResponse(request, env, 404, { error: "Not found" });
        } catch (error) {
            console.error(error);
            return jsonResponse(request, env, 500, {
                error: error instanceof Error ? error.message : "Unexpected error"
            });
        }
    }
};

async function handleMedia(request, env, url) {
    const objectKey = decodeMediaKey(url.pathname);

    if (!objectKey) {
        return jsonResponse(request, env, 404, { error: "Soubor nebyl nalezen." });
    }

    const object = await env.MEDIA.get(objectKey);

    if (!object) {
        return jsonResponse(request, env, 404, { error: "Soubor nebyl nalezen." });
    }

    const headers = buildCorsHeaders(request, env);
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=3600");
    return new Response(object.body, { status: 200, headers });
}

async function handlePublicGalleries(request, env) {
    const rows = await env.DB.prepare(
        "SELECT id, service_slug, filename, alt_text, object_key, created_at FROM gallery_photos ORDER BY service_slug ASC, created_at DESC"
    ).all();

    return jsonResponse(request, env, 200, {
        photosByService: mapRowsByService(env, rows.results || [])
    });
}

async function handleLogin(request, env) {
    ensureRequiredEnv(env, ["ADMIN_USERNAME", "ADMIN_PASSWORD_HASH", "SESSION_SECRET"]);

    const payload = await request.json();
    const username = String(payload.username || "").trim();
    const password = String(payload.password || "");

    if (!username || !password) {
        return jsonResponse(request, env, 400, { error: "Vyplň jméno i heslo." });
    }

    const credential = await getAdminCredential(env);

    if (!credential || username !== credential.username) {
        return jsonResponse(request, env, 401, { error: "Neplatné přihlašovací údaje." });
    }

    const validPassword = await verifyPassword(password, credential.passwordHash);

    if (!validPassword) {
        return jsonResponse(request, env, 401, { error: "Neplatné přihlašovací údaje." });
    }

    const ttlSeconds = Number(env.SESSION_TTL_SECONDS || "604800");
    const token = await createSessionToken({ username }, env.SESSION_SECRET, ttlSeconds);
    const headers = buildJsonHeaders(request, env);
    headers.append("Set-Cookie", serializeCookie(SESSION_COOKIE_NAME, token, ttlSeconds));

    return new Response(JSON.stringify({ ok: true, token, user: { username } }), {
        status: 200,
        headers
    });
}

async function handleLogout(request, env) {
    const headers = buildJsonHeaders(request, env);
    headers.append("Set-Cookie", clearCookie(SESSION_COOKIE_NAME));

    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers
    });
}

async function handleMe(request, env) {
    const session = await getSessionFromRequest(request, env);

    if (!session) {
        return jsonResponse(request, env, 401, { error: "Nepřihlášený uživatel." });
    }

    return jsonResponse(request, env, 200, {
        user: {
            username: session.username
        }
    });
}

async function handleAdminPhotos(request, env) {
    const rows = await env.DB.prepare(
        "SELECT id, service_slug, filename, alt_text, object_key, created_at FROM gallery_photos ORDER BY service_slug ASC, created_at DESC"
    ).all();

    return jsonResponse(request, env, 200, {
        photosByService: mapRowsByService(env, rows.results || [])
    });
}

async function handleChangePassword(request, env, session) {
    const payload = await request.json();
    const currentPassword = String(payload.currentPassword || "");
    const newPassword = String(payload.newPassword || "");

    if (!currentPassword || !newPassword) {
        return jsonResponse(request, env, 400, { error: "Vyplň současné i nové heslo." });
    }

    if (newPassword.length < 8) {
        return jsonResponse(request, env, 400, { error: "Nové heslo musí mít alespoň 8 znaků." });
    }

    const credential = await getAdminCredential(env);

    if (!credential || credential.username !== session.username) {
        return jsonResponse(request, env, 401, { error: "Neplatný uživatel." });
    }

    const validPassword = await verifyPassword(currentPassword, credential.passwordHash);

    if (!validPassword) {
        return jsonResponse(request, env, 401, { error: "Současné heslo nesouhlasí." });
    }

    const newHash = await hashPassword(newPassword);

    await env.DB.prepare(
        "INSERT INTO admin_credentials (username, password_hash, updated_at) VALUES (?, ?, ?) ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at"
    )
        .bind(session.username, newHash, Date.now())
        .run();

    return jsonResponse(request, env, 200, { ok: true });
}

async function handleUpload(request, env) {
    ensureRequiredEnv(env, ["PUBLIC_BASE_URL"]);

    const formData = await request.formData();
    const service = sanitizeSlug(String(formData.get("service") || ""));
    const alt = String(formData.get("alt") || "").trim();
    const file = formData.get("file");
    const maxBytes = Number(env.MAX_UPLOAD_SIZE_BYTES || "10485760");

    if (!service) {
        return jsonResponse(request, env, 400, { error: "Chybí sekce webu." });
    }

    if (!(file instanceof File)) {
        return jsonResponse(request, env, 400, { error: "Nebyl vybrán soubor." });
    }

    if (!file.type.startsWith("image/")) {
        return jsonResponse(request, env, 400, { error: "Nahrát lze pouze obrázek." });
    }

    if (file.size > maxBytes) {
        return jsonResponse(request, env, 400, { error: "Soubor je příliš velký." });
    }

    const extension = guessExtension(file);
    const objectKey = buildObjectKey(service, extension);
    const filename = sanitizeFilename(file.name || objectKey);

    await env.MEDIA.put(objectKey, await file.arrayBuffer(), {
        httpMetadata: {
            contentType: file.type
        }
    });

    const id = crypto.randomUUID();
    const createdAt = Date.now();

    try {
        await env.DB.prepare(
            "INSERT INTO gallery_photos (id, service_slug, object_key, filename, alt_text, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
            .bind(id, service, objectKey, filename, alt, createdAt)
            .run();
    } catch (error) {
        await env.MEDIA.delete(objectKey);
        throw error;
    }

    return jsonResponse(request, env, 201, {
        photo: {
            id,
            service,
            alt,
            filename,
            url: buildMediaUrl(env, objectKey)
        }
    });
}

async function handleDeletePhoto(request, env, url) {
    const id = decodeURIComponent(url.pathname.split("/").pop() || "");

    if (!id) {
        return jsonResponse(request, env, 400, { error: "Chybí ID fotky." });
    }

    const row = await env.DB.prepare(
        "SELECT id, object_key FROM gallery_photos WHERE id = ? LIMIT 1"
    )
        .bind(id)
        .first();

    if (!row) {
        return jsonResponse(request, env, 404, { error: "Fotka nebyla nalezena." });
    }

    await env.MEDIA.delete(row.object_key);
    await env.DB.prepare("DELETE FROM gallery_photos WHERE id = ?").bind(id).run();

    return jsonResponse(request, env, 200, { ok: true });
}

async function requireAuth(request, env, handler) {
    const session = await getSessionFromRequest(request, env);

    if (!session) {
        return jsonResponse(request, env, 401, { error: "Pro tuto akci je potřeba přihlášení." });
    }

    return handler(session);
}

async function getAdminCredential(env) {
    const row = await env.DB.prepare(
        "SELECT username, password_hash FROM admin_credentials WHERE username = ? LIMIT 1"
    )
        .bind(env.ADMIN_USERNAME)
        .first();

    if (row && row.username && row.password_hash) {
        return {
            username: row.username,
            passwordHash: row.password_hash
        };
    }

    return {
        username: env.ADMIN_USERNAME,
        passwordHash: env.ADMIN_PASSWORD_HASH
    };
}

function mapRowsByService(env, rows) {
    return rows.reduce(function (accumulator, row) {
        if (!accumulator[row.service_slug]) {
            accumulator[row.service_slug] = [];
        }

        accumulator[row.service_slug].push({
            id: row.id,
            filename: row.filename,
            alt: row.alt_text,
            createdAt: row.created_at,
            url: buildMediaUrl(env, row.object_key)
        });

        return accumulator;
    }, {});
}

function buildMediaUrl(env, objectKey) {
    return env.PUBLIC_BASE_URL.replace(/\/$/, "") + "/media/" + objectKey.split("/").map(encodeURIComponent).join("/");
}

function decodeMediaKey(pathname) {
    const prefix = "/media/";

    if (!pathname.startsWith(prefix)) {
        return "";
    }

    return pathname
        .slice(prefix.length)
        .split("/")
        .filter(Boolean)
        .map(function (segment) {
            return decodeURIComponent(segment);
        })
        .join("/");
}

function buildObjectKey(service, extension) {
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    return service + "/" + year + "/" + month + "/" + crypto.randomUUID() + "." + extension;
}

function guessExtension(file) {
    const mime = file.type.toLowerCase();

    if (mime === "image/png") {
        return "png";
    }

    if (mime === "image/webp") {
        return "webp";
    }

    if (mime === "image/gif") {
        return "gif";
    }

    return "jpg";
}

function sanitizeSlug(value) {
    return value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function sanitizeFilename(value) {
    return value.replace(/[^\w.-]+/g, "-").slice(0, 160);
}

async function createSessionToken(payload, secret, ttlSeconds) {
    const session = {
        username: payload.username,
        exp: Math.floor(Date.now() / 1000) + ttlSeconds
    };
    const encodedPayload = toBase64Url(JSON.stringify(session));
    const signature = await signValue(encodedPayload, secret);
    return encodedPayload + "." + signature;
}

async function getSessionFromRequest(request, env) {
    ensureRequiredEnv(env, ["SESSION_SECRET"]);
    const headerToken = getBearerToken(request.headers.get("Authorization") || "");
    const cookies = parseCookies(request.headers.get("Cookie") || "");
    const token = headerToken || cookies[SESSION_COOKIE_NAME];

    if (!token) {
        return null;
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
        return null;
    }

    const encodedPayload = parts[0];
    const signature = parts[1];
    const expectedSignature = await signValue(encodedPayload, env.SESSION_SECRET);

    if (!timingSafeEqual(signature, expectedSignature)) {
        return null;
    }

    const payload = JSON.parse(fromBase64Url(encodedPayload));

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
        return null;
    }

    return payload;
}

function getBearerToken(value) {
    if (!value || !value.startsWith("Bearer ")) {
        return "";
    }

    return value.slice("Bearer ".length).trim();
}

async function signValue(value, secret) {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
    return toBase64UrlBuffer(signature);
}

async function verifyPassword(password, encodedHash) {
    const parts = String(encodedHash || "").split("$");

    if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") {
        return false;
    }

    const iterations = Number(parts[1]);
    const salt = parts[2];
    const expectedHash = parts[3];

    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: new TextEncoder().encode(salt),
            iterations,
            hash: "SHA-256"
        },
        keyMaterial,
        256
    );

    const actualHash = arrayBufferToBase64(derivedBits);
    return timingSafeEqual(actualHash, expectedHash);
}

async function hashPassword(password) {
    const iterations = 100000;
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    const salt = Array.from(saltBytes)
        .map(function (byte) {
            return byte.toString(16).padStart(2, "0");
        })
        .join("");

    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: new TextEncoder().encode(salt),
            iterations,
            hash: "SHA-256"
        },
        keyMaterial,
        256
    );

    return "pbkdf2_sha256$" + iterations + "$" + salt + "$" + arrayBufferToBase64(derivedBits);
}

function parseCookies(cookieHeader) {
    return cookieHeader
        .split(";")
        .map(function (part) {
            return part.trim();
        })
        .filter(Boolean)
        .reduce(function (accumulator, part) {
            const separatorIndex = part.indexOf("=");

            if (separatorIndex === -1) {
                return accumulator;
            }

            accumulator[part.slice(0, separatorIndex)] = part.slice(separatorIndex + 1);
            return accumulator;
        }, {});
}

function serializeCookie(name, value, maxAge) {
    return [
        name + "=" + value,
        "Max-Age=" + maxAge,
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=Lax"
    ].join("; ");
}

function clearCookie(name) {
    return [
        name + "=",
        "Max-Age=0",
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=Lax"
    ].join("; ");
}

function buildCorsHeaders(request, env) {
    const origin = request.headers.get("Origin");
    const allowedOrigins = [env.SITE_URL].filter(Boolean);
    const headers = new Headers();

    if (origin && allowedOrigins.includes(origin)) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Access-Control-Allow-Credentials", "true");
    }

    headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    headers.set("Vary", "Origin");
    return headers;
}

function buildJsonHeaders(request, env) {
    const headers = buildCorsHeaders(request, env);
    headers.set("Content-Type", "application/json; charset=utf-8");
    return headers;
}

function jsonResponse(request, env, status, payload) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: buildJsonHeaders(request, env)
    });
}

function ensureRequiredEnv(env, keys) {
    const missing = keys.filter(function (key) {
        return !env[key];
    });

    if (missing.length > 0) {
        throw new Error("Missing env vars: " + missing.join(", "));
    }
}

function toBase64Url(value) {
    return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    return atob(padded);
}

function toBase64UrlBuffer(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";

    bytes.forEach(function (byte) {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";

    bytes.forEach(function (byte) {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary);
}

function timingSafeEqual(left, right) {
    if (left.length !== right.length) {
        return false;
    }

    let result = 0;

    for (let index = 0; index < left.length; index += 1) {
        result |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }

    return result === 0;
}
