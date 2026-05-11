## Plan: Editar clientes, logo, y mejoras del proyecto

### 1. Editar cliente (nombre, contacto, notas)

En `src/routes/cliente.$id.tsx`, agregar un botón **"Editar"** (visible solo para el creador, no para invitados) junto al de eliminar. Abre un `Dialog` con los campos:
- Nombre *
- Contacto
- Notas
- Logo (ver punto 2)

Al guardar: `UPDATE` sobre `clients` y refrescar estado. La política RLS "Creator can update clients" ya permite esto.

### 2. Logo del cliente (subida + compresión agresiva)

**DB (migración):**
- Agregar columna `logo_path TEXT` a `public.clients`.

**Storage:**
- Reutilizar el bucket existente `project-media` con un prefijo `clients/{client_id}/logo.jpg`, o crear un nuevo bucket público `client-logos` (recomendado, para que el logo se vea sin signed URL en listas). Voy con **bucket público `client-logos`** + políticas: SELECT público; INSERT/UPDATE/DELETE solo al creador del cliente (validado vía path `{client_id}/...` y join a `clients.created_by`).

**Compresión:**
- Reutilizar `compressImage` de `src/lib/compress.ts`, pero con preset más agresivo para logos: máx 512px lado mayor, calidad 0.75, JPEG. Crear helper `compressLogo(blob)` en `src/lib/compress.ts`.
- Subida vía nuevo helper `uploadClientLogo(clientId, blob)` en `src/lib/storage.ts` que sube a `client-logos/{clientId}/logo.jpg` con `upsert: true`.

**UI:**
- En el diálogo de edición y en el de creación (`src/routes/clientes.tsx`): input file con preview circular, botón "Quitar logo".
- Mostrar el logo en:
  - Tarjeta de cliente (lista de `/clientes`) sustituyendo el ícono `Building2`.
  - Cabecera de `/cliente/$id`.
  - Opcional: avatar pequeño en tarjetas de proyecto que tengan `client_id`.

### 3. Ideas adicionales (a confirmar cuáles incluir)

Propuestas priorizadas, basadas en patrones que funcionan bien en apps de reportes de instalación / field service:

**Alto impacto, esfuerzo bajo-medio:**
- **a) Exportar reporte PDF de un proyecto** — botón "Generar reporte" que produce un PDF con portada (logo del cliente, nombre proyecto, ubicación, fechas) + entradas agrupadas por día con fotos, notas y timestamps. Ideal para enviar al cliente al cerrar la obra.
- **b) Compartir proyecto público por enlace** — ya existe `visibility: public`. Añadir botón "Copiar enlace" + página pública read-only (sin auth) para que el cliente vea avances en tiempo real.
- **c) Geolocalización de entradas** — guardar `lat/lng` opcional en cada entrada cuando se captura desde el móvil; mostrar mapa de la obra.
- **d) Etiquetas/categorías por entrada** (ej: "Antes", "Durante", "Después", "Incidencia", "Material") con filtros en la galería.
- **e) Búsqueda global** — buscar por texto en proyectos, entradas, clientes desde el header.
- **f) Dashboard inicial** — KPIs simples en `/`: nº de proyectos activos, entradas esta semana, último proyecto trabajado, gráfico de actividad por día.

**Medio impacto:**
- **g) Estados de proyecto más ricos** — pasar de `activo|finalizado` a `pendiente|en curso|pausado|finalizado|facturado` con kanban opcional.
- **h) Checklists / fases por proyecto** — plantillas reutilizables (ej: "Inspección → Instalación → Pruebas → Entrega").
- **i) Asignación de técnicos** — varios usuarios pueden colaborar en un mismo proyecto; ya hay tabla `user_roles`, faltaría `project_members`.
- **j) Comentarios en entradas** — hilo corto por entrada para discutir un detalle.
- **k) Modo offline / cola de subida** — capturar fotos sin internet y subir cuando vuelva; usa IndexedDB.

**Pulido / detalles:**
- **l) Atajos de teclado** (N nueva entrada, / buscar, etc.).
- **m) Notificaciones por email** cuando un técnico sube entradas a un proyecto que sigues.
- **n) Marca de agua opcional** en fotos exportadas (logo del cliente o del equipo).
- **o) PWA instalable** con ícono propio y splash.

Voy a preguntar cuáles quieres priorizar antes de implementar.

### Orden de implementación de esta tanda

1. Migración: columna `logo_path` + bucket `client-logos` con RLS.
2. Helpers `compressLogo` y `uploadClientLogo`.
3. Diálogo "Editar cliente" + integrar logo en crear/editar.
4. Mostrar logo en lista y detalle.
5. Preguntar al usuario qué features extras quiere de la lista (3).

### Detalles técnicos

- RLS del bucket `client-logos`:
  - `SELECT`: público (`true`).
  - `INSERT/UPDATE/DELETE`: `bucket_id = 'client-logos' AND EXISTS (SELECT 1 FROM clients WHERE id::text = (storage.foldername(name))[1] AND created_by = auth.uid()) AND NOT is_guest()`.
- Path: `{client_id}/logo.jpg`, `upsert: true` para sobreescribir.
- Compresión logo: `maxWidthOrHeight: 512`, `maxSizeMB: 0.15`, `initialQuality: 0.75`, output `image/jpeg`.
- Al eliminar cliente: borrar también `client-logos/{id}/logo.jpg` para no dejar huérfanos.
- URL pública: `${SUPABASE_URL}/storage/v1/object/public/client-logos/{id}/logo.jpg` — guardar solo el path en DB, construir URL en el cliente.
