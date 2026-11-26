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


## Reclamar una ficha (negocios agregados por ZonaQro)

Las fichas "Agregado por ZonaQro" muestran **¿Es tu negocio? Reclámalo**. El dueño deja su WhatsApp (y, si quiere, su nombre) y acepta el aviso de privacidad; no se publica nada y la ficha no cambia.

1. **Admin → Reclamos** (también sale en "Hoy toca"): cada reclamo aparece como *Reclamo pendiente*, con dos botones de WhatsApp: **confirmar con el WhatsApp que ya está en la ficha** (lo más seguro) o escribir a quien reclama.
2. **Aprobar y verificar**: pide confirmación; marca la ficha como verificada (la palomita que ya existe) y deja el reclamo aprobado. Después ofrece **Enviar enlace de edición** al WhatsApp de quien reclamó. **Rechazar** guarda un motivo que solo ves tú.
3. Solo se puede reclamar una ficha aprobada, agregada por ZonaQro, que no sea de referencia y que aún no esté verificada. Límites: un reclamo pendiente por negocio y WhatsApp, 3 por WhatsApp al día y 20 por hora, más el campo escondido y los 2.5 s mínimos.

Base de datos: **sección 34** de `supabase.sql` (tabla `reclamos`; el público solo puede insertar, nunca leer). Si no se ha corrido, la ficha ofrece reclamar por WhatsApp con el nombre del negocio y el admin avisa que falta.
