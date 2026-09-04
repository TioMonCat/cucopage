// ==========================================================
// Validaciones de Seguridad y Tipos de Archivo (Magic Bytes)
// ==========================================================

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/heic',
    'image/heif'
]);

/**
 * Valida los primeros bytes (magic numbers) del archivo para asegurar
 * que sea una imagen real y no un archivo malicioso renombrado.
 * @param {ArrayBuffer} buffer - Los primeros bytes del archivo (al menos 32 bytes)
 * @param {string} declaredMime - Tipo MIME declarado en la subida
 * @returns {{ valid: boolean, detectedMime: string|null, error: string|null }}
 */
export function validateImageMagicBytes(buffer, declaredMime = '') {
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 12) {
        return { valid: false, detectedMime: null, error: 'El archivo es demasiado pequeño o está corrupto.' };
    }

    // JPEG: FF D8 FF
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
        return { valid: true, detectedMime: 'image/jpeg', error: null };
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
        bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
        bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A
    ) {
        return { valid: true, detectedMime: 'image/png', error: null };
    }

    // GIF: 47 49 46 38 (GIF87a o GIF89a)
    if (
        bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
        (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
    ) {
        return { valid: true, detectedMime: 'image/gif', error: null };
    }

    // WEBP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
    if (
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) {
        return { valid: true, detectedMime: 'image/webp', error: null };
    }

    // ISO Media / HEIC / AVIF containers: bytes 4-7 son 'ftyp'
    const ftypCheck = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (ftypCheck === 'ftyp') {
        const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
        if (brand.includes('avif') || brand.includes('avis')) {
            return { valid: true, detectedMime: 'image/avif', error: null };
        }
        if (brand.includes('heic') || brand.includes('heix') || brand.includes('mif1') || brand.includes('msf1')) {
            return { valid: true, detectedMime: 'image/heic', error: null };
        }
        // Compatibilidad genérica con contenedores fotográficos ftyp
        return { valid: true, detectedMime: declaredMime || 'image/heic', error: null };
    }

    return {
        valid: false,
        detectedMime: null,
        error: 'Formato de imagen no reconocido. Se admiten únicamente JPEG, PNG, WEBP, GIF, AVIF y HEIC.'
    };
}

/**
 * Limpia y normaliza el nombre del archivo para prevenir path traversal o caracteres inválidos.
 * @param {string} originalName 
 * @returns {string}
 */
export function sanitizeFilename(originalName) {
    if (!originalName || typeof originalName !== 'string') {
        return 'foto_' + Date.now() + '.jpg';
    }

    // Tomar solo el basename (eliminar paths)
    const base = originalName.split(/[\\/]/).pop() || 'foto';
    
    // Separar nombre y extensión
    const lastDotIndex = base.lastIndexOf('.');
    let namePart = lastDotIndex > 0 ? base.substring(0, lastDotIndex) : base;
    let extPart = lastDotIndex > 0 ? base.substring(lastDotIndex).toLowerCase() : '.jpg';

    // Limpiar caracteres extraños
    namePart = namePart
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Quitar tildes
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
        .substring(0, 80);

    if (!namePart) namePart = 'foto';

    // Normalizar extensión
    if (!['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.heic', '.heif'].includes(extPart)) {
        extPart = '.jpg';
    }

    return `${namePart}${extPart}`;
}

/**
 * Genera un token aleatorio seguro de 32 caracteres criptográficos en base64url.
 */
export function generateSecureToken() {
    const randomBytes = new Uint8Array(24);
    crypto.getRandomValues(randomBytes);
    let binary = '';
    for (let i = 0; i < randomBytes.length; i++) {
        binary += String.fromCharCode(randomBytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Convierte el nombre de un cliente en un slug seguro para nombres de carpetas en R2.
 */
export function slugifyClientName(name) {
    if (!name || typeof name !== 'string') return 'cliente';
    const slug = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
        .replace(/[^a-zA-Z0-9_\-\s]/g, '') // Caracteres alfanuméricos
        .trim()
        .replace(/\s+/g, '_')
        .toLowerCase()
        .substring(0, 50);
    return slug || 'cliente';
}
