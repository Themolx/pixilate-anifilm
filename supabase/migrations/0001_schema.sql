-- Pixilate v3 — single shared feed (exquisite corpse) for Anifilm 2026.
-- One global animation, everyone contributes, everyone sees updates in realtime.

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- frames: the shared timeline
create table public.frames (
  id            uuid primary key default gen_random_uuid(),
  seq           bigserial not null,
  storage_path  text not null,
  thumb_path    text not null,
  device_id     text not null check (char_length(device_id) between 8 and 64),
  display_name  text check (display_name is null or char_length(display_name) <= 24),
  width         integer not null check (width  > 0 and width  <= 8192),
  height        integer not null check (height > 0 and height <= 8192),
  bytes         integer not null check (bytes  > 0 and bytes  <= 2097152),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index frames_seq_active   on public.frames (seq)                   where deleted_at is null;
create index frames_device_time  on public.frames (device_id, created_at desc);

-- admins whitelist; bootstrap with SQL after first magic-link login
create table public.admins (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  email     text not null,
  added_at  timestamptz not null default now()
);

-- reports submitted by users
create table public.reports (
  id                   uuid primary key default gen_random_uuid(),
  frame_id             uuid not null references public.frames(id) on delete cascade,
  reason               text not null check (char_length(reason) between 1 and 500),
  reporter_device_id   text not null check (char_length(reporter_device_id) between 8 and 64),
  created_at           timestamptz not null default now(),
  resolved_at          timestamptz,
  resolved_by          uuid references auth.users(id)
);
create index reports_open on public.reports (created_at desc) where resolved_at is null;

-- admin check used by RLS
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- RLS ---------------------------------------------------------------------
alter table public.frames  enable row level security;
alter table public.admins  enable row level security;
alter table public.reports enable row level security;

create policy frames_read_public  on public.frames for select using (deleted_at is null or public.is_admin());
create policy frames_insert_anon  on public.frames for insert with check (deleted_at is null and bytes <= 2097152);
create policy frames_update_admin on public.frames for update using (public.is_admin()) with check (public.is_admin());

create policy admins_select_admin on public.admins for select using (public.is_admin());
create policy admins_write_admin  on public.admins for all    using (public.is_admin()) with check (public.is_admin());

create policy reports_insert_anon on public.reports for insert with check (char_length(reason) between 1 and 500);
create policy reports_select_admin on public.reports for select using (public.is_admin());
create policy reports_update_admin on public.reports for update using (public.is_admin()) with check (public.is_admin());

-- Storage -----------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pixilate-frames', 'pixilate-frames', true, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy storage_read_pixilate   on storage.objects for select using (bucket_id = 'pixilate-frames');
create policy storage_insert_pixilate on storage.objects for insert with check (bucket_id = 'pixilate-frames' and name like 'frames/%');
create policy storage_delete_admin    on storage.objects for delete using (bucket_id = 'pixilate-frames' and public.is_admin());

-- Rate limit: 12 frames/min/device ---------------------------------------
create or replace function public.enforce_frame_rate() returns trigger
language plpgsql as $$
declare recent int;
begin
  select count(*) into recent
    from public.frames
   where device_id  = new.device_id
     and created_at > now() - interval '1 minute';
  if recent >= 12 then
    raise exception 'rate_limit' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger trg_frames_rate
before insert on public.frames
for each row execute function public.enforce_frame_rate();

-- Global festival cap ----------------------------------------------------
create or replace function public.enforce_frame_cap() returns trigger
language plpgsql as $$
declare cnt int;
begin
  select count(*) into cnt from public.frames where deleted_at is null;
  if cnt >= 10000 then
    raise exception 'frame_cap_reached' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger trg_frames_cap
before insert on public.frames
for each row execute function public.enforce_frame_cap();

-- Realtime: add frames to the supabase_realtime publication --------------
alter publication supabase_realtime add table public.frames;

-- TTL: hard-delete soft-deleted frames after 7 days ----------------------
select cron.schedule(
  'pixilate-gc-frames',
  '37 3 * * *',
  $$
    delete from public.frames
     where deleted_at is not null
       and deleted_at < now() - interval '7 days'
  $$
);
