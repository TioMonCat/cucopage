// ==========================================================
// Ruta: /api/photos/view y /api/photos/download
// Transmisión segura de imágenes desde Cloudflare R2
// ==========================================================

import { getCorsHeaders } from '../utils/response.js';
import { getPhotoFromR2 } from '../services/storage.js';
import { isAuthorizedAdmin } from '../services/auth.js';
import { getLinkByToken } from '../services/db.js';

export async function handlePhotoServe(request, env, origin, isDownload = false) {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    const token = url.searchParams.get('token');
    const adminToken = url.searchParams.get('admin_token');

    if (!key) {
        return new Response('Parámetro "key" no especificado.', { status: 400 });
    }

    // Comprobar autorización:
    // 1. ¿Es administrador autorizado (por cabecera o por query param admin_token)?
    let isAuthorized = false;
    if (isAuthorizedAdmin(request, env) || (adminToken && env.ADMIN_SECRET && adminToken === env.ADMIN_SECRET)) {
        isAuthorized = true;
    }

    // 2. ¿El key corresponde al token proporcionado y el token es válido?
    if (!isAuthorized && token && key.startsWith(`uploads/${token}/`)) {
        const link = await getLinkByToken(env.DB, token);
        if (link) {
            isAuthorized = true;
        }
    }

    if (!isAuthorized) {
        return new Response('No autorizado para ver o descargar este recurso.', { status: 403 });
    }

    // Obtener objeto desde R2
    const object = await getPhotoFromR2(env.PHOTOS_BUCKET, key);
    if (!object) {
        return new Response('Foto no encontrada en el almacenamiento.', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    // Agregar cabeceras CORS
    const corsHeaders = getCorsHeaders(env, origin);
    for (const [k, v] of Object.entries(corsHeaders)) {
        headers.set(k, v);
    }

    // Obtener nombre de archivo original
    const filename = object.customMetadata?.originalName || key.split('_').pop() || 'foto.jpg';

    if (isDownload) {
        headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    } else {
        headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    }

    headers.set('Cache-Control', 'public, max-age=604800, immutable');

    return new Response(object.body, {
        headers
    });
}
