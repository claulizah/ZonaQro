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


## Reclutamiento de negocios (admin → Reclutamiento)

Flujo para invitar negocios que todavía no se registran:

1. **Agregar prospecto**: negocio, WhatsApp (10 dígitos; acepta +52, espacios y guiones), zona, ola o campaña (opcional; si va vacía se usa `rec-<zona>`) y nota.
2. **Mensaje listo**: el botón abre WhatsApp con un mensaje corto (ZonaQro es gratis, sin compromiso, con enlace y salida fácil: "dímelo y no te vuelvo a escribir"). El enlace lleva `utm_source=whatsapp&utm_medium=reclutar&utm_campaign=<ola>`, así que en **Métricas → Campañas** se ve cuántos entraron y se registraron por ola. Si el WhatsApp ya tiene ficha aprobada en ZonaQro, el mensaje enlaza a esa ficha.
3. **Seguimiento**: nuevo → contactado (al abrir WhatsApp, con fecha) → respondió / registrado / no le interesa. A los **5 días** sin respuesta sale **un solo** recordatorio; después ya no se insiste. "No le interesa" deja al prospecto marcado para no volver a escribirle. Si ya se escribió a 10 prospectos en un día, el admin sugiere pausar.

Base de datos: **sección 33** de `supabase.sql` (tabla `prospectos`, solo la administradora). Si no se ha corrido, la pestaña lo avisa. Son números de terceros: úsalos solo para esta invitación y borra a quien lo pida (retención y aviso: por confirmar con revisión legal).


## Página para negocios (`#negocios`)

Es la página a la que apuntan los anuncios y los mensajes de reclutamiento. Muestra el título "Aparece gratis en ZonaQro", tres beneficios en tres líneas, un **ejemplo de ficha** (negocio inventado, marcado como ejemplo y sin enlaces), el **registro corto**, "Qué te llevas", "Cómo funciona" y preguntas frecuentes. No habla de mimx ni de precios (lo cubre una prueba).

- **Registro corto**: nombre, WhatsApp, zona, categoría y cómo atiende (local, a domicilio o desde casa). Crea una solicitud *pendiente* con lo mínimo; después se completan horario y fotos con el enlace personal (admin → Pedir datos). Usa el mismo filtro anti-spam (campo escondido y 2.5 s mínimo) y los mismos límites de la base (SQL 29). No requiere SQL nuevo.
- **Formulario completo**: sigue en `#registrar` (hay un enlace desde la página).
- **Medición por ola**: el enlace puede traer `?utm_source=…&utm_medium=…&utm_campaign=…`. El sitio guarda la etiqueta 7 días (primer contacto gana) y la manda al registrar, ya sea con el formulario corto o con el completo; se ve en **Métricas → Campañas**. **Límites de las etiquetas**: fuente 20 letras, medio 12 y campaña 24 (minúsculas, números, guion y guion bajo); si te pasas, el sitio las recorta (por eso se usa `utm_medium=reclutar`).
