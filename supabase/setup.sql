-- Ligamester: kjør hele denne filen én gang i Supabase -> SQL Editor -> New query -> Run.

create table if not exists public.docs (
  path text primary key,
  coll text generated always as (split_part(path,'/',1)) stored,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists docs_coll_idx on public.docs (coll);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default ''
);

create table if not exists public.leases (
  name text primary key,
  holder text not null,
  expires_at timestamptz not null
);

alter table public.docs enable row level security;
alter table public.profiles enable row level security;
alter table public.leases enable row level security;

-- Alle innloggede spillere kan lese og skrive spilldata (samme tillit som mellom venner).
drop policy if exists docs_all on public.docs;
create policy docs_all on public.docs for all to authenticated using (true) with check (true);
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

grant select, insert, update, delete on public.docs to authenticated;
grant select, update on public.profiles to authenticated;

-- oppdateringstid
create or replace function public.touch_docs() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs for each row execute function public.touch_docs();

-- slå sammen felter i et eksisterende dokument
create or replace function public.merge_doc(p_path text, p_data jsonb) returns void
language plpgsql security invoker as $$
begin
  update public.docs set data = data || p_data where path = p_path;
  if not found then raise exception 'Dokumentet finnes ikke: %', p_path; end if;
end $$;
grant execute on function public.merge_doc(text, jsonb) to authenticated;

-- lås (lease) slik at bare én klient kjører kampene om gangen
create or replace function public.acquire_lease(p_name text, p_holder text, p_ttl_ms int) returns boolean
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  insert into public.leases (name, holder, expires_at)
  values (p_name, p_holder, now() + make_interval(secs => p_ttl_ms / 1000.0))
  on conflict (name) do update
    set holder = excluded.holder, expires_at = excluded.expires_at
    where public.leases.expires_at < now() or public.leases.holder = excluded.holder
  returning true into ok;
  return coalesce(ok, false);
end $$;
grant execute on function public.acquire_lease(text, text, int) to authenticated, service_role;

-- profil opprettes automatisk når en ny bruker registrerer seg
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- sanntid
alter publication supabase_realtime add table public.docs;
