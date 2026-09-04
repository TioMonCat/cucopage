// ==========================================================
// Lógica del Dashboard de Administración (admin.html)
// ==========================================================

document.addEventListener('DOMContentLoaded', () => {
    // Referencias DOM
    const loginModal = document.getElementById('login-modal');
    const loginForm = document.getElementById('login-form');
    const loginPassword = document.getElementById('login-password');
    const loginError = document.getElementById('login-error');
    const btnLogout = document.getElementById('btn-logout');

    const kpiLinksTotal = document.getElementById('kpi-links-total');
    const kpiLinksActive = document.getElementById('kpi-links-active');
    const kpiPhotosTotal = document.getElementById('kpi-photos-total');
    const kpiStorageTotal = document.getElementById('kpi-storage-total');

    const searchInput = document.getElementById('search-input');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const linksTableBody = document.getElementById('links-table-body');
    const tableLoading = document.getElementById('table-loading');
    const emptyState = document.getElementById('empty-state');

    // Modales
    const btnOpenCreate = document.getElementById('btn-open-create');
    const createModal = document.getElementById('create-modal');
    const createForm = document.getElementById('create-form');
    const inputMaxPhotos = document.getElementById('create-max-photos');
    const selectExpires = document.getElementById('create-expires');
    const inputClientName = document.getElementById('create-client-name');
    const inputNotes = document.getElementById('create-notes');
    const generatedBox = document.getElementById('generated-box');
    const generatedUrlInput = document.getElementById('generated-url');
    const btnCopyGenerated = document.getElementById('btn-copy-generated');

    const galleryModal = document.getElementById('gallery-modal');
    const galleryGrid = document.getElementById('gallery-grid');
    const galleryTitle = document.getElementById('gallery-title');
    const gallerySubtitle = document.getElementById('gallery-subtitle');
    const galleryEmpty = document.getElementById('gallery-empty');

    const logsModal = document.getElementById('logs-modal');
    const btnOpenLogs = document.getElementById('btn-open-logs');
    const logsTableBody = document.getElementById('logs-table-body');

    // Estado local
    let adminToken = sessionStorage.getItem('CUCO_ADMIN_TOKEN');
    let currentFilter = '';
    let currentSearch = '';
    let activeLinkIdForGallery = null;
    let searchDebounceTimeout = null;

    // Helper Toast
    function showToast(message, type = 'info') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 250);
        }, 3500);
    }

    // Formatear bytes a MB/GB
    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 MB';
        const mb = bytes / (1024 * 1024);
        if (mb < 1000) return `${mb.toFixed(1)} MB`;
        return `${(mb / 1024).toFixed(2)} GB`;
    }

    // Construir cabeceras con token de admin
    function getAuthHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`,
            'X-Admin-Token': adminToken
        };
    }

    // Obtener URL base de subida pública
    function getPublicUploadUrl(token) {
        const loc = window.location;
        let path = loc.pathname;
        if (path.endsWith('admin.html')) {
            path = path.replace('admin.html', 'upload.html');
        } else if (path.endsWith('/')) {
            path += 'upload.html';
        } else {
            const parts = path.split('/');
            parts.pop();
            path = parts.join('/') + '/upload.html';
        }
        return `${loc.origin}${path}?token=${token}`;
    }

    // 1. Manejo de Autenticación
    function checkAuth() {
        if (!adminToken) {
            loginModal.classList.add('active');
        } else {
            loginModal.classList.remove('active');
            loadDashboardData();
        }
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const secret = loginPassword.value.trim();
        loginError.style.display = 'none';

        if (!secret) return;

        try {
            const res = await fetch(`${AppConfig.API_BASE_URL}/api/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                adminToken = secret;
                sessionStorage.setItem('CUCO_ADMIN_TOKEN', secret);
                loginModal.classList.remove('active');
                loginPassword.value = '';
                showToast('¡Bienvenido de vuelta!', 'success');
                loadDashboardData();
            } else {
                loginError.textContent = data.error || 'Contraseña incorrecta';
                loginError.style.display = 'block';
            }
        } catch (err) {
            loginError.textContent = 'Error de conexión con el backend';
            loginError.style.display = 'block';
        }
    });

    btnLogout.addEventListener('click', () => {
        sessionStorage.removeItem('CUCO_ADMIN_TOKEN');
        adminToken = null;
        checkAuth();
    });

    // 2. Cargar Métricas y Lista de Links
    async function loadDashboardData() {
        loadMetrics();
        loadLinks();
    }

    async function loadMetrics() {
        try {
            const res = await fetch(`${AppConfig.API_BASE_URL}/api/admin/metrics`, {
                headers: getAuthHeaders()
            });

            if (res.status === 401) {
                sessionStorage.removeItem('CUCO_ADMIN_TOKEN');
                adminToken = null;
                checkAuth();
                return;
            }

            const data = await res.json();
            if (data.success) {
                const m = data.metrics;
                kpiLinksTotal.textContent = m.total_links || 0;
                kpiLinksActive.textContent = m.active_links || 0;
                kpiPhotosTotal.textContent = m.total_photos_uploaded || 0;
                kpiStorageTotal.textContent = formatBytes(m.total_storage_bytes);
            }
        } catch (err) {
            console.error('Error cargando métricas:', err);
        }
    }

    async function loadLinks() {
        tableLoading.style.display = 'block';
        emptyState.style.display = 'none';
        linksTableBody.innerHTML = '';

        const url = new URL(`${AppConfig.API_BASE_URL}/api/admin/links`);
        if (currentFilter) url.searchParams.set('status', currentFilter);
        if (currentSearch) url.searchParams.set('search', currentSearch);

        try {
            const res = await fetch(url.toString(), { headers: getAuthHeaders() });
            const data = await res.json();

            tableLoading.style.display = 'none';

            if (data.success) {
                if (!data.links || data.links.length === 0) {
                    emptyState.style.display = 'block';
                    return;
                }
                renderLinksTable(data.links);
            } else {
                showToast(data.error || 'Error al cargar enlaces', 'error');
            }
        } catch (err) {
            tableLoading.style.display = 'none';
            console.error('Error cargando enlaces:', err);
            showToast('Error de red al obtener enlaces', 'error');
        }
    }

    // 3. Renderizar Tabla de Enlaces
    function renderLinksTable(links) {
        linksTableBody.innerHTML = '';

        links.forEach(link => {
            const tr = document.createElement('tr');
            const percent = Math.min(100, Math.round((link.uploaded_count / link.max_photos) * 100));
            const publicUrl = getPublicUploadUrl(link.token);

            // Formatear expiración
            const expiresDate = new Date(link.expires_at.replace(' ', 'T') + 'Z');
            const formattedExpires = isNaN(expiresDate.getTime()) ? link.expires_at : expiresDate.toLocaleString();

            tr.innerHTML = `
                <td>
                    <div style="font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 0.45rem;">
                        <span style="font-size: 1.05rem;">📁</span>
                        <span>${link.client_name || 'Sin nombre'}</span>
                    </div>
                    <small style="color: var(--text-muted); font-size: 0.75rem; font-family: monospace; display: block; margin-top: 2px;">
                        uploads/${link.folder_name || link.token}
                    </small>
                </td>
                <td>
                    <div class="token-cell">
                        <span>${link.token.substring(0, 10)}...</span>
                        <button class="copy-btn" title="Copiar link de subida" data-url="${publicUrl}">
                            📋
                        </button>
                    </div>
                </td>
                <td>
                    <span class="badge badge-${link.status}">${link.status}</span>
                </td>
                <td>
                    <div>
                        <span style="font-weight: 600; color: var(--text-primary);">${link.uploaded_count}</span>
                        <span style="color: var(--text-muted);">/ ${link.max_photos} fotos</span>
                        <div class="mini-progress-wrap">
                            <div class="mini-progress-fill" style="width: ${percent}%;"></div>
                        </div>
                    </div>
                </td>
                <td>
                    <span style="font-size: 0.85rem;" title="${link.notes || 'Sin notas'}">
                        ${link.notes ? (link.notes.length > 20 ? link.notes.substring(0, 20) + '...' : link.notes) : '—'}
                    </span>
                </td>
                <td>
                    <div style="font-size: 0.85rem;">
                        <div>${formattedExpires}</div>
                        ${link.status === 'activo' && link.seconds_remaining > 0 
                            ? `<small style="color: var(--accent-cyan);">${Math.round(link.seconds_remaining / 3600)}h restantes</small>`
                            : ''}
                    </div>
                </td>
                <td>
                    <div class="table-actions">
                        <button class="icon-btn btn-view-photos" title="Ver fotos subidas" data-id="${link.id}" data-token="${link.token}" data-client="${link.client_name || ''}" data-folder="${link.folder_name || ''}">
                            🖼️
                        </button>
                        ${link.status === 'activo' ? `
                            <button class="icon-btn btn-revoke-link" title="Revocar enlace" data-id="${link.id}">
                                🚫
                            </button>
                        ` : ''}
                        <button class="icon-btn icon-btn-danger btn-delete-link" title="Eliminar enlace y fotos" data-id="${link.id}">
                            🗑️
                        </button>
                    </div>
                </td>
            `;

            linksTableBody.appendChild(tr);
        });

        // Eventos de botones en filas
        linksTableBody.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const url = btn.dataset.url;
                navigator.clipboard.writeText(url).then(() => {
                    showToast('Link de subida copiado al portapapeles', 'success');
                });
            });
        });

        linksTableBody.querySelectorAll('.btn-view-photos').forEach(btn => {
            btn.addEventListener('click', () => {
                openGalleryModal(btn.dataset.id, btn.dataset.token, btn.dataset.client, btn.dataset.folder);
            });
        });

        linksTableBody.querySelectorAll('.btn-revoke-link').forEach(btn => {
            btn.addEventListener('click', () => {
                revokeLink(btn.dataset.id);
            });
        });

        linksTableBody.querySelectorAll('.btn-delete-link').forEach(btn => {
            btn.addEventListener('click', () => {
                deleteLink(btn.dataset.id);
            });
        });
    }

    // 4. Filtros y Búsqueda
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.status;
            loadLinks();
        });
    });

    searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounceTimeout);
        searchDebounceTimeout = setTimeout(() => {
            currentSearch = searchInput.value.trim();
            loadLinks();
        }, 300);
    });

    // 5. Crear Nuevo Enlace
    btnOpenCreate.addEventListener('click', () => {
        generatedBox.style.display = 'none';
        if (inputClientName) inputClientName.value = '';
        inputNotes.value = '';
        inputMaxPhotos.value = '10';
        selectExpires.value = '24';
        createModal.classList.add('active');
        if (inputClientName) inputClientName.focus();
    });

    createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const clientName = inputClientName ? inputClientName.value.trim() : '';
        if (!clientName) {
            showToast('Por favor escribe el nombre de la persona o cliente', 'error');
            if (inputClientName) inputClientName.focus();
            return;
        }

        const maxPhotos = parseInt(inputMaxPhotos.value, 10) || 10;
        const expiresInHours = parseInt(selectExpires.value, 10) || 24;
        const notes = inputNotes.value.trim();

        try {
            const res = await fetch(`${AppConfig.API_BASE_URL}/api/admin/links`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    client_name: clientName,
                    max_photos: maxPhotos,
                    expires_in_hours: expiresInHours,
                    notes
                })
            });

            const data = await res.json();
            if (data.success && data.link) {
                const fullUrl = getPublicUploadUrl(data.link.token);
                generatedUrlInput.value = fullUrl;
                generatedBox.style.display = 'block';
                showToast(`¡Enlace y carpeta creada para "${clientName}"!`, 'success');
                loadDashboardData();
            } else {
                showToast(data.error || 'Error al generar enlace', 'error');
            }
        } catch (err) {
            showToast('Error de red al crear enlace', 'error');
        }
    });

    btnCopyGenerated.addEventListener('click', () => {
        navigator.clipboard.writeText(generatedUrlInput.value).then(() => {
            showToast('¡Enlace copiado al portapapeles!', 'success');
        });
    });

    // 6. Revocar y Eliminar Enlaces
    async function revokeLink(linkId) {
        if (!confirm('¿Deseas revocar este enlace? Nadie podrá subir más fotos con este token.')) return;

        try {
            const res = await fetch(`${AppConfig.API_BASE_URL}/api/admin/links/${linkId}/revoke`, {
                method: 'PATCH',
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                showToast('Enlace revocado', 'success');
                loadDashboardData();
            } else {
                showToast(data.error || 'Error al revocar', 'error');
            }
        } catch (err) {
            showToast('Error de conexión', 'error');
        }
    }

    async function deleteLink(linkId) {
        if (!confirm('ATENCIÓN: ¿Seguro que deseas eliminar este enlace y todas sus fotos en R2? Esta acción es irreversible.')) return;

        try {
            const res = await fetch(`${AppConfig.API_BASE_URL}/api/admin/links/${linkId}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                showToast('Enlace y fotos eliminados', 'success');
                loadDashboardData();
            } else {
                showToast(data.error || 'Error al eliminar', 'error');
            }
        } catch (err) {
            showToast('Error de conexión', 'error');
        }
    }

    // 7. Modal de Galería de Fotos
    async function openGalleryModal(linkId, token, clientName = '', folderName = '') {
        activeLinkIdForGallery = linkId;
        galleryTitle.textContent = clientName ? `Fotos de: ${clientName}` : 'Fotos del Enlace';
        gallerySubtitle.textContent = `📁 Carpeta: uploads/${folderName || token} (Token: ${token.substring(0, 8)}...)`;
        galleryGrid.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';
        galleryEmpty.style.display = 'none';
        galleryModal.classList.add('active');

        try {
            const res = await fetch(`${AppConfig.API_BASE_URL}/api/admin/links/${linkId}/photos`, {
                headers: getAuthHeaders()
            });
            const data = await res.json();

            if (data.success) {
                renderGallery(data.photos || []);
            } else {
                galleryGrid.innerHTML = `<p style="color: var(--danger); text-align:center;">${data.error}</p>`;
            }
        } catch (err) {
            galleryGrid.innerHTML = `<p style="color: var(--danger); text-align:center;">Error al cargar fotos</p>`;
        }
    }

    function renderGallery(photos) {
        galleryGrid.innerHTML = '';

        if (photos.length === 0) {
            galleryEmpty.style.display = 'block';
            return;
        }

        galleryEmpty.style.display = 'none';
        photos.forEach(photo => {
            const card = document.createElement('div');
            card.className = 'gallery-card';

            const viewUrl = `${AppConfig.API_BASE_URL}/api/photos/view?key=${encodeURIComponent(photo.r2_key)}&admin_token=${encodeURIComponent(adminToken)}`;
            const downloadUrl = `${AppConfig.API_BASE_URL}/api/photos/download?key=${encodeURIComponent(photo.r2_key)}&admin_token=${encodeURIComponent(adminToken)}`;

            card.innerHTML = `
                <div class="gallery-thumb-wrap" onclick="window.open('${viewUrl}', '_blank')">
                    <img src="${viewUrl}" class="gallery-thumb" alt="${photo.filename}" loading="lazy" />
                </div>
                <div class="gallery-card-actions">
                    <span title="${photo.filename}">${photo.filename.substring(0, 12)}...</span>
                    <div style="display: flex; gap: 0.25rem;">
                        <a href="${downloadUrl}" class="copy-btn" title="Descargar archivo" download>⬇️</a>
                        <button class="copy-btn btn-delete-single-photo" title="Eliminar foto" data-id="${photo.id}">🗑️</button>
                    </div>
                </div>
            `;

            const btnDel = card.querySelector('.btn-delete-single-photo');
            btnDel.addEventListener('click', () => {
                deleteSinglePhoto(photo.id);
            });

            galleryGrid.appendChild(card);
        });
    }

    async function deleteSinglePhoto(photoId) {
        if (!confirm('¿Deseas eliminar esta fotografía? Se liberará 1 lugar en el cupo.')) return;

        try {
            const res = await fetch(`${AppConfig.API_BASE_URL}/api/admin/photos/${photoId}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                showToast('Foto eliminada', 'success');
                if (activeLinkIdForGallery) {
                    openGalleryModal(activeLinkIdForGallery, '');
                }
                loadDashboardData();
            } else {
                showToast(data.error || 'Error al eliminar', 'error');
            }
        } catch (err) {
            showToast('Error de conexión', 'error');
        }
    }

    // 8. Modal de Logs de Auditoría
    btnOpenLogs.addEventListener('click', async () => {
        logsTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;"><div class="spinner" style="margin: 1rem auto;"></div></td></tr>';
        logsModal.classList.add('active');

        try {
            const res = await fetch(`${AppConfig.API_BASE_URL}/api/admin/logs?limit=50`, {
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                renderLogs(data.logs || []);
            } else {
                logsTableBody.innerHTML = `<tr><td colspan="5" style="color:var(--danger); text-align:center;">${data.error}</td></tr>`;
            }
        } catch (err) {
            logsTableBody.innerHTML = `<tr><td colspan="5" style="color:var(--danger); text-align:center;">Error de red</td></tr>`;
        }
    });

    function renderLogs(logs) {
        logsTableBody.innerHTML = '';
        if (logs.length === 0) {
            logsTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">Sin logs registrados</td></tr>';
            return;
        }

        logs.forEach(log => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-size:0.8rem; white-space:nowrap;">${log.created_at}</td>
                <td>
                    <span class="log-event-tag log-event-${log.event_type}">
                        ${log.event_type}
                    </span>
                </td>
                <td style="font-family:monospace; font-size:0.8rem;">
                    ${log.token ? log.token.substring(0, 10) + '...' : '—'}
                </td>
                <td style="font-size:0.85rem;">${log.details || ''}</td>
                <td style="font-size:0.8rem; color:var(--text-muted);">${log.ip_address || '—'}</td>
            `;
            logsTableBody.appendChild(tr);
        });
    }

    // 9. Cierre genérico de modales al pulsar la 'X' o fuera
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop') && !e.target.classList.contains('login-modal')) {
            e.target.classList.remove('active');
        }
    });

    // Iniciar verificación
    checkAuth();
});
