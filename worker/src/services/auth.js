// ==========================================================
// Servicio de Autenticación de Administración
// ==========================================================

/**
 * Valida si la petición entrante incluye el secreto de administrador configurado.
 * @param {Request} request 
 * @param {object} env 
 * @returns {boolean}
 */
export function isAuthorizedAdmin(request, env) {
    const adminSecret = env.ADMIN_SECRET;
    if (!adminSecret) {
        // En caso de que no se haya configurado el secreto en el Worker, rechazamos por seguridad
        console.error('ALERTA: ADMIN_SECRET no está configurado en las variables de entorno del Worker.');
        return false;
    }

    // 1. Verificar encabezado Authorization: Bearer <token>
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
        const parts = authHeader.split(' ');
        if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
            if (parts[1] === adminSecret) return true;
        }
    }

    // 2. Verificar encabezado personalizado X-Admin-Token
    const tokenHeader = request.headers.get('X-Admin-Token');
    if (tokenHeader && tokenHeader === adminSecret) {
        return true;
    }

    // 3. Opcional: verificar cookie si existiera
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
        const cookies = Object.fromEntries(
            cookieHeader.split(';').map(c => {
                const [k, ...v] = c.trim().split('=');
                return [k, v.join('=')];
            })
        );
        if (cookies['admin_session'] === adminSecret) {
            return true;
        }
    }

    return false;
}
