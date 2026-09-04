// ==========================================================
// Ruta: GET /api/validate
// Valida un token temporal y retorna su estado
// ==========================================================

import { jsonResponse, errorResponse } from '../utils/response.js';
import { getLinkByToken, addLog } from '../services/db.js';

export async function handleValidate(request, env, origin) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
        return errorResponse('Token no especificado en la consulta.', 400, env, origin);
    }

    try {
        const link = await getLinkByToken(env.DB, token);

        const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
        const userAgent = request.headers.get('user-agent') || '';

        if (!link) {
            await addLog(env.DB, {
                link_id: null,
                token,
                event_type: 'token_invalido',
                details: 'Intento de acceso con token inexistente',
                ip_address: ip,
                user_agent: userAgent
            });

            return jsonResponse({
                valid: false,
                status: 'inexistente',
                message: 'El enlace proporcionado no existe o no es válido.'
            }, 404, env, origin);
        }

        // Si expiró o fue revocado o agotado
        if (link.status === 'expirado') {
            return jsonResponse({
                valid: false,
                status: 'expirado',
                message: 'Este enlace ha caducado por límite de tiempo.',
                expires_at: link.expires_at
            }, 200, env, origin);
        }

        if (link.status === 'revocado') {
            return jsonResponse({
                valid: false,
                status: 'revocado',
                message: 'Este enlace ha sido revocado por el administrador.',
            }, 200, env, origin);
        }

        if (link.status === 'agotado' || link.uploaded_count >= link.max_photos) {
            return jsonResponse({
                valid: false,
                status: 'agotado',
                message: 'Se ha alcanzado el límite máximo de fotos para este enlace.',
                max_photos: link.max_photos,
                uploaded_count: link.uploaded_count
            }, 200, env, origin);
        }

        // Enlace activo y válido
        const remainingPhotos = Math.max(0, link.max_photos - link.uploaded_count);

        await addLog(env.DB, {
            link_id: link.id,
            token: link.token,
            event_type: 'link_validado',
            details: `Enlace validado con éxito. Restantes: ${remainingPhotos} fotos`,
            ip_address: ip,
            user_agent: userAgent
        });

        return jsonResponse({
            valid: true,
            status: 'activo',
            token: link.token,
            max_photos: link.max_photos,
            uploaded_count: link.uploaded_count,
            remaining_photos: remainingPhotos,
            created_at: link.created_at,
            expires_at: link.expires_at,
            seconds_remaining: Math.max(0, link.seconds_remaining)
        }, 200, env, origin);

    } catch (err) {
        console.error('Error en validación de token:', err);
        return errorResponse('Error interno al validar el enlace.', 500, env, origin, err.message);
    }
}
