create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  couple_name text not null,
  event_date date not null,
  event_type text not null default 'Mariage',
  venue text not null default 'Yaounde',
  password_hash text not null,
  quota_start integer not null default 100,
  quota_premium integer not null default 10,
  quota_enlargement integer not null default 3,
  price_grid jsonb not null default '[]'::jsonb,
  cover_image_url text,
  notification_email text not null default '',
  notification_whatsapp text not null default '',
  drive_url text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  parent_id uuid references public.folders(id) on delete cascade,
  display_order integer not null default 0
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.folders(id) on delete cascade,
  filename text not null,
  cloudinary_public_id text not null,
  watermarked_url text not null,
  original_url text not null,
  display_order integer not null default 0
);

create table if not exists public.client_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  confirmed_at timestamptz,
  whatsapp_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.selections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  type text not null check (type in ('start', 'premium', 'enlargement', 'extra')),
  selected_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  event_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  rating integer check (rating between 1 and 5),
  comment text,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  code text not null unique,
  conversions integer not null default 0,
  created_at timestamptz not null default now()
);

-- Admin users table (authentification studio)
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
create policy "admin_users_all_service" on public.admin_users
  for all using (current_user = 'service_role');

alter table public.projects enable row level security;
alter table public.folders enable row level security;
alter table public.photos enable row level security;
alter table public.client_sessions enable row level security;
alter table public.selections enable row level security;
alter table public.activity_logs enable row level security;
alter table public.reviews enable row level security;
alter table public.referrals enable row level security;

-- RLS policies: projects — anon can read active projects, service_role can do everything
create policy "projects_select_active" on public.projects
  for select using (is_active = true);
create policy "projects_all_service" on public.projects
  for all using (current_user = 'service_role');

-- RLS policies: folders — anon can read folders of active projects
create policy "folders_select_public" on public.folders
  for select using (
    exists (
      select 1 from public.projects
      where projects.id = folders.project_id and projects.is_active = true
    )
  );
create policy "folders_all_service" on public.folders
  for all using (current_user = 'service_role');

-- RLS policies: photos — anon can read photos of active projects
create policy "photos_select_public" on public.photos
  for select using (
    exists (
      select 1 from public.folders
      join public.projects on projects.id = folders.project_id
      where folders.id = photos.folder_id and projects.is_active = true
    )
  );
create policy "photos_all_service" on public.photos
  for all using (current_user = 'service_role');

-- RLS policies: client_sessions — anon can insert/select their own session (by project_id)
create policy "client_sessions_insert_anon" on public.client_sessions
  for insert with check (true);
create policy "client_sessions_select_anon" on public.client_sessions
  for select using (true);
create policy "client_sessions_all_service" on public.client_sessions
  for all using (current_user = 'service_role');

-- RLS policies: selections — anon can insert selections, service_role can manage
create policy "selections_insert_anon" on public.selections
  for insert with check (true);
create policy "selections_select_anon" on public.selections
  for select using (
    exists (
      select 1 from public.projects
      where projects.id = selections.project_id and projects.is_active = true
    )
  );
create policy "selections_all_service" on public.selections
  for all using (current_user = 'service_role');

-- RLS policies: activity_logs — anon can insert
create policy "activity_logs_insert_anon" on public.activity_logs
  for insert with check (true);
create policy "activity_logs_all_service" on public.activity_logs
  for all using (current_user = 'service_role');

-- RLS policies: reviews — public can read public reviews, anon can insert
create policy "reviews_select_public" on public.reviews
  for select using (is_public = true);
create policy "reviews_insert_anon" on public.reviews
  for insert with check (true);
create policy "reviews_all_service" on public.reviews
  for all using (current_user = 'service_role');

-- RLS policies: referrals — service_role only
create policy "referrals_all_service" on public.referrals
  for all using (current_user = 'service_role');
