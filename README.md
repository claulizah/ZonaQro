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
