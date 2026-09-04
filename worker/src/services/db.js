// ==========================================================
// Servicio de Base de Datos Cloudflare D1 (SQLite)
// ==========================================================

/**
 * Obtiene un enlace por su token y actualiza su estado si ya ha expirado.
 */
export async function getLinkByToken(db, token) {
    if (!token) return null;

    const query = `
        SELECT id, token, client_name, folder_name, max_photos, uploaded_count, status, notes, created_at, expires_at,
               (strftime('%s', expires_at) - strftime('%s', 'now')) AS seconds_remaining
        FROM links
        WHERE token = ?
    `;
    const result = await db.prepare(query).bind(token).first();

    if (!result) return null;

    // Verificar si ya expiró por tiempo y aún figura como abierto
    if ((result.status === 'abierto' || result.status === 'activo') && result.seconds_remaining <= 0) {
        await db.prepare("UPDATE links SET status = 'expirado' WHERE id = ?").bind(result.id).run();
        result.status = 'expirado';
        result.seconds_remaining = 0;
    }

    return result;
}

/**
 * Crea un nuevo enlace temporal.
 */
export async function createLink(db, { token, client_name = '', folder_name = '', max_photos = 10, expires_in_hours = 24, notes = '' }) {
    const hours = Math.max(1, Math.min(168, parseInt(expires_in_hours, 10) || 24)); // Entre 1h y 7 días
    const maxPhotos = Math.max(1, Math.min(20, parseInt(max_photos, 10) || 10)); // Entre 1 y 20 fotos

    const insertQuery = `
        INSERT INTO links (token, client_name, folder_name, max_photos, uploaded_count, status, notes, created_at, expires_at)
        VALUES (?, ?, ?, ?, 0, 'abierto', ?, datetime('now'), datetime('now', '+' || ? || ' hours'))
    `;

    const info = await db.prepare(insertQuery).bind(token, client_name, folder_name, maxPhotos, notes, hours).run();

    const created = await db.prepare(`
        SELECT id, token, client_name, folder_name, max_photos, uploaded_count, status, notes, created_at, expires_at,
               (strftime('%s', expires_at) - strftime('%s', 'now')) AS seconds_remaining
        FROM links WHERE id = ?
    `).bind(info.meta.last_row_id).first();

    return created;
}

/**
 * Incrementa atómicamente el contador de fotos subidas y actualiza el estado a 'revision' si llega al límite.
 */
export async function incrementPhotoCount(db, linkId) {
    const link = await db.prepare("SELECT id, max_photos, uploaded_count, status FROM links WHERE id = ?").bind(linkId).first();
    if (!link) return { success: false, error: 'Enlace no encontrado' };

    if (link.uploaded_count >= link.max_photos) {
        return { success: false, error: 'El cupo máximo de fotos ya fue alcanzado' };
    }

    const newCount = link.uploaded_count + 1;
    let newStatus = link.status;
    if (newCount >= link.max_photos && (link.status === 'abierto' || link.status === 'activo')) {
        newStatus = 'revision'; // Automáticamente pasa a Revisión/Preparación
    }

    await db.prepare("UPDATE links SET uploaded_count = ?, status = ? WHERE id = ?")
        .bind(newCount, newStatus, linkId)
        .run();

    return { success: true, uploaded_count: newCount, is_exhausted: newCount >= link.max_photos, status: newStatus };
}

/**
 * Decrementa el contador de fotos subidas si se elimina una foto.
 */
export async function decrementPhotoCount(db, linkId) {
    const link = await db.prepare("SELECT id, uploaded_count, max_photos, status FROM links WHERE id = ?").bind(linkId).first();
    if (!link) return;

    const newCount = Math.max(0, link.uploaded_count - 1);
    let newStatus = link.status;
    if (link.status === 'revision' && newCount < link.max_photos) {
        newStatus = 'abierto';
    }

    await db.prepare("UPDATE links SET uploaded_count = ?, status = ? WHERE id = ?")
        .bind(newCount, newStatus, linkId)
        .run();
}

/**
 * Cambia el estado de un enlace (ej: 'revocado').
 */
export async function updateLinkStatus(db, linkId, newStatus) {
    await db.prepare("UPDATE links SET status = ? WHERE id = ?").bind(newStatus, linkId).run();
}

/**
 * Registra una foto subida en la base de datos.
 */
export async function addPhoto(db, { link_id, r2_key, filename, file_size, mime_type }) {
    const query = `
        INSERT INTO photos (link_id, r2_key, filename, file_size, mime_type, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
    `;
    const result = await db.prepare(query)
        .bind(link_id, r2_key, filename, file_size, mime_type)
        .run();

    return result.meta.last_row_id;
}

/**
 * Lista las fotos pertenecientes a un enlace.
 */
export async function getPhotosByLinkId(db, linkId) {
    const query = `
        SELECT id, link_id, r2_key, filename, file_size, mime_type, created_at
        FROM photos
        WHERE link_id = ?
        ORDER BY created_at DESC
    `;
    const { results } = await db.prepare(query).bind(linkId).all();
    return results || [];
}

/**
 * Obtiene los datos de una foto por su ID.
 */
export async function getPhotoById(db, photoId) {
    return await db.prepare("SELECT * FROM photos WHERE id = ?").bind(photoId).first();
}

/**
 * Elimina el registro de una foto.
 */
export async function deletePhotoRecord(db, photoId) {
    return await db.prepare("DELETE FROM photos WHERE id = ?").bind(photoId).run();
}

/**
 * Elimina un enlace y sus fotos en cascada.
 */
export async function deleteLink(db, linkId) {
    await db.prepare("DELETE FROM photos WHERE link_id = ?").bind(linkId).run();
    await db.prepare("DELETE FROM logs WHERE link_id = ?").bind(linkId).run();
    return await db.prepare("DELETE FROM links WHERE id = ?").bind(linkId).run();
}

/**
 * Obtiene el listado de links para el dashboard con filtros y conteo total.
 */
export async function getLinks(db, { status = '', search = '', limit = 50, offset = 0 } = {}) {
    // Primero actualizar expiraciones
    await db.prepare("UPDATE links SET status = 'expirado' WHERE status = 'activo' AND datetime(expires_at) <= datetime('now')").run();

    let whereClause = "WHERE 1=1";
    const params = [];

    if (status) {
        whereClause += " AND status = ?";
        params.push(status);
    }

    if (search) {
        whereClause += " AND (token LIKE ? OR client_name LIKE ? OR notes LIKE ?)";
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countQuery = `SELECT COUNT(*) as total FROM links ${whereClause}`;
    const countResult = await db.prepare(countQuery).bind(...params).first();
    const total = countResult ? countResult.total : 0;

    const selectQuery = `
        SELECT id, token, client_name, folder_name, max_photos, uploaded_count, status, notes, created_at, expires_at,
               (strftime('%s', expires_at) - strftime('%s', 'now')) AS seconds_remaining
        FROM links
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `;
    const { results } = await db.prepare(selectQuery).bind(...params, limit, offset).all();

    return { total, links: results || [] };
}

/**
 * Calcula métricas generales para el dashboard de administración.
 */
export async function getDashboardMetrics(db) {
    // Actualizar expirados primero
    await db.prepare("UPDATE links SET status = 'expirado' WHERE status IN ('abierto', 'activo') AND datetime(expires_at) <= datetime('now')").run();

    const metricsQuery = `
        SELECT 
            COUNT(*) AS total_links,
            SUM(CASE WHEN status IN ('abierto', 'activo') THEN 1 ELSE 0 END) AS open_links,
            SUM(CASE WHEN status = 'revision' THEN 1 ELSE 0 END) AS review_links,
            SUM(CASE WHEN status = 'entregado' THEN 1 ELSE 0 END) AS delivered_links,
            SUM(CASE WHEN status = 'expirado' THEN 1 ELSE 0 END) AS expired_links,
            COALESCE(SUM(uploaded_count), 0) AS total_photos_uploaded
        FROM links
    `;
    const metrics = await db.prepare(metricsQuery).first();

    const storageQuery = `
        SELECT 
            COUNT(*) AS total_stored_photos,
            COALESCE(SUM(file_size), 0) AS total_storage_bytes
        FROM photos
    `;
    const storage = await db.prepare(storageQuery).first();

    return {
        total_links: metrics?.total_links || 0,
        open_links: metrics?.open_links || 0,
        review_links: metrics?.review_links || 0,
        delivered_links: metrics?.delivered_links || 0,
        expired_links: metrics?.expired_links || 0,
        total_photos_uploaded: metrics?.total_photos_uploaded || 0,
        total_stored_photos: storage?.total_stored_photos || 0,
        total_storage_bytes: storage?.total_storage_bytes || 0
    };
}

/**
 * Registra un evento de auditoría en la tabla logs.
 */
export async function addLog(db, { link_id = null, token = null, event_type, details = '', ip_address = '', user_agent = '' }) {
    try {
        const query = `
            INSERT INTO logs (link_id, token, event_type, details, ip_address, user_agent, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `;
        await db.prepare(query)
            .bind(link_id, token, event_type, details, ip_address || '', (user_agent || '').substring(0, 255))
            .run();
    } catch (err) {
        console.error('Error insertando log en D1:', err);
    }
}

/**
 * Obtiene los logs de auditoría para el dashboard.
 */
export async function getLogs(db, { limit = 100, offset = 0, token = '' } = {}) {
    let whereClause = "WHERE 1=1";
    const params = [];

    if (token) {
        whereClause += " AND token = ?";
        params.push(token);
    }

    const selectQuery = `
        SELECT id, link_id, token, event_type, details, ip_address, user_agent, created_at
        FROM logs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `;
    const { results } = await db.prepare(selectQuery).bind(...params, limit, offset).all();
    return results || [];
}
