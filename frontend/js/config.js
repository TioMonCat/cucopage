// ==========================================================
// Configuración Global de la Aplicación Frontend
// ==========================================================

const AppConfig = {
    /**
     * URL base de la API del Cloudflare Worker.
     * En desarrollo local apunta a http://localhost:8787
     * En producción, reemplaza con la URL de tu Worker desplegado en Cloudflare:
     * Ejemplo: 'https://photo-upload-worker.tu-usuario.workers.dev'
     */
    API_BASE_URL: (() => {
        // Permitir sobrescribir mediante localStorage para testing rápido sin recompilar
        const override = localStorage.getItem('CUCO_API_OVERRIDE');
        if (override) return override;

        const isLocal = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' || 
                        window.location.protocol === 'file:';
        
        return isLocal 
            ? 'http://localhost:8787' 
            : 'https://photo-upload-worker.jaminecraft844.workers.dev';
    })(),

    // Tamaño máximo por foto en Megabytes
    MAX_FILE_SIZE_MB: 25,

    // Formatos de imagen aceptados
    ACCEPTED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.avif'],
    ACCEPTED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif']
};

window.AppConfig = AppConfig;
