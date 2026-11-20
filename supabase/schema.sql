-- =========================================================================
-- Registre Diari EF — Supabase Schema & Protecciones de Seguridad
-- =========================================================================
-- Instrucciones (para tu nuevo proyecto en Supabase exclusivo de Registre EF):
-- 1. Crea un proyecto nuevo en https://supabase.com (ej: "registre-diari-ef")
-- 2. Ve a SQL Editor -> New Query
-- 3. Pega este código completo y pulsa RUN
-- 4. Copia tu Project URL y tu Anon/Publishable Key (Settings -> API) y
--    pégalas en config.js
-- =========================================================================

create table if not exists public.registre_ef_state (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- 1. PROTECCIÓN DE TAMAÑO (Máx 2 MB por cuenta para todos los grupos y sesiones)
-- -------------------------------------------------------------------------
alter table public.registre_ef_state
  drop constraint if exists registre_ef_max_data_size;

alter table public.registre_ef_state
  add constraint registre_ef_max_data_size check (pg_column_size(data) <= 2097152);

-- -------------------------------------------------------------------------
-- 2. MANTENER updated_at ACTUALIZADO AUTOMÁTICAMENTE
-- -------------------------------------------------------------------------
create or replace function public.touch_registre_ef_updated_at()
returns trigger language plpgsql as $touch$
begin
  new.updated_at = now();
  return new;
end;
$touch$;

drop trigger if exists registre_ef_touch on public.registre_ef_state;
create trigger registre_ef_touch
  before update on public.registre_ef_state
  for each row execute function public.touch_registre_ef_updated_at();

-- -------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) — Cada usuario solo puede ver y editar lo suyo
-- -------------------------------------------------------------------------
alter table public.registre_ef_state enable row level security;

drop policy if exists "Own registre_ef: select" on public.registre_ef_state;
drop policy if exists "Own registre_ef: insert" on public.registre_ef_state;
drop policy if exists "Own registre_ef: update" on public.registre_ef_state;
drop policy if exists "Own registre_ef: delete" on public.registre_ef_state;

create policy "Own registre_ef: select" on public.registre_ef_state
  for select to authenticated
  using (auth.uid() = user_id);

create policy "Own registre_ef: insert" on public.registre_ef_state
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Own registre_ef: update" on public.registre_ef_state
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Own registre_ef: delete" on public.registre_ef_state
  for delete to authenticated
  using (auth.uid() = user_id);

-- -------------------------------------------------------------------------
-- 4. ELIMINACIÓN DE CUENTA POR EL PROPIO USUARIO (RPC Security Definer)
-- -------------------------------------------------------------------------
create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
set search_path = public
as $del_user$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No hay sesión autenticada activa.';
  end if;

  delete from public.registre_ef_state where user_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$del_user$;

revoke all on function public.delete_user_account() from public;
grant execute on function public.delete_user_account() to authenticated;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.registre_ef_state to authenticated;
