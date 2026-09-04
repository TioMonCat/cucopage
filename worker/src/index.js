// ==========================================================
// Cloudflare Worker — Router Principal y Manejador de Eventos
// ==========================================================

import { corsPreflightResponse, jsonResponse, errorResponse } from './utils/response.js';
import { handleValidate } from './routes/validate.js';
import { handleUpload, handleCompleteUpload, handleClientDeletePhoto } from './routes/upload.js';
import { handlePhotoServe } from './routes/photos.js';
import {
    handleAdminLogin,
    handleAdminMetrics,
    handleAdminGetLinks,
    handleAdminCreateLink,
    handleAdminRevokeLink,
    handleAdminUpdateStatus,
    handleAdminDeleteLink,
    handleAdminGetLinkPhotos,
    handleAdminDeletePhoto,
    handleAdminGetLogs
} from './routes/admin.js';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method.toUpperCase();
        const origin = request.headers.get('Origin') || '';

        // 1. Manejo de CORS Preflight (OPTIONS)
        if (method === 'OPTIONS') {
            return corsPreflightResponse(env, origin);
        }

        try {
            // Healthcheck
            if (path === '/api/health' || path === '/health') {
                return jsonResponse({
                    status: 'ok',
                    service: 'photo-upload-worker',
                    timestamp: new Date().toISOString()
                }, 200, env, origin);
            }

            // Rutas Públicas de Usuario
            if (path === '/api/validate' && method === 'GET') {
                return await handleValidate(request, env, origin);
            }

            if (path === '/api/upload' && method === 'POST') {
                return await handleUpload(request, env, origin);
            }

            if (path === '/api/upload/complete' && method === 'POST') {
                return await handleCompleteUpload(request, env, origin);
            }

            // Eliminación de fotos por parte del cliente
            const clientDeleteMatch = path.match(/^\/api\/upload\/photo\/(\d+)$/);
            if (clientDeleteMatch && method === 'DELETE') {
                const photoId = parseInt(clientDeleteMatch[1], 10);
                return await handleClientDeletePhoto(request, env, origin, photoId);
            }

            // Transmisión / Descarga de Fotos
            if (path === '/api/photos/view' && method === 'GET') {
                return await handlePhotoServe(request, env, origin, false);
            }

            if (path === '/api/photos/download' && method === 'GET') {
                return await handlePhotoServe(request, env, origin, true);
            }

            // Rutas de Administración
            if (path === '/api/admin/login' && method === 'POST') {
                return await handleAdminLogin(request, env, origin);
            }

            if (path === '/api/admin/metrics' && method === 'GET') {
                return await handleAdminMetrics(request, env, origin);
            }

            if (path === '/api/admin/links' && method === 'GET') {
                return await handleAdminGetLinks(request, env, origin);
            }

            if (path === '/api/admin/links' && method === 'POST') {
                return await handleAdminCreateLink(request, env, origin);
            }

            // Rutas dinámicas de enlaces admin: /api/admin/links/:id(/revoke|/photos|/status)?
            const linkRouteMatch = path.match(/^\/api\/admin\/links\/(\d+)(?:\/(revoke|photos|status))?$/);
            if (linkRouteMatch) {
                const linkId = parseInt(linkRouteMatch[1], 10);
                const subAction = linkRouteMatch[2];

                if (!subAction && method === 'DELETE') {
                    return await handleAdminDeleteLink(request, env, origin, linkId);
                }
                if (subAction === 'revoke' && (method === 'PATCH' || method === 'POST')) {
                    return await handleAdminRevokeLink(request, env, origin, linkId);
                }
                if (subAction === 'status' && (method === 'PATCH' || method === 'POST')) {
                    return await handleAdminUpdateStatus(request, env, origin, linkId);
                }
                if (subAction === 'photos' && method === 'GET') {
                    return await handleAdminGetLinkPhotos(request, env, origin, linkId);
                }
            }

            // Rutas dinámicas de fotos admin: /api/admin/photos/:id
            const photoRouteMatch = path.match(/^\/api\/admin\/photos\/(\d+)$/);
            if (photoRouteMatch && method === 'DELETE') {
                const photoId = parseInt(photoRouteMatch[1], 10);
                return await handleAdminDeletePhoto(request, env, origin, photoId);
            }

            if (path === '/api/admin/logs' && method === 'GET') {
                return await handleAdminGetLogs(request, env, origin);
            }

            // Ruta no encontrada
            return errorResponse(`Ruta no encontrada: ${method} ${path}`, 404, env, origin);

        } catch (fatalErr) {
            console.error('Error fatal no capturado en el Worker:', fatalErr);
            return errorResponse('Error interno en el servidor.', 500, env, origin, fatalErr.message);
        }
    }
};
