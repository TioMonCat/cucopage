// ==========================================================
// Ruta: POST /api/upload y POST /api/upload/complete
// Procesa la subida incremental de fotos y validación de cuota
// ==========================================================

import { jsonResponse, errorResponse } from '../utils/response.js';
import { getLinkByToken, incrementPhotoCount, addPhoto, addLog, updateLinkStatus } from '../services/db.js';
import { savePhotoToR2 } from '../services/storage.js';
import { validateImageMagicBytes, sanitizeFilename } from '../utils/validation.js';

export async function handleUpload(request, env, origin) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
        return errorResponse('Token no especificado.', 400, env, origin);
    }

    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
    const userAgent = request.headers.get('user-agent') || '';

    // 1. Validar estado del link
    const link = await getLinkByToken(env.DB, token);
    if (!link) {
        return errorResponse('El enlace no existe.', 404, env, origin);
    }

    if (link.status === 'expirado' || link.seconds_remaining <= 0) {
        return errorResponse('El enlace ha expirado por tiempo límite.', 410, env, origin);
    }

    if (link.status === 'revocado') {
        return errorResponse('Este enlace ha sido revocado por el administrador.', 403, env, origin);
    }

    if (link.status === 'agotado' || link.uploaded_count >= link.max_photos) {
        return errorResponse(`Se ha alcanzado el límite máximo de ${link.max_photos} fotos permitidas.`, 403, env, origin);
    }

    // 2. Extraer archivo de la petición
    let file = null;
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
        try {
            const formData = await request.formData();
            file = formData.get('photo') || formData.get('file');
        } catch (e) {
            return errorResponse('Error al procesar el formulario de subida.', 400, env, origin, e.message);
        }
    } else {
        return errorResponse('Se requiere formato multipart/form-data con el campo "photo".', 400, env, origin);
    }

    if (!file || typeof file === 'string') {
        return errorResponse('No se encontró ningún archivo en la solicitud.', 400, env, origin);
    }

    // 3. Validar tamaño del archivo
    const maxSizeBytes = (parseInt(env.MAX_FILE_SIZE_MB, 10) || 25) * 1024 * 1024;
    if (file.size > maxSizeBytes) {
        return errorResponse(`El archivo supera el tamaño máximo permitido de ${env.MAX_FILE_SIZE_MB || 25} MB.`, 413, env, origin);
    }

    // 4. Validar Magic Bytes
    const arrayBuffer = await file.arrayBuffer();
    const magicCheck = validateImageMagicBytes(arrayBuffer, file.type);
    if (!magicCheck.valid) {
        await addLog(env.DB, {
            link_id: link.id,
            token: link.token,
            event_type: 'error_magic_bytes',
            details: `Archivo rechazado: ${file.name} - ${magicCheck.error}`,
            ip_address: ip,
            user_agent: userAgent
        });
        return errorResponse(magicCheck.error, 415, env, origin);
    }

    const cleanFilename = sanitizeFilename(file.name);
    const mimeType = magicCheck.detectedMime || file.type || 'image/jpeg';
    const fileUuid = crypto.randomUUID();
    const r2Key = `uploads/${token}/${fileUuid}_${cleanFilename}`;

    try {
        // 5. Guardar en Cloudflare R2
        await savePhotoToR2(env.PHOTOS_BUCKET, r2Key, arrayBuffer, mimeType, {
            originalName: cleanFilename,
            token: token,
            linkId: String(link.id)
        });

        // 6. Incrementar contador en D1 atómicamente
        const countResult = await incrementPhotoCount(env.DB, link.id);
        if (!countResult.success) {
            // Revertir objeto de R2 si la cuota ya se había agotado en una condición de carrera
            await env.PHOTOS_BUCKET.delete(r2Key);
            return errorResponse(countResult.error, 403, env, origin);
        }

        // 7. Guardar registro en la tabla photos
        const photoId = await addPhoto(env.DB, {
            link_id: link.id,
            r2_key: r2Key,
            filename: cleanFilename,
            file_size: file.size,
            mime_type: mimeType
        });

        // 8. Registrar log de auditoría
        await addLog(env.DB, {
            link_id: link.id,
            token: link.token,
            event_type: 'foto_subida',
            details: `Foto guardada: ${cleanFilename} (${(file.size / 1024 / 1024).toFixed(2)} MB). Total: ${countResult.uploaded_count}/${link.max_photos}`,
            ip_address: ip,
            user_agent: userAgent
        });

        if (countResult.is_exhausted) {
            await addLog(env.DB, {
                link_id: link.id,
                token: link.token,
                event_type: 'link_agotado',
                details: `Cupo de fotos completado (${link.max_photos}/${link.max_photos})`,
                ip_address: ip,
                user_agent: userAgent
            });
        }

        return jsonResponse({
            success: true,
            photo: {
                id: photoId,
                filename: cleanFilename,
                file_size: file.size,
                mime_type: mimeType,
                r2_key: r2Key
            },
            uploaded_count: countResult.uploaded_count,
            max_photos: link.max_photos,
            remaining_photos: Math.max(0, link.max_photos - countResult.uploaded_count),
            is_exhausted: countResult.is_exhausted
        }, 201, env, origin);

    } catch (err) {
        console.error('Error al procesar la subida:', err);
        return errorResponse('Error interno al guardar la foto.', 500, env, origin, err.message);
    }
}

/**
 * Permite al usuario marcar voluntariamente la subida como finalizada.
 */
export async function handleCompleteUpload(request, env, origin) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
        return errorResponse('Token no especificado.', 400, env, origin);
    }

    const link = await getLinkByToken(env.DB, token);
    if (!link) {
        return errorResponse('Enlace no encontrado.', 404, env, origin);
    }

    await updateLinkStatus(env.DB, link.id, 'agotado');

    const ip = request.headers.get('cf-connecting-ip') || '';
    const userAgent = request.headers.get('user-agent') || '';

    await addLog(env.DB, {
        link_id: link.id,
        token: link.token,
        event_type: 'subida_finalizada',
        details: `El usuario finalizó la entrega manualmente con ${link.uploaded_count} fotos subidas`,
        ip_address: ip,
        user_agent: userAgent
    });

    return jsonResponse({
        success: true,
        message: 'Entrega finalizada con éxito. Gracias por subir tus fotos.',
        uploaded_count: link.uploaded_count
    }, 200, env, origin);
}
