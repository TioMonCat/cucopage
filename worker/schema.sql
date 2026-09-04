-- ==========================================================
-- Esquema de Base de Datos para Cloudflare D1 (SQLite)
-- Sistema de Subida de Fotos con Links Temporales
-- ==========================================================

-- Tabla de Enlaces de Subida
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    max_photos INTEGER NOT NULL DEFAULT 10,
    uploaded_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'activo' CHECK(status IN ('activo', 'agotado', 'expirado', 'revocado')),
    client_name TEXT NOT NULL DEFAULT '',
    folder_name TEXT NOT NULL DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_links_token ON links(token);
CREATE INDEX IF NOT EXISTS idx_links_status ON links(status);
CREATE INDEX IF NOT EXISTS idx_links_expires_at ON links(expires_at);

-- Tabla de Fotos Subidas
CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id INTEGER NOT NULL,
    r2_key TEXT UNIQUE NOT NULL,
    filename TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(link_id) REFERENCES links(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_photos_link_id ON photos(link_id);
CREATE INDEX IF NOT EXISTS idx_photos_r2_key ON photos(r2_key);

-- Tabla de Auditoría y Logs de Eventos
CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id INTEGER,
    token TEXT,
    event_type TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(link_id) REFERENCES links(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_link_id ON logs(link_id);
CREATE INDEX IF NOT EXISTS idx_logs_token ON logs(token);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);
