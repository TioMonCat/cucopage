// ==========================================================
// Rutas de Administración (/api/admin/*)
// Protegidas por autenticación de administrador
// ==========================================================

import { jsonResponse, errorResponse } from '../utils/response.js';
import { isAuthorizedAdmin } from '../services/auth.js';
import {
    getLinks,
    createLink,
    updateLinkStatus,
    deleteLink,
    getPhotosByLinkId,
    getPhotoById,
    deletePhotoRecord,
    decrementPhotoCount,
    getDashboardMetrics,
    getLogs,
    addLog
} from '../services/db.js';
import { deleteFolderFromR2, deletePhotoFromR2 } from '../services/storage.js';
import { generateSecureToken, slugifyClientName } from '../utils/validation.js';

/**
 * Autenticación simple para el login del Admin Dashboard.
 */
export async function handleAdminLogin(request, env, origin) {
    try {
        const body = await request.json();
        const secret = body.secret || body.password || '';

        if (!env.ADMIN_SECRET) {
            return errorResponse('El backend no tiene configurada la variable ADMIN_SECRET.', 500, env, origin);
        }

        if (secret === env.ADMIN_SECRET) {
            return jsonResponse({
                success: true,
                message: 'Autenticación exitosa',
                token: env.ADMIN_SECRET
            }, 200, env, origin);
        }

        return errorResponse('Contraseña de administrador incorrecta.', 401, env, origin);
    } catch (e) {
        return errorResponse('Cuerpo de solicitud inválido.', 400, env, origin);
    }
}

/**
 * Retorna las métricas globales para las tarjetas del Dashboard.
 */
export async function handleAdminMetrics(request, env, origin) {
    if (!isAuthorizedAdmin(request, env)) {
        return errorResponse('No autorizado. Token de admin inválido o faltante.', 401, env, origin);
    }

    try {
        const metrics = await getDashboardMetrics(env.DB);
        return jsonResponse({ success: true, metrics }, 200, env, origin);
    } catch (err) {
        return errorResponse('Error al calcular métricas.', 500, env, origin, err.message);
    }
}

/**
 * Lista los enlaces con paginación, filtros y buscador.
 */
export async function handleAdminGetLinks(request, env, origin) {
    if (!isAuthorizedAdmin(request, env)) {
        return errorResponse('No autorizado.', 401, env, origin);
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || '';
    const search = url.searchParams.get('search') || '';
    const limit = parseInt(url.searchParams.get('limit'), 10) || 50;
    const offset = parseInt(url.searchParams.get('offset'), 10) || 0;

    try {
        const data = await getLinks(env.DB, { status, search, limit, offset });
        return jsonResponse({ success: true, ...data }, 200, env, origin);
    } catch (err) {
        return errorResponse('Error al obtener enlaces.', 500, env, origin, err.message);
    }
}

/**
 * Crea un nuevo enlace temporal.
 */
export async function handleAdminCreateLink(request, env, origin) {
    if (!isAuthorizedAdmin(request, env)) {
        return errorResponse('No autorizado.', 401, env, origin);
    }

    try {
        const clientName = (body.client_name || '').trim();
        if (!clientName) {
            return errorResponse('El nombre de la persona o cliente es obligatorio.', 400, env, origin);
        }

        const maxPhotos = parseInt(body.max_photos, 10) || 10;
        const expiresInHours = parseInt(body.expires_in_hours, 10) || parseInt(env.DEFAULT_EXPIRATION_HOURS, 10) || 24;
        const notes = (body.notes || '').trim();

        if (maxPhotos < 1 || maxPhotos > 20) {
            return errorResponse('El número máximo de fotos debe estar entre 1 y 20.', 400, env, origin);
        }

        const token = generateSecureToken();
        const slug = slugifyClientName(clientName);
        const folderName = `${slug}_${token.substring(0, 8)}`;

        const link = await createLink(env.DB, {
            token,
            client_name: clientName,
            folder_name: folderName,
            max_photos: maxPhotos,
            expires_in_hours: expiresInHours,
            notes
        });

        const ip = request.headers.get('cf-connecting-ip') || '';
        await addLog(env.DB, {
            link_id: link.id,
            token: link.token,
            event_type: 'link_creado',
            details: `Enlace generado para ${clientName} (Carpeta: ${folderName}) con ${maxPhotos} fotos y validez de ${expiresInHours}h. Notas: "${notes}"`,
            ip_address: ip
        });

        return jsonResponse({ success: true, link }, 201, env, origin);
    } catch (err) {
        return errorResponse('Error al crear el enlace.', 500, env, origin, err.message);
    }
}

/**
 * Revoca un enlace manualmente.
 */
export async function handleAdminRevokeLink(request, env, origin, linkId) {
    if (!isAuthorizedAdmin(request, env)) {
        return errorResponse('No autorizado.', 401, env, origin);
    }

    try {
        await updateLinkStatus(env.DB, linkId, 'revocado');

        const ip = request.headers.get('cf-connecting-ip') || '';
        await addLog(env.DB, {
            link_id: linkId,
            event_type: 'link_revocado',
            details: `Enlace ID ${linkId} revocado manualmente por el administrador`,
            ip_address: ip
        });

        return jsonResponse({ success: true, message: 'Enlace revocado con éxito' }, 200, env, origin);
    } catch (err) {
        return errorResponse('Error al revocar enlace.', 500, env, origin, err.message);
    }
}

/**
 * Elimina un enlace y todas sus fotos asociadas en R2 y D1.
 */
export async function handleAdminDeleteLink(request, env, origin, linkId) {
    if (!isAuthorizedAdmin(request, env)) {
        return errorResponse('No autorizado.', 401, env, origin);
    }

    try {
        const link = await env.DB.prepare("SELECT token, folder_name FROM links WHERE id = ?").bind(linkId).first();
        if (link) {
            const folder = link.folder_name || link.token;
            await deleteFolderFromR2(env.PHOTOS_BUCKET, `uploads/${folder}/`);
        }

        await deleteLink(env.DB, linkId);

        const ip = request.headers.get('cf-connecting-ip') || '';
        await addLog(env.DB, {
            link_id: null,
            event_type: 'link_eliminado',
            details: `Enlace ID ${linkId} y sus fotos en R2 fueron eliminados por el administrador`,
            ip_address: ip
        });

        return jsonResponse({ success: true, message: 'Enlace y fotos eliminados correctamente' }, 200, env, origin);
    } catch (err) {
        return errorResponse('Error al eliminar el enlace.', 500, env, origin, err.message);
    }
}

/**
 * Obtiene las fotos de un enlace específico.
 */
export async function handleAdminGetLinkPhotos(request, env, origin, linkId) {
    if (!isAuthorizedAdmin(request, env)) {
        return errorResponse('No autorizado.', 401, env, origin);
    }

    try {
        const link = await env.DB.prepare("SELECT * FROM links WHERE id = ?").bind(linkId).first();
        if (!link) {
            return errorResponse('Enlace no encontrado.', 404, env, origin);
        }

        const photos = await getPhotosByLinkId(env.DB, linkId);
        return jsonResponse({ success: true, link, photos }, 200, env, origin);
    } catch (err) {
        return errorResponse('Error al obtener fotos.', 500, env, origin, err.message);
    }
}

/**
 * Elimina una foto individual de R2 y D1.
 */
export async function handleAdminDeletePhoto(request, env, origin, photoId) {
    if (!isAuthorizedAdmin(request, env)) {
        return errorResponse('No autorizado.', 401, env, origin);
    }

    try {
        const photo = await getPhotoById(env.DB, photoId);
        if (!photo) {
            return errorResponse('Foto no encontrada.', 404, env, origin);
        }

        // Eliminar de R2
        await deletePhotoFromR2(env.PHOTOS_BUCKET, photo.r2_key);

        // Eliminar de D1 y decrementar contador del link
        await deletePhotoRecord(env.DB, photoId);
        await decrementPhotoCount(env.DB, photo.link_id);

        const ip = request.headers.get('cf-connecting-ip') || '';
        await addLog(env.DB, {
            link_id: photo.link_id,
            event_type: 'foto_eliminada',
            details: `Foto ${photo.filename} (ID ${photoId}) eliminada por el administrador`,
            ip_address: ip
        });

        return jsonResponse({ success: true, message: 'Foto eliminada con éxito' }, 200, env, origin);
    } catch (err) {
        return errorResponse('Error al eliminar foto.', 500, env, origin, err.message);
    }
}

/**
 * Obtiene los logs de auditoría para el dashboard.
 */
export async function handleAdminGetLogs(request, env, origin) {
    if (!isAuthorizedAdmin(request, env)) {
        return errorResponse('No autorizado.', 401, env, origin);
    }

    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';
    const limit = parseInt(url.searchParams.get('limit'), 10) || 100;
    const offset = parseInt(url.searchParams.get('offset'), 10) || 0;

    try {
        const logs = await getLogs(env.DB, { limit, offset, token });
        return jsonResponse({ success: true, logs }, 200, env, origin);
    } catch (err) {
        return errorResponse('Error al obtener logs.', 500, env, origin, err.message);
    }
}
