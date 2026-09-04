// ==========================================================
// Servicio de Almacenamiento Cloudflare R2
// ==========================================================

/**
 * Guarda un archivo de foto en el bucket R2.
 */
export async function savePhotoToR2(bucket, key, body, mimeType, metadata = {}) {
    return await bucket.put(key, body, {
        httpMetadata: {
            contentType: mimeType,
            cacheControl: 'public, max-age=31536000, immutable'
        },
        customMetadata: metadata
    });
}

/**
 * Obtiene un objeto desde el bucket R2.
 */
export async function getPhotoFromR2(bucket, key) {
    return await bucket.get(key);
}

/**
 * Elimina una foto individual de R2.
 */
export async function deletePhotoFromR2(bucket, key) {
    return await bucket.delete(key);
}

/**
 * Elimina todos los objetos de una carpeta o prefijo en R2 (útil al borrar un enlace completo).
 */
export async function deleteFolderFromR2(bucket, prefix) {
    let truncated = true;
    let cursor = undefined;

    while (truncated) {
        const list = await bucket.list({ prefix, cursor });
        if (list.objects.length > 0) {
            const keys = list.objects.map(obj => obj.key);
            await bucket.delete(keys);
        }
        truncated = list.truncated;
        cursor = list.cursor;
    }
}
