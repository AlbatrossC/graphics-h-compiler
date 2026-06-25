create table if not exists public.maintenance_sessions (
  id uuid primary key,
  slug text unique not null,
  label text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  is_active boolean not null default true
);

create table if not exists public.maintenance_messages (
  id uuid primary key,
  session_id uuid not null references public.maintenance_sessions(id) on delete cascade,
  generated_name text not null,
  message text not null,
  created_at timestamptz not null default now(),
  status text not null default 'visible'
);

create index if not exists maintenance_messages_session_created_idx
  on public.maintenance_messages (session_id, created_at desc);

create index if not exists maintenance_messages_visible_idx
  on public.maintenance_messages (session_id, status, created_at desc);
