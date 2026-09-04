-- Migración para eliminar CHECK restrictivo y soportar estados personalizables:
-- 'abierto', 'revision', 'entregado' y personalizados.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS links_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    client_name TEXT NOT NULL DEFAULT '',
    folder_name TEXT NOT NULL DEFAULT '',
    max_photos INTEGER NOT NULL DEFAULT 10,
    uploaded_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'abierto',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);

INSERT INTO links_new (id, token, client_name, folder_name, max_photos, uploaded_count, status, notes, created_at, expires_at)
SELECT id, token, client_name, folder_name, max_photos, uploaded_count, 
       CASE WHEN status = 'activo' THEN 'abierto' ELSE status END,
       notes, created_at, expires_at
FROM links;

DROP TABLE links;

ALTER TABLE links_new RENAME TO links;

CREATE INDEX IF NOT EXISTS idx_links_token ON links(token);
CREATE INDEX IF NOT EXISTS idx_links_status ON links(status);
CREATE INDEX IF NOT EXISTS idx_links_expires_at ON links(expires_at);

PRAGMA foreign_keys = ON;
