-- ZonaQro: base de datos en Supabase
-- Pégalo completo en Supabase > SQL Editor > New query > Run. Se puede correr más de una vez.

-- 1) Quién es administradora (cambia el correo si usas otro)
create or replace function public.es_admin()
returns boolean
language sql stable
as $$ select coalesce(auth.jwt() ->> 'email', '') = 'claudia.achd@gmail.com' $$;

-- 2) Negocios
create table if not exists public.negocios (
  id            text primary key,
  nombre        text not null check (char_length(nombre) between 2 and 80),
  categoria     text not null check (categoria in ('gastronomia','hogar','salud','belleza','mascotas','educacion','autos','tienda')),
  tipo          text not null check (tipo in ('local','domicilio','emprendimiento')),
  zonas         text[] not null check (cardinality(zonas) between 1 and 4 and zonas <@ array['Zibatá','Zakia','Juriquilla','El Refugio']),
  descripcion   text not null default '' check (char_length(descripcion) <= 300),
  whatsapp      text not null check (whatsapp ~ '^[0-9]{10}$'),
  direccion     text not null default '' check (char_length(direccion) <= 160),
  horario       text not null default '' check (char_length(horario) <= 160),
  entrega       text not null default '' check (char_length(entrega) <= 200),
  redes         text not null default '' check (char_length(redes) <= 80),
  envio         text not null default '' check (char_length(envio) <= 60),
  promocionado  boolean not null default false,
  clics         integer not null default 0,
  cupones       jsonb not null default '[]'::jsonb,
  catalogo      jsonb not null default '[]'::jsonb,
  estado        text not null default 'pendiente' check (estado in ('pendiente','aprobado','rechazado','oculto')),
  alta          date,
  created_at    timestamptz not null default now()
);

-- 2b) Columnas nuevas de negocios: horarios, fotos, página web, correo y motivo de rechazo
alter table public.negocios add column if not exists horarios jsonb not null default '{}'::jsonb check (jsonb_typeof(horarios) = 'object');
alter table public.negocios add column if not exists fotos jsonb not null default '[]'::jsonb check (jsonb_typeof(fotos) = 'array' and jsonb_array_length(fotos) <= 3);
alter table public.negocios add column if not exists tiene_web text not null default '' check (tiene_web in ('', 'no', 'redes', 'si'));
alter table public.negocios add column if not exists sitio_web text not null default '' check (char_length(sitio_web) <= 160 and sitio_web ~* '^(https?://[^[:space:]]+)?$');
alter table public.negocios add column if not exists interes_mimx boolean not null default false;
alter table public.negocios add column if not exists email text not null default '' check (char_length(email) <= 120);
alter table public.negocios add column if not exists motivo_rechazo text not null default '' check (char_length(motivo_rechazo) <= 200);
alter table public.negocios add column if not exists origen text not null default 'registro' check (origen in ('registro', 'zonaqro'));
alter table public.negocios add column if not exists verificado boolean not null default false;

-- 3) Eventos
create table if not exists public.eventos (
  id            text primary key,
  titulo        text not null check (char_length(titulo) between 2 and 100),
  tipo          text not null check (tipo in ('concierto','bazar','feria','clase','comunidad')),
  zona          text not null check (zona in ('Zibatá','Zakia','Juriquilla','El Refugio')),
  lugar         text not null check (char_length(lugar) between 2 and 160),
  fecha         date not null,
  hora          text not null check (char_length(hora) <= 40),
  precio        text not null default 'Por confirmar' check (char_length(precio) <= 60),
  organizador   text not null default '' check (char_length(organizador) <= 80),
  whatsapp      text not null check (whatsapp ~ '^[0-9]{10}$'),
  descripcion   text not null default '' check (char_length(descripcion) <= 300),
  destacado     boolean not null default false,
  mimx          boolean not null default false,
  estado        text not null default 'pendiente' check (estado in ('pendiente','aprobado','rechazado','oculto')),
  created_at    timestamptz not null default now()
);

-- 4) Seguridad: el público solo lee lo aprobado y solo puede mandar solicitudes pendientes
alter table public.negocios enable row level security;
alter table public.eventos  enable row level security;

drop policy if exists "publico lee negocios aprobados" on public.negocios;
create policy "publico lee negocios aprobados" on public.negocios
  for select using (estado = 'aprobado');

drop policy if exists "publico envia negocio" on public.negocios;
create policy "publico envia negocio" on public.negocios
  for insert with check (estado = 'pendiente' and promocionado = false and clics = 0
                         and cupones = '[]'::jsonb and catalogo = '[]'::jsonb and motivo_rechazo = ''
                         and origen = 'registro' and verificado = false);

drop policy if exists "admin negocios" on public.negocios;
create policy "admin negocios" on public.negocios
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists "publico lee eventos aprobados" on public.eventos;
create policy "publico lee eventos aprobados" on public.eventos
  for select using (estado = 'aprobado');

drop policy if exists "publico envia evento" on public.eventos;
create policy "publico envia evento" on public.eventos
  for insert with check (estado = 'pendiente' and destacado = false);

drop policy if exists "admin eventos" on public.eventos;
create policy "admin eventos" on public.eventos
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- 5) Contador de clics a WhatsApp (el público solo puede sumar 1 a negocios aprobados)
create or replace function public.registrar_clic(nid text)
returns void
language sql
security definer
set search_path = public
as $$ update public.negocios set clics = clics + 1 where id = nid and estado = 'aprobado' $$;

grant execute on function public.registrar_clic(text) to anon, authenticated;

-- 6) Opiniones de vecinos (se publican solo después de que las apruebas)
create table if not exists public.resenas (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  text not null references public.negocios(id) on delete cascade,
  nombre      text not null check (char_length(nombre) between 2 and 40),
  estrellas   integer not null check (estrellas between 1 and 5),
  texto       text not null check (char_length(texto) between 10 and 300),
  contacto    text not null check (contacto ~ '^[0-9]{10}$'),
  respuesta   text not null default '' check (char_length(respuesta) <= 300),
  reportada   boolean not null default false,
  estado      text not null default 'pendiente' check (estado in ('pendiente','aprobado','rechazado','oculto')),
  created_at  timestamptz not null default now()
);
-- una sola opinión por número de WhatsApp y negocio
create unique index if not exists resenas_uno_por_numero on public.resenas (negocio_id, contacto);

alter table public.resenas enable row level security;

drop policy if exists "publico lee opiniones aprobadas" on public.resenas;
create policy "publico lee opiniones aprobadas" on public.resenas
  for select using (estado = 'aprobado');

drop policy if exists "publico envia opinion" on public.resenas;
create policy "publico envia opinion" on public.resenas
  for insert with check (estado = 'pendiente' and respuesta = '' and reportada = false
    and exists (select 1 from public.negocios n where n.id = negocio_id and n.estado = 'aprobado'));

drop policy if exists "admin opiniones" on public.resenas;
create policy "admin opiniones" on public.resenas
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

create or replace function public.reportar_resena(rid uuid)
returns void
language sql
security definer
set search_path = public
as $$ update public.resenas set reportada = true where id = rid and estado = 'aprobado' $$;
grant execute on function public.reportar_resena(uuid) to anon, authenticated;

-- 7) Privacidad: el público NO puede leer correo, WhatsApp de quien opina, interés en mimx, etc.
--    Solo estas columnas son públicas. Si agregas una columna pública nueva, agrégala aquí.
revoke select on public.negocios from anon;
grant select (id, nombre, categoria, tipo, zonas, descripcion, whatsapp, direccion, horario, horarios,
              entrega, redes, envio, promocionado, alta, clics, cupones, catalogo, fotos, sitio_web, origen, verificado, estado)
  on public.negocios to anon;
revoke select on public.resenas from anon;
grant select (id, negocio_id, nombre, estrellas, texto, respuesta, estado, created_at)
  on public.resenas to anon;

-- 8) Fotos de los negocios (bucket público, solo JPEG de hasta 600 KB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 600000, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 600000, allowed_mime_types = array['image/jpeg'];

drop policy if exists "publico sube fotos" on storage.objects;
create policy "publico sube fotos" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'fotos');

drop policy if exists "admin gestiona fotos" on storage.objects;
create policy "admin gestiona fotos" on storage.objects
  for all to authenticated using (bucket_id = 'fotos' and public.es_admin()) with check (bucket_id = 'fotos' and public.es_admin());

-- 9) Eventos: enlace a la fuente (para eventos sugeridos y aprobados desde el admin)
alter table public.eventos add column if not exists fuente text not null default ''
  check (char_length(fuente) <= 200 and fuente ~* '^(https?://[^[:space:]]+)?$');

-- 10) Métricas propias: conteos anónimos por día (sin IP ni datos personales)
create table if not exists public.metricas (
  dia  date not null default current_date,
  tipo text not null check (tipo in ('visita','vista','wa','web','cupon','evento_wa','evento_link','zona','cat','compartir')),
  ref  text not null default '' check (char_length(ref) <= 60),
  n    integer not null default 0,
  primary key (dia, tipo, ref)
);
alter table public.metricas enable row level security;
drop policy if exists "admin lee metricas" on public.metricas;
create policy "admin lee metricas" on public.metricas for select to authenticated using (public.es_admin());
create or replace function public.registrar_evento(p_tipo text, p_ref text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_tipo not in ('visita','vista','wa','web','cupon','evento_wa','evento_link','zona','cat','compartir') then return; end if;
  insert into public.metricas (dia, tipo, ref, n) values (current_date, p_tipo, left(coalesce(p_ref, ''), 60), 1)
  on conflict (dia, tipo, ref) do update set n = public.metricas.n + 1;
end $$;
revoke all on function public.registrar_evento(text, text) from public;
grant execute on function public.registrar_evento(text, text) to anon, authenticated;

-- 11) Lugares de referencia: fichas sin WhatsApp, solo para que el directorio se vea poblado al inicio
alter table public.negocios add column if not exists referencia boolean not null default false;
do $$ declare r record; begin
  for r in select conname from pg_constraint
           where conrelid = 'public.negocios'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%whatsapp%~%'
  loop execute format('alter table public.negocios drop constraint %I', r.conname); end loop;
end $$;
alter table public.negocios add constraint negocios_whatsapp_ok
  check (whatsapp ~ '^[0-9]{10}$' or (referencia and whatsapp = ''));
grant select (referencia) on public.negocios to anon;
drop policy if exists "publico envia negocio" on public.negocios;
create policy "publico envia negocio" on public.negocios
  for insert with check (estado = 'pendiente' and promocionado = false and clics = 0
                         and cupones = '[]'::jsonb and catalogo = '[]'::jsonb and motivo_rechazo = ''
                         and origen = 'registro' and verificado = false and referencia = false);

-- 12) Eventos también en la Ciudad de Querétaro y Tequisquiapan
do $$ declare r record; begin
  for r in select conname from pg_constraint
           where conrelid = 'public.eventos'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%zona%'
  loop execute format('alter table public.eventos drop constraint %I', r.conname); end loop;
end $$;
alter table public.eventos add constraint eventos_zona_check
  check (zona in ('Zibatá','Zakia','Juriquilla','El Refugio','Ciudad de Querétaro','Tequisquiapan'));

-- 13) Nueva categoría: Fiestas y eventos (mesas de dulces, mobiliario, DJ, fotografía)
do $$ declare r record; begin
  for r in select conname from pg_constraint
           where conrelid = 'public.negocios'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%gastronomia%'
  loop execute format('alter table public.negocios drop constraint %I', r.conname); end loop;
end $$;
alter table public.negocios add constraint negocios_categoria_check
  check (categoria in ('gastronomia','hogar','salud','belleza','mascotas','educacion','autos','tienda','fiestas'));

-- 14) Métricas de formularios: cuántos abren, empiezan y envían el registro de negocio y de evento
do $$ declare r record; begin
  for r in select conname from pg_constraint
           where conrelid = 'public.metricas'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%compartir%'
  loop execute format('alter table public.metricas drop constraint %I', r.conname); end loop;
end $$;
alter table public.metricas add constraint metricas_tipo_check
  check (tipo in ('visita','vista','wa','web','cupon','evento_wa','evento_link','zona','cat','compartir','registro_vista','registro_inicio','registro_envio','evento_vista','evento_inicio','evento_envio','otro_envio'));
create or replace function public.registrar_evento(p_tipo text, p_ref text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_tipo not in ('visita','vista','wa','web','cupon','evento_wa','evento_link','zona','cat','compartir','registro_vista','registro_inicio','registro_envio','evento_vista','evento_inicio','evento_envio','otro_envio') then return; end if;
  insert into public.metricas (dia, tipo, ref, n) values (current_date, p_tipo, left(coalesce(p_ref, ''), 60), 1)
  on conflict (dia, tipo, ref) do update set n = public.metricas.n + 1;
end $$;
revoke all on function public.registrar_evento(text, text) from public;
grant execute on function public.registrar_evento(text, text) to anon, authenticated;

-- 15) Nueva categoría: Servicios profesionales (marketing, diseño, contabilidad, consultoría)
do $$ declare r record; begin
  for r in select conname from pg_constraint
           where conrelid = 'public.negocios'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%gastronomia%'
  loop execute format('alter table public.negocios drop constraint %I', r.conname); end loop;
end $$;
alter table public.negocios add constraint negocios_categoria_check
  check (categoria in ('gastronomia','hogar','salud','belleza','mascotas','educacion','autos','tienda','fiestas','profesional'));

-- Reasignar a quien ya se registró en otra categoría (ajusta el nombre si hace falta):
-- update public.negocios set categoria = 'profesional' where nombre ilike '%caffeine%';


-- 16) Seguimiento de negocios (solo lo ve la administradora; el público no puede leer estas columnas)
alter table public.negocios add column if not exists ultimo_contacto date;
alter table public.negocios add column if not exists ultimo_reporte date;
alter table public.negocios add column if not exists notas text not null default '' check (char_length(notas) <= 500);


-- 17) Nuevas categorías: tecnología, deporte, transporte, cuidado, construcción y foto/video
do $$ declare r record; begin
  for r in select conname from pg_constraint
           where conrelid = 'public.negocios'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%gastronomia%'
  loop execute format('alter table public.negocios drop constraint %I', r.conname); end loop;
end $$;
alter table public.negocios add constraint negocios_categoria_check
  check (categoria in ('gastronomia','hogar','salud','belleza','mascotas','educacion','autos','tienda','fiestas','profesional',
                       'tecnologia','deporte','transporte','cuidado','construccion','foto'));


-- 18) Cuántas veces se le ha pedido a un negocio que complete su ficha (para el recordatorio, una sola vez)
alter table public.negocios add column if not exists pedidos_ficha smallint not null default 0;

-- 19) Enlace personal para que cada negocio edite su propia ficha (sin contraseña)
--     La llave vive en negocios.token_edicion. El público NO puede leer esa columna (no está en el grant de la sección 7).
alter table public.negocios add column if not exists token_edicion text unique
  default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

-- Historial de cambios hechos por los negocios (para revisarlos o revertirlos desde el admin)
create table if not exists public.ediciones (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  text not null references public.negocios(id) on delete cascade,
  antes       jsonb not null default '{}'::jsonb,
  despues     jsonb not null default '{}'::jsonb,
  revisada    boolean not null default false,
  revertida   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists ediciones_negocio_idx on public.ediciones (negocio_id, created_at desc);
alter table public.ediciones enable row level security;
drop policy if exists "admin ediciones" on public.ediciones;
create policy "admin ediciones" on public.ediciones for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- Lo que ve el negocio al abrir su enlace
create or replace function public.ficha_por_token(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n public.negocios;
begin
  if p_token is null or char_length(p_token) < 20 then return null; end if;
  select * into n from public.negocios where token_edicion = p_token and estado <> 'rechazado';
  if not found then return null; end if;
  return jsonb_build_object(
    'id', n.id, 'nombre', n.nombre, 'tipo', n.tipo, 'categoria', n.categoria, 'estado', n.estado,
    'descripcion', n.descripcion, 'direccion', n.direccion, 'horario', n.horario, 'horarios', n.horarios,
    'redes', n.redes, 'entrega', n.entrega, 'sitio_web', n.sitio_web, 'fotos', n.fotos,
    'resenas', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'nombre', r.nombre, 'estrellas', r.estrellas,
                  'texto', r.texto, 'respuesta', r.respuesta, 'fecha', r.created_at) order by r.created_at desc), '[]'::jsonb)
                from public.resenas r where r.negocio_id = n.id and r.estado = 'aprobado'));
end $$;

-- Guardar cambios: solo estos campos, solo en la ficha dueña de la llave, con historial y límite por hora
create or replace function public.editar_ficha(p_token text, p_cambios jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n public.negocios; k text; antes jsonb := '{}'::jsonb;
        permitidas text[] := array['descripcion','direccion','horario','horarios','redes','entrega','sitio_web','fotos'];
begin
  if p_token is null or char_length(p_token) < 20 or p_cambios is null or jsonb_typeof(p_cambios) <> 'object' then raise exception 'Enlace no válido'; end if;
  select * into n from public.negocios where token_edicion = p_token and estado <> 'rechazado';
  if not found then raise exception 'Enlace no válido'; end if;
  if (select count(*) from public.ediciones where negocio_id = n.id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Demasiados cambios seguidos, intenta en un rato'; end if;
  for k in select jsonb_object_keys(p_cambios) loop
    if not (k = any(permitidas)) then raise exception 'Campo no permitido: %', k; end if;
    antes := antes || jsonb_build_object(k, to_jsonb(n) -> k);
  end loop;
  if p_cambios ? 'fotos' then
    if jsonb_typeof(p_cambios->'fotos') <> 'array' or exists (select 1 from jsonb_array_elements(p_cambios->'fotos') e where jsonb_typeof(e) <> 'string' or (e #>> '{}') not like '%/storage/v1/object/public/fotos/%') then
      raise exception 'Fotos no válidas'; end if;
  end if;
  update public.negocios set
    descripcion = case when p_cambios ? 'descripcion' then left(btrim(p_cambios->>'descripcion'), 300) else descripcion end,
    direccion   = case when p_cambios ? 'direccion'   then left(btrim(p_cambios->>'direccion'), 160)   else direccion end,
    horario     = case when p_cambios ? 'horario'     then left(btrim(p_cambios->>'horario'), 160)     else horario end,
    horarios    = case when p_cambios ? 'horarios'    then p_cambios->'horarios'                       else horarios end,
    redes       = case when p_cambios ? 'redes'       then left(btrim(p_cambios->>'redes'), 80)        else redes end,
    entrega     = case when p_cambios ? 'entrega'     then left(btrim(p_cambios->>'entrega'), 200)     else entrega end,
    sitio_web   = case when p_cambios ? 'sitio_web'   then btrim(p_cambios->>'sitio_web')              else sitio_web end,
    fotos       = case when p_cambios ? 'fotos'       then p_cambios->'fotos'                          else fotos end
  where id = n.id;
  insert into public.ediciones (negocio_id, antes, despues) values (n.id, antes, p_cambios);
  return public.ficha_por_token(p_token);
end $$;

-- Responder una opinión publicada de su propio negocio
create or replace function public.responder_resena(p_token text, p_resena uuid, p_texto text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n public.negocios; c integer;
begin
  select * into n from public.negocios where token_edicion = p_token and estado <> 'rechazado';
  if not found then raise exception 'Enlace no válido'; end if;
  update public.resenas set respuesta = left(btrim(coalesce(p_texto, '')), 300)
   where id = p_resena and negocio_id = n.id and estado = 'aprobado';
  get diagnostics c = row_count;
  return c = 1;
end $$;

revoke all on function public.ficha_por_token(text) from public;
revoke all on function public.editar_ficha(text, jsonb) from public;
revoke all on function public.responder_resena(text, uuid, text) from public;
grant execute on function public.ficha_por_token(text) to anon, authenticated;
grant execute on function public.editar_ficha(text, jsonb) to anon, authenticated;
grant execute on function public.responder_resena(text, uuid, text) to anon, authenticated;

-- ===== 20. Saber si el negocio abrió su enlace personal =====
alter table public.negocios add column if not exists aperturas integer not null default 0;
alter table public.negocios add column if not exists enlace_abierto timestamptz;

create or replace function public.ficha_por_token(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n public.negocios;
begin
  if p_token is null or char_length(p_token) < 20 then return null; end if;
  select * into n from public.negocios where token_edicion = p_token and estado <> 'rechazado';
  if not found then return null; end if;
  update public.negocios set aperturas = aperturas + 1, enlace_abierto = now() where id = n.id;
  return jsonb_build_object(
    'id', n.id, 'nombre', n.nombre, 'tipo', n.tipo, 'categoria', n.categoria, 'estado', n.estado,
    'descripcion', n.descripcion, 'direccion', n.direccion, 'horario', n.horario, 'horarios', n.horarios,
    'redes', n.redes, 'entrega', n.entrega, 'sitio_web', n.sitio_web, 'fotos', n.fotos,
    'resenas', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'nombre', r.nombre, 'estrellas', r.estrellas,
                  'texto', r.texto, 'respuesta', r.respuesta, 'fecha', r.created_at) order by r.created_at desc), '[]'::jsonb)
                from public.resenas r where r.negocio_id = n.id and r.estado = 'aprobado'));
end $$;
revoke all on function public.ficha_por_token(text) from public;
grant execute on function public.ficha_por_token(text) to anon, authenticated;
