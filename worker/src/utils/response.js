// ==========================================================
// Helpers de Respuesta HTTP y CORS
// ==========================================================

export function getCorsHeaders(env, origin = '') {
    const allowedOrigin = env.CORS_ALLOWED_ORIGIN || '*';
    const effectiveOrigin = allowedOrigin === '*' ? '*' : (origin === allowedOrigin ? origin : allowedOrigin);

    return {
        'Access-Control-Allow-Origin': effectiveOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
        'Access-Control-Max-Age': '86400',
    };
}

export function jsonResponse(data, status = 200, env = {}, origin = '') {
    const corsHeaders = getCorsHeaders(env, origin);
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...corsHeaders
        }
    });
}

export function errorResponse(message, status = 400, env = {}, origin = '', details = null) {
    const body = {
        success: false,
        error: message,
        ...(details ? { details } : {})
    };
    return jsonResponse(body, status, env, origin);
}

export function corsPreflightResponse(env, origin = '') {
    const corsHeaders = getCorsHeaders(env, origin);
    return new Response(null, {
        status: 204,
        headers: corsHeaders
    });
}
