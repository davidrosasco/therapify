## Therapify – Agenda y finanzas para psicólogos

Aplicación web minimalista para profesionales de la salud mental. Incluye:

- Sistema de usuarios con registro, login, sesión persistente y recuperación de contraseña básica.
- Gestión de pacientes, instituciones, tarifas y turnos.
- Dashboard con resumen financiero mensual (facturado, cobrado, pendiente, a pagar a instituciones y neto profesional).

### 1. Requisitos previos

- **Node.js** (versión 18+ recomendada) y **npm** instalados en Windows.
  - Puedes descargarlo desde `https://nodejs.org/` (elige la versión LTS).

### 2. Instalación de dependencias (solo backend)

1. Abre una terminal de Windows (PowerShell o Símbolo del sistema).
2. Ve a la carpeta del backend:

   ```bash
   cd "c:\Users\david\OneDrive\Escritorio\therapify\backend"
   ```

3. Instala las dependencias:

   ```bash
   npm install
   ```

   Esto instalará `express`, `better-sqlite3`, `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `cors`, `dotenv` y `nodemon`.

### 3. Configuración del entorno

En `backend` ya tienes un archivo `.env.example`. Para usarlo:

1. Copia el archivo:

   ```bash
   cd "c:\Users\david\OneDrive\Escritorio\therapify\backend"
   copy .env.example .env
   ```

2. Opcionalmente edita `.env` para ajustar:

   - `PORT=4000` (puerto del servidor).
   - `FRONTEND_ORIGIN=http://localhost:4000` (como el backend sirve el frontend estático, la misma URL es correcta).

La base de datos SQLite se creará automáticamente en `backend/data/therapify.db` al arrancar el servidor.

### 4. Arrancar la aplicación

1. En la carpeta `backend`, arranca el servidor:

   ```bash
   cd "c:\Users\david\OneDrive\Escritorio\therapify\backend"
   npm run start
   ```

   - Esto levanta la API y sirve el frontend estático.

2. Abre tu navegador y ve a:

   ```text
   http://localhost:4000
   ```

   Ahí verás la pantalla de **Therapify**.

### 5. Primeros pasos en la app

1. En la pantalla inicial, elige **Crear cuenta** y registra tu email y contraseña.
2. Una vez dentro:
   - Ajusta tus **tarifas** en el panel derecho.
   - Crea tus **instituciones** (la opción `Particular (0%)` ya existe y no se elimina).
   - Crea tus **pacientes** y completa su historia clínica.
   - Empieza a cargar **turnos**:
     - Selecciona paciente, fecha y hora.
     - Elige tarifa y modalidad (Particular o Institución).
     - Marca si está **Cobrado** o **Pendiente**.

El **dashboard** se actualiza automáticamente cuando:

- Cambias el mes en el selector.
- Creas/edits/eliminás un turno.
- Cambias estado de pago de un turno.
- Modificas una tarifa.
- Ajustas una institución (porcentaje de comisión).

### 6. Notas y extensiones futuras (V2)

La estructura actual ya permite agregar sin rediseñar todo:

- Recordatorios automáticos antes de los turnos.
- Exportación mensual en PDF.
- Reportes financieros avanzados y gráficos.
- Integración de cobros online.
- Roles multiusuario (admin, profesional, secretaria).

Si quieres que te ayude a implementar alguna de estas extensiones, indícamelo y lo añadimos paso a paso.

---

## Publicar la app (despliegue en la nube)

Para que otras personas (ej. las compañeras de tu esposa) puedan usar Therapify desde el celular o la PC sin instalar nada en tu computadora, tenés que **subirla a un servidor**. La app ya está preparada para eso.

### Opción A: Railway (recomendada, gratis al inicio)

1. Creá una cuenta en **https://railway.app** (con GitHub o email).
2. Instalá **Git** si no lo tenés (https://git-scm.com) y en la carpeta del proyecto ejecutá:
   ```bash
   git init
   git add .
   git commit -m "Therapify v1"
   ```
3. En Railway: **New Project** → **Deploy from GitHub repo** (conectá GitHub y elegí el repo donde subiste Therapify) o **Deploy with CLI**.
4. En el proyecto de Railway:
   - **Variables**: agregá `JWT_SECRET` y `COOKIE_SECRET` (textos largos y aleatorios). Opcional: `FRONTEND_ORIGIN` = la URL que te asigne Railway (ej. `https://therapify-production.up.railway.app`).
   - **Settings**: Root Directory dejalo vacío (raíz del repo). Build command: `cd backend && npm install`. Start command: `node backend/src/server.js`.
5. Railway te dará una URL (ej. `https://tu-app.up.railway.app`). Esa es la que compartís con las psicólogas.

### Opción B: Render

1. Cuenta en **https://render.com**.
2. **New** → **Web Service**, conectá el repo de GitHub.
3. **Root Directory**: vacío. **Build**: `cd backend && npm install`. **Start**: `node backend/src/server.js`.
4. En **Environment** agregá `JWT_SECRET` y `COOKIE_SECRET`.
5. Render asigna una URL tipo `https://therapify.onrender.com`.

### Importante al publicar

- La URL debe ser **HTTPS** (Railway y Render ya la dan así). Sin HTTPS la opción “Instalar” en el celular puede no aparecer.
- Cada usuario que entre debe **crear su propia cuenta** (email + contraseña). Los datos son por usuario.
- La base de datos SQLite en Railway/Render puede borrarse si el servicio reinicia (en planes gratis). Para uso serio después conviene pasar a una base en la nube (ej. PostgreSQL).

---

## Instalar en el celular o tablet (PWA)

Therapify es **PWA**: se puede instalar en la pantalla de inicio del celular o tablet y abrirla como una app, sin ir a la tienda.

1. Publicá la app (Railway o Render) y obtené la URL en **HTTPS**.
2. En el **celular o tablet**, abrí esa URL en **Chrome** (Android) o **Safari** (iPhone/iPad).
3. En Chrome: menú (⋮) → **“Instalar aplicación”** o **“Añadir a la pantalla de inicio”**.
4. En Safari (iPhone): botón **Compartir** → **“Añadir a la pantalla de inicio”**.

Después tendrás un icono “Therapify” en la pantalla de inicio; al tocarlo se abre la app a pantalla completa.

**Nota:** Los iconos por ahora son placeholders. Para un icono profesional, reemplazá en la carpeta `frontend` los archivos `icon-192.png` e `icon-512.png` por tus imágenes (192×192 y 512×512 píxeles).

---

## Llevar Therapify a Google Play (y en el futuro a App Store)

- **Google Play (Android):** Para publicar una “app” que en realidad es la web, Google permite usar una **PWA enlazada** (TWA – Trusted Web Activity): se crea un proyecto Android mínimo que solo abre tu URL en Chrome. Así la app aparece en Play Store y se instala como cualquier otra. Herramientas como **Bubblewrap** (Google) o **PWA Builder** (https://www.pwabuilder.com) ayudan a generar ese proyecto y el paquete para subir a Play Store.
- **App Store (iOS):** Apple no permite solo “envolver” una web; suelen pedir algo nativo o con contenido nativo. Más adelante se puede evaluar una app nativa o un híbrido (ej. Capacitor) que use la misma URL.

**Resumen:** Primero compartí la URL (despliegue) con las colegas para que la usen y dejen reseñas. Cuando quieras venderla y estar en tiendas, el siguiente paso es empaquetar la PWA para Google Play con TWA/PWA Builder; para iOS hace falta planear una versión que cumpla las reglas de Apple.

