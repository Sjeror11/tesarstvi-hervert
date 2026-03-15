CREATE TABLE IF NOT EXISTS gallery_photos (
    id TEXT PRIMARY KEY,
    service_slug TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    alt_text TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_credentials (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gallery_photos_service_slug_created_at
ON gallery_photos(service_slug, created_at DESC);
