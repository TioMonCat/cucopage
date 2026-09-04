# Sistema de Subida de Fotos con Links Temporales

Solución completa, moderna y serverless para la subida de fotografías de clientes mediante enlaces temporales con control de cuota (1 a 20 fotos), almacenamiento seguro en **Cloudflare R2**, base de datos SQLite en el Edge con **Cloudflare D1**, API serverless con **Cloudflare Workers** y frontend estático listo para **GitHub Pages**.

---

## 🏗️ Arquitectura del Sistema

```
[GitHub Pages / Frontend Estático]
  ├── index.html        (Portal de acceso directo con token)
  ├── upload.html       (Subida pública: validación, drag & drop, progreso)
  └── admin.html        (Dashboard privado: links, fotos, logs, métricas)
           │
           ▼ (HTTPS / REST API)
[Cloudflare Worker]
  ├── /api/validate         (Valida estado, tiempo y cupo del token)
  ├── /api/upload           (Verifica magic bytes y transmite foto)
  ├── /api/upload/complete  (Cierre manual de la entrega)
  ├── /api/admin/*          (CRUD de links, fotos, métricas y logs)
  └── /api/photos/*         (Streaming seguro y descarga)
       │              │
       ▼              ▼
[Cloudflare D1]   [Cloudflare R2]
(SQLite Edge DB)  (Bucket de Fotos)
```

---

## 📁 Estructura del Repositorio

```
CUCO/
├── frontend/                     # Sitio estático para GitHub Pages
│   ├── index.html                # Landing y entrada manual de token
│   ├── upload.html               # Vista de subida pública con token
│   ├── admin.html                # Panel de control de administración
│   ├── css/
│   │   ├── base.css              # Design system, temas y componentes
│   │   ├── upload.css            # Estilos de dropzone y cola de fotos
│   │   └── admin.css             # Estilos de tablas, KPIs y modales
│   └── js/
│       ├── config.js             # Configuración de URLs y límites
│       ├── upload.js             # Validación, arrastrar y soltar, subida por lotes
│       └── admin.js              # Autenticación, gestión de links, visor R2
│
├── worker/                       # Backend Cloudflare Worker
│   ├── wrangler.toml             # Configuración de recursos (D1, R2, CORS)
│   ├── package.json              # Dependencias y scripts de desarrollo
│   ├── schema.sql                # Esquema de tablas para D1 (links, photos, logs)
│   └── src/
│       ├── index.js              # Router principal y manejo de CORS
│       ├── routes/               # Manejadores de rutas (validate, upload, admin, photos)
│       ├── services/             # Lógica de D1, R2 y autenticación
│       └── utils/                # Magic numbers de imágenes y formateo HTTP
│
└── README.md                     # Documentación de instalación y uso
```

---

## 🚀 Guía de Instalación y Despliegue

### Requisitos Previos
- Cuenta gratuita en [Cloudflare](https://dash.cloudflare.com/).
- Node.js instalado (v18 o superior).

---

### Paso 1: Configurar el Backend (Cloudflare Worker)

1. Ingresa a la carpeta `worker`:
   ```bash
   cd worker
   npm install
   ```

2. Autentica Wrangler con tu cuenta de Cloudflare:
   ```bash
   npx wrangler login
   ```

3. **Crea el Bucket R2 para las fotos:**
   ```bash
   npx wrangler r2 bucket create photo-uploads
   ```

4. **Crea la Base de Datos D1:**
   ```bash
   npx wrangler d1 create photo-db
   ```
   *Copia el `database_id` que imprimirá en consola y pégalo en `worker/wrangler.toml` en el campo `database_id`.*

5. **Aplica el esquema SQL en la base de datos D1:**
   - Para desarrollo local:
     ```bash
     npm run db:init
     ```
   - Para la base de datos en producción de Cloudflare:
     ```bash
     npm run db:init:remote
     ```

6. **Configura la contraseña de Administrador:**
   Define la clave secreta para acceder al panel de administración:
   ```bash
   npx wrangler secret put ADMIN_SECRET
   ```
   *(Escribe la contraseña que prefieras cuando el prompt te lo solicite).*

7. **Probar el Worker en local:**
   ```bash
   npm run dev
   ```
   El backend iniciará en `http://localhost:8787`.

8. **Desplegar el Worker a Producción:**
   ```bash
   npm run deploy
   ```
   Wrangler te devolverá una URL similar a:
   `https://photo-upload-worker.<tu-subdominio>.workers.dev`

---

### Paso 2: Configurar y Probar el Frontend

1. Abre el archivo [frontend/js/config.js](frontend/js/config.js).
2. En la propiedad `API_BASE_URL`, coloca la URL de tu Worker en producción:
   ```javascript
   API_BASE_URL: 'https://photo-upload-worker.<tu-subdominio>.workers.dev'
   ```
   *(En local `localhost` detecta automáticamente el puerto `8787` sin necesidad de modificar nada).*

3. Abre `frontend/index.html` en tu navegador o levanta un servidor estático local para probarlo:
   ```bash
   npx serve frontend
   ```

---

### Paso 3: Desplegar en GitHub Pages

1. Sube este repositorio a GitHub.
2. En la configuración del repositorio en GitHub:
   - Ve a **Settings** > **Pages**.
   - En **Build and deployment** > **Source**, elige **Deploy from a branch**.
   - Selecciona tu rama `main` y en la carpeta elige `/` (o configura GitHub Actions para publicar el directorio `frontend/`).
   - Si publicas el repositorio completo, la web estará en `https://tu-usuario.github.io/tu-repo/frontend/index.html`.
   - Si creas un branch huérfano `gh-pages` con el contenido de `frontend/`, estará en `https://tu-usuario.github.io/tu-repo/`.

3. **CORS en el Worker**:
   En `worker/wrangler.toml`, puedes actualizar `CORS_ALLOWED_ORIGIN` con tu dominio de GitHub Pages:
   ```toml
   [vars]
   CORS_ALLOWED_ORIGIN = "https://tu-usuario.github.io"
   ```
   Luego vuelve a ejecutar `npm run deploy` en la carpeta `worker`.

---

## 🔒 Seguridad Implementada

1. **Tokens Criptográficos**: Generados con `crypto.getRandomValues()` de 24 bytes en formato base64url (entropía suficiente para evitar ataques de fuerza bruta).
2. **Validación de Magic Bytes**: Inspecciona los primeros bytes del archivo en el servidor para confirmar encabezados legítimos de formato (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WEBP, AVIF, HEIC), impidiendo la subida de scripts maliciosos.
3. **Consistencia Atómica de Cuota**: Incrementos controlados mediante transacciones en Cloudflare D1 que previenen condiciones de carrera.
4. **Validación de Tiempo Límite**: El Worker recalcula la expiración en cada solicitud con `datetime('now')`, haciendo imposible burlar la caducidad modificando la hora del cliente.
5. **Autenticación del Admin**: Todas las operaciones de creación de links, eliminación de fotos y lectura de logs requieren verificación contra `ADMIN_SECRET` mediante Bearer Token.

---

## 🛠️ Endpoints de la API

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/api/health` | Estado del servicio | Público |
| `GET` | `/api/validate?token=...` | Valida validez, tiempo y cupo del link | Público |
| `POST` | `/api/upload?token=...` | Sube una fotografía y descuenta cupo | Token |
| `POST` | `/api/upload/complete?token=...` | Cierra voluntariamente la entrega | Token |
| `GET` | `/api/photos/view?key=...` | Muestra una imagen desde R2 | Token o Admin |
| `GET` | `/api/photos/download?key=...` | Descarga una imagen como adjunto | Token o Admin |
| `POST` | `/api/admin/login` | Verifica la contraseña maestra de admin | Público |
| `GET` | `/api/admin/metrics` | Resumen de enlaces, fotos y almacenamiento | Admin |
| `GET` | `/api/admin/links` | Listado paginado y filtrable de links | Admin |
| `POST` | `/api/admin/links` | Genera un nuevo link (1-20 fotos, 12h-7d) | Admin |
| `PATCH`| `/api/admin/links/:id/revoke` | Invalida un link de inmediato | Admin |
| `DELETE`| `/api/admin/links/:id` | Elimina el link y sus fotos en R2 | Admin |
| `GET` | `/api/admin/links/:id/photos` | Lista fotos subidas en un link | Admin |
| `DELETE`| `/api/admin/photos/:id` | Elimina una foto y restituye 1 cupo | Admin |
| `GET` | `/api/admin/logs` | Consulta de eventos y trazabilidad | Admin |
