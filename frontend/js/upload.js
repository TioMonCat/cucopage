// ==========================================================
// Lógica de la Página de Subida Pública (upload.html)
// ==========================================================

document.addEventListener('DOMContentLoaded', () => {
    // Referencias DOM
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const uploadContent = document.getElementById('upload-content');
    const successState = document.getElementById('success-state');

    const heroBadge = document.getElementById('hero-badge');
    const statRemaining = document.getElementById('stat-remaining');
    const statMax = document.getElementById('stat-max');
    const statUploaded = document.getElementById('stat-uploaded');
    const countdownTimer = document.getElementById('countdown-timer');

    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const queueSection = document.getElementById('queue-section');
    const queueGrid = document.getElementById('queue-grid');
    const queueCount = document.getElementById('queue-count');

    const btnUpload = document.getElementById('btn-upload');
    const btnClearQueue = document.getElementById('btn-clear-queue');
    const btnComplete = document.getElementById('btn-complete');

    // Estado local
    let currentToken = null;
    let linkData = null;
    let fileQueue = []; // Array de { id, file, status: 'ready'|'uploading'|'success'|'error', progress: 0 }
    let countdownInterval = null;
    let isUploading = false;

    // Toast helper
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container') || createToastContainer();
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 250);
        }, 3500);
    }

    function createToastContainer() {
        const c = document.createElement('div');
        c.id = 'toast-container';
        document.body.appendChild(c);
        return c;
    }

    // Formatear tamaño de archivo
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Iniciar Cuenta Regresiva
    function startCountdown(seconds) {
        if (countdownInterval) clearInterval(countdownInterval);
        let remaining = seconds;

        function update() {
            if (remaining <= 0) {
                clearInterval(countdownInterval);
                showErrorCard('Enlace Expirado', 'El tiempo límite para subir fotos ha concluido.', 'expired');
                return;
            }
            const hours = Math.floor(remaining / 3600);
            const minutes = Math.floor((remaining % 3600) / 60);
            const secs = remaining % 60;
            countdownTimer.textContent = `${hours}h ${minutes}m ${secs}s restantes`;
            remaining--;
        }

        update();
        countdownInterval = setInterval(update, 1000);
    }

    // Mostrar Estado de Error / Invalidez
    function showErrorCard(title, message, iconType = 'error') {
        loadingState.style.display = 'none';
        uploadContent.style.display = 'none';
        successState.style.display = 'none';
        errorState.style.display = 'block';

        document.getElementById('error-title').textContent = title;
        document.getElementById('error-desc').textContent = message;

        const iconEl = document.getElementById('error-icon');
        iconEl.className = `state-icon state-icon-${iconType}`;
        if (iconType === 'expired') {
            iconEl.innerHTML = '⏳';
        } else if (iconType === 'exhausted') {
            iconEl.innerHTML = '✅';
        } else {
            iconEl.innerHTML = '⚠️';
        }
    }

    // 1. Validar el token en la URL
    async function validateCurrentToken() {
        const params = new URLSearchParams(window.location.search);
        currentToken = params.get('token');

        if (!currentToken) {
            showErrorCard('Enlace Incompleto', 'No se ha detectado ningún token de subida. Por favor, accede mediante el link que te compartió el fotógrafo o administrador.');
            return;
        }

        try {
            const res = await fetch(`${AppConfig.API_BASE_URL}/api/validate?token=${encodeURIComponent(currentToken)}`);
            const data = await res.json();

            if (!res.ok || !data.valid) {
                if (data.status === 'expirado') {
                    showErrorCard('Enlace Expirado', 'Este enlace ha caducado por límite de tiempo (24h). Solicita un nuevo enlace para continuar.', 'expired');
                } else if (data.status === 'agotado') {
                    showErrorCard('Cupo Completado', `Ya se ha alcanzado el límite máximo de ${data.max_photos || ''} fotos subidas para este enlace.`, 'exhausted');
                } else if (data.status === 'revocado') {
                    showErrorCard('Enlace Revocado', 'Este enlace ha sido cancelado o revocado por el administrador.', 'error');
                } else {
                    showErrorCard('Enlace Inválido', data.message || 'El enlace no existe o es incorrecto.', 'error');
                }
                return;
            }

            // Enlace válido
            linkData = data;
            renderUploadUI();
        } catch (err) {
            console.error('Error al conectar con la API:', err);
            showErrorCard('Error de Conexión', 'No pudimos conectar con el servidor. Verifica tu conexión a internet o intenta más tarde.');
        }
    }

    // 2. Renderizar interfaz activa
    function renderUploadUI() {
        loadingState.style.display = 'none';
        errorState.style.display = 'none';
        uploadContent.style.display = 'block';

        statRemaining.textContent = linkData.remaining_photos;
        statMax.textContent = linkData.max_photos;
        statUploaded.textContent = linkData.uploaded_count;

        heroBadge.textContent = 'Activo';
        heroBadge.className = 'badge badge-activo';

        if (linkData.seconds_remaining > 0) {
            startCountdown(linkData.seconds_remaining);
        } else {
            countdownTimer.textContent = 'Tiempo por expirar';
        }

        if (linkData.client_name) {
            const subtitle = document.getElementById('upload-client-subtitle');
            if (subtitle) {
                subtitle.innerHTML = `Hola <strong style="color: var(--accent-cyan);">${linkData.client_name}</strong>, selecciona o arrastra las fotos que deseas enviar.`;
            }
            document.title = `Subida de Fotos — ${linkData.client_name}`;
        }

        updateQueueUI();
    }

    // 3. Manejo de Drag & Drop y Selección
    dropzone.addEventListener('click', () => {
        if (!isUploading) fileInput.click();
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isUploading) dropzone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
        });
    });

    dropzone.addEventListener('drop', (e) => {
        if (isUploading) return;
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFilesSelected(files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFilesSelected(e.target.files);
        fileInput.value = ''; // Reset para permitir volver a seleccionar el mismo archivo
    });

    // Procesar archivos seleccionados
    function handleFilesSelected(filesList) {
        if (!filesList || filesList.length === 0) return;

        const remainingQuota = linkData.remaining_photos - fileQueue.filter(item => item.status !== 'error').length;
        if (remainingQuota <= 0) {
            showToast(`Ya has alcanzado el cupo restante de ${linkData.remaining_photos} fotos.`, 'error');
            return;
        }

        let addedCount = 0;
        const maxBytes = AppConfig.MAX_FILE_SIZE_MB * 1024 * 1024;

        Array.from(filesList).forEach(file => {
            // Validar si es imagen
            const isImage = file.type.startsWith('image/') || 
                AppConfig.ACCEPTED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));

            if (!isImage) {
                showToast(`"${file.name}" no es una imagen válida.`, 'error');
                return;
            }

            if (file.size > maxBytes) {
                showToast(`"${file.name}" supera el límite de ${AppConfig.MAX_FILE_SIZE_MB}MB.`, 'error');
                return;
            }

            if (addedCount >= remainingQuota) {
                return;
            }

            // Evitar duplicados por nombre y tamaño exactos en la cola
            const duplicate = fileQueue.some(item => item.file.name === file.name && item.file.size === file.size);
            if (duplicate) return;

            fileQueue.push({
                id: 'file_' + Math.random().toString(36).substring(2, 9),
                file: file,
                status: 'ready',
                progress: 0,
                thumbUrl: URL.createObjectURL(file)
            });

            addedCount++;
        });

        if (filesList.length > addedCount && addedCount === remainingQuota) {
            showToast(`Solo se agregaron ${addedCount} fotos para no superar el cupo disponible.`, 'info');
        }

        updateQueueUI();
    }

    // Actualizar Renderizado de la Cola de Subida
    function updateQueueUI() {
        const readyItems = fileQueue.filter(i => i.status === 'ready' || i.status === 'uploading');
        queueCount.textContent = `(${fileQueue.length} ${fileQueue.length === 1 ? 'foto' : 'fotos'})`;

        if (fileQueue.length === 0) {
            queueSection.style.display = 'none';
            btnUpload.disabled = true;
            btnClearQueue.disabled = true;
            return;
        }

        queueSection.style.display = 'block';
        btnUpload.disabled = isUploading || readyItems.length === 0;
        btnClearQueue.disabled = isUploading;

        queueGrid.innerHTML = '';
        fileQueue.forEach(item => {
            const card = document.createElement('div');
            card.className = `photo-card ${item.status === 'success' ? 'uploaded' : ''}`;
            card.id = item.id;

            let badgeHtml = '';
            if (item.status === 'ready') badgeHtml = '<span class="photo-badge-status photo-badge-ready">Pendiente</span>';
            if (item.status === 'uploading') badgeHtml = '<span class="photo-badge-status photo-badge-uploading">Subiendo...</span>';
            if (item.status === 'success') badgeHtml = '<span class="photo-badge-status photo-badge-success">✓ Subida</span>';
            if (item.status === 'error') badgeHtml = '<span class="photo-badge-status photo-badge-error">Error</span>';

            card.innerHTML = `
                <div class="photo-thumb-wrap">
                    <img src="${item.thumbUrl}" class="photo-thumb" alt="${item.file.name}" />
                    ${badgeHtml}
                    ${item.status === 'ready' && !isUploading ? `
                        <button class="photo-remove-btn" title="Quitar de la lista" data-id="${item.id}">✕</button>
                    ` : ''}
                    <div class="photo-progress-bar">
                        <div class="photo-progress-fill" style="width: ${item.progress}%"></div>
                    </div>
                </div>
                <div class="photo-info">
                    <div class="photo-name" title="${item.file.name}">${item.file.name}</div>
                    <div class="photo-meta">
                        <span>${formatBytes(item.file.size)}</span>
                        <span class="status-text">${item.status === 'uploading' ? item.progress + '%' : ''}</span>
                    </div>
                </div>
            `;

            const removeBtn = card.querySelector('.photo-remove-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    fileQueue = fileQueue.filter(q => q.id !== item.id);
                    URL.revokeObjectURL(item.thumbUrl);
                    updateQueueUI();
                });
            }

            queueGrid.appendChild(card);
        });
    }

    // Botón Limpiar Cola
    btnClearQueue.addEventListener('click', () => {
        if (isUploading) return;
        fileQueue.forEach(item => URL.revokeObjectURL(item.thumbUrl));
        fileQueue = [];
        updateQueueUI();
    });

    // 4. Subida secuencial de fotos
    btnUpload.addEventListener('click', async () => {
        const pendingItems = fileQueue.filter(i => i.status === 'ready');
        if (pendingItems.length === 0 || isUploading) return;

        isUploading = true;
        btnUpload.disabled = true;
        btnClearQueue.disabled = true;
        btnUpload.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div> Subiendo...';

        let successCount = 0;

        for (const item of pendingItems) {
            item.status = 'uploading';
            updateQueueUI();

            try {
                const uploadResult = await uploadSingleFile(item);
                if (uploadResult.success) {
                    item.status = 'success';
                    item.progress = 100;
                    successCount++;
                    linkData.uploaded_count = uploadResult.uploaded_count;
                    linkData.remaining_photos = uploadResult.remaining_photos;

                    statUploaded.textContent = linkData.uploaded_count;
                    statRemaining.textContent = linkData.remaining_photos;

                    if (uploadResult.is_exhausted) {
                        linkData.status = 'agotado';
                    }
                } else {
                    item.status = 'error';
                    showToast(`Error al subir ${item.file.name}: ${uploadResult.error || 'Fallo desconocido'}`, 'error');
                }
            } catch (err) {
                console.error('Error subiendo archivo:', err);
                item.status = 'error';
                showToast(`Error de conexión al subir ${item.file.name}`, 'error');
            }

            updateQueueUI();

            // Si el cupo se agotó durante la subida, detener
            if (linkData.remaining_photos <= 0) {
                break;
            }
        }

        isUploading = false;
        btnUpload.innerHTML = 'Subir Fotos';
        updateQueueUI();

        if (successCount > 0) {
            showToast(`¡${successCount} ${successCount === 1 ? 'foto subida' : 'fotos subidas'} con éxito!`, 'success');
        }

        if (linkData.remaining_photos <= 0) {
            showExhaustedScreen();
        }
    });

    // Subir un archivo mediante FormData y XMLHttpRequest para tracking de progreso
    function uploadSingleFile(item) {
        return new Promise((resolve) => {
            const formData = new FormData();
            formData.append('photo', item.file);

            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${AppConfig.API_BASE_URL}/api/upload?token=${encodeURIComponent(currentToken)}`);

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    item.progress = percent;
                    const cardEl = document.getElementById(item.id);
                    if (cardEl) {
                        const fill = cardEl.querySelector('.photo-progress-fill');
                        const statusTxt = cardEl.querySelector('.status-text');
                        if (fill) fill.style.width = percent + '%';
                        if (statusTxt) statusTxt.textContent = percent + '%';
                    }
                }
            });

            xhr.addEventListener('load', () => {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (xhr.status >= 200 && xhr.status < 300 && response.success) {
                        resolve(response);
                    } else {
                        resolve({ success: false, error: response.error || 'Error al procesar la foto en el servidor' });
                    }
                } catch (e) {
                    resolve({ success: false, error: 'Respuesta inválida del servidor' });
                }
            });

            xhr.addEventListener('error', () => {
                resolve({ success: false, error: 'Error de red en la subida' });
            });

            xhr.send(formData);
        });
    }

    // 5. Botón Finalizar Entrega Manualmente
    btnComplete.addEventListener('click', async () => {
        if (!confirm('¿Deseas dar por terminada la entrega de fotos? Esta acción cerrará el enlace.')) {
            return;
        }

        try {
            const res = await fetch(`${AppConfig.API_BASE_URL}/api/upload/complete?token=${encodeURIComponent(currentToken)}`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                showExhaustedScreen(data.message);
            } else {
                showToast(data.error || 'No se pudo finalizar la entrega', 'error');
            }
        } catch (err) {
            showToast('Error de conexión', 'error');
        }
    });

    function showExhaustedScreen(customMsg = null) {
        uploadContent.style.display = 'none';
        successState.style.display = 'block';
        if (customMsg) {
            document.getElementById('success-desc').textContent = customMsg;
        }
    }

    // Iniciar validación
    validateCurrentToken();
});
