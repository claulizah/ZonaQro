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
