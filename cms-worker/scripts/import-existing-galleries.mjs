import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const API_BASE = process.env.CMS_API_BASE || "https://tesarstvi-hervert-cms.sjeror11.workers.dev";
const USERNAME = process.env.CMS_ADMIN_USERNAME || "admin";
const PASSWORD = process.env.CMS_ADMIN_PASSWORD || "";

if (!PASSWORD) {
    console.error("Missing CMS_ADMIN_PASSWORD env var.");
    process.exit(1);
}

const contentPath = path.join(repoRoot, "data", "site-content.json");
const content = JSON.parse(await readFile(contentPath, "utf8"));

const loginResponse = await fetch(API_BASE + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        username: USERNAME,
        password: PASSWORD
    })
});

if (!loginResponse.ok) {
    console.error("Login failed:", await loginResponse.text());
    process.exit(1);
}

const cookieHeader = loginResponse.headers.get("set-cookie");

if (!cookieHeader) {
    console.error("Login succeeded without session cookie.");
    process.exit(1);
}

const sessionCookie = cookieHeader.split(";")[0];

const existingResponse = await fetch(API_BASE + "/api/admin/photos", {
    headers: {
        Cookie: sessionCookie
    }
});

if (!existingResponse.ok) {
    console.error("Failed to load existing photos:", await existingResponse.text());
    process.exit(1);
}

const existingPayload = await existingResponse.json();
const existingByService = existingPayload.photosByService || {};

let uploaded = 0;
let skipped = 0;

for (const service of content.services || []) {
    const existingFiles = new Set(
        (existingByService[service.slug] || []).map(function (photo) {
            return photo.filename;
        })
    );

    for (const relativePhotoPath of service.photos || []) {
        const absolutePhotoPath = path.join(repoRoot, relativePhotoPath);
        const filename = path.basename(relativePhotoPath);

        if (existingFiles.has(filename)) {
            skipped += 1;
            continue;
        }

        const fileBuffer = await readFile(absolutePhotoPath);
        const form = new FormData();
        form.set("service", service.slug);
        form.set("alt", service.galleryTitle || service.title || "");
        form.set("file", new Blob([fileBuffer], { type: guessContentType(filename) }), filename);

        const uploadResponse = await fetch(API_BASE + "/api/admin/photos/upload", {
            method: "POST",
            headers: {
                Cookie: sessionCookie
            },
            body: form
        });

        if (!uploadResponse.ok) {
            console.error("Upload failed for", relativePhotoPath, ":", await uploadResponse.text());
            process.exit(1);
        }

        uploaded += 1;
        console.log("Uploaded", relativePhotoPath);
    }
}

console.log("Done. Uploaded:", uploaded, "Skipped:", skipped);

function guessContentType(filename) {
    const lower = filename.toLowerCase();

    if (lower.endsWith(".png")) {
        return "image/png";
    }

    if (lower.endsWith(".webp")) {
        return "image/webp";
    }

    if (lower.endsWith(".gif")) {
        return "image/gif";
    }

    return "image/jpeg";
}
