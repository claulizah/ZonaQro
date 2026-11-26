# ZonaQro

Directorio hiperlocal de negocios, cupones y eventos en Zibatá, Zakia, Juriquilla y El Refugio (Querétaro).

- `index.html`: todo el sitio (se publica con GitHub Pages desde `main`).
- `supabase.sql`: tablas, seguridad (RLS) y funciones de la base de datos.

## Puesta en marcha de la base de datos

1. En Supabase, abre SQL Editor, pega el contenido de `supabase.sql` y ejecútalo.
2. En Authentication, Users, crea tu usuario administradora (correo y contraseña, marcado como confirmado).
3. En Authentication, Sign In / Providers, desactiva "Allow new users to sign up".
4. Entra a `#admin` en el sitio para aprobar solicitudes.

Mientras no haya negocios aprobados en la base, el sitio muestra datos de ejemplo. Con el primer negocio aprobado cambia a datos reales.


## Actualización: horarios, fotos, web, opiniones

Vuelve a correr **todo** `supabase.sql` en Supabase (es idempotente). Agrega:
- horarios estructurados (filtro por día/hora y "Abierto ahora"),
- hasta 3 fotos por negocio (bucket `fotos`),
- pregunta de página web y prospectos mimx (solo con consentimiento),
- correo opcional y motivo de rechazo,
- opiniones moderadas (tabla `resenas`),
- columnas privadas: el público ya no puede leer correo, interés mimx ni WhatsApp de quien opina.


## Material para compartir

- **Imagen por zona** (`og/<zona>.png`, 1200 x 630; estilo editorial: crema, serifa y un solo verde). Se genera a mano con `node scripts/generar-og.js` (necesita Playwright) cuando cambie la lista de zonas o el diseño, y las imágenes se guardan en el repo.
- **Página por zona** (`/z/<zona>/`), la genera cada día `scripts/generar-paginas.js` junto con las páginas de negocios. Lleva la imagen de su zona para que se vea al pegar el enlace en WhatsApp o Facebook. Si la zona está activa (3 negocios con ficha completa) se indexa y lleva a sus negocios (`/?zona=<Zona>#directorio`); si no, lleva `noindex`, invita a registrar negocios y no presume cifras. Los botones conservan las etiquetas `utm_*` del enlace con el que llegaron.
- **Enlaces `?zona=`**: `https://zonaqro.com/?zona=Juriquilla` deja elegida esa zona (si no existe, se ignora).
- **Admin → Compartir**: por zona, un texto para vecinos y otro para negocios, listos para copiar (corto, gratuito, sin emojis), con el enlace de la zona y `utm_source=grupo&utm_medium=vecinal&utm_campaign=<ola>`. Revisa las reglas de cada grupo y publica una sola vez. Los textos son propuestos: edítalos en `index.html` (`textoVecinos` y `textoNegocios`) si quieres otro tono.
- **Compartir mi ficha**: en el enlace personal de edición, el negocio con ficha publicada ve un botón para mandarla por WhatsApp (o copiar el texto), con `utm_source=compartir&utm_medium=negocio`.
