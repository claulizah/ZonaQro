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
                         and cupones = '[]'::jsonb and catalogo = '[]'::jsonb);

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
