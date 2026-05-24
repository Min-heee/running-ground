-- RunningGround PostgreSQL schema draft.
-- This file is not wired to the runtime yet. It is the target shape for
-- moving the current JSON store to a durable production database.

begin;

create table if not exists app_metadata (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  username text not null,
  password_hash text not null,
  password_updated_at timestamptz,
  nickname text not null,
  real_name text,
  phone text,
  birth_date date,
  public_tag text not null,
  province_name text,
  city_name text,
  district_name text,
  university_name text,
  address_detail text,
  reward_points numeric(10, 1) not null default 0 check (reward_points >= 0),
  streak_days integer not null default 0 check (streak_days >= 0),
  rank_state jsonb not null default '{"tier":"입문","lp":0}'::jsonb,
  connected_sources jsonb not null default '[]'::jsonb,
  notification_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_username_unique_idx on users (username);
create unique index if not exists users_public_tag_unique_idx on users (public_tag);
create index if not exists users_region_idx on users (province_name, city_name, district_name);
create index if not exists users_university_idx on users (university_name) where university_name is not null;

create table if not exists sessions (
  token text primary key,
  user_id text not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists sessions_user_id_idx on sessions (user_id);
create index if not exists sessions_expires_at_idx on sessions (expires_at);

create table if not exists runs (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  run_date date not null,
  distance_km numeric(7, 2) not null check (distance_km >= 0),
  pace text,
  source_label text not null default 'Manual',
  source_type text not null default 'manual',
  external_id text,
  route jsonb,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  cadence_spm integer check (cadence_spm is null or cadence_spm >= 0),
  elevation_gain_m numeric(8, 2) check (elevation_gain_m is null or elevation_gain_m >= 0),
  started_at timestamptz,
  ended_at timestamptz,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists runs_user_date_idx on runs (user_id, run_date desc);
create index if not exists runs_region_ranking_idx on runs (run_date desc, distance_km desc);
create unique index if not exists runs_user_source_external_unique_idx
  on runs (user_id, source_type, external_id)
  where external_id is not null and external_id <> '';
create index if not exists runs_user_source_fingerprint_idx
  on runs (user_id, source_type, run_date, distance_km, pace);

create table if not exists integration_imports (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  source_type text not null,
  source_label text not null,
  external_id text,
  run_date date,
  distance_km numeric(7, 2) check (distance_km is null or distance_km >= 0),
  pace text,
  import_status text not null default 'pending',
  raw_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index if not exists integration_imports_user_source_external_unique_idx
  on integration_imports (user_id, source_type, external_id)
  where external_id is not null and external_id <> '';
create index if not exists integration_imports_user_status_idx on integration_imports (user_id, import_status);

create table if not exists friend_requests (
  id text primary key,
  requester_id text not null references users (id) on delete cascade,
  receiver_id text not null references users (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> receiver_id)
);

create index if not exists friend_requests_receiver_status_idx on friend_requests (receiver_id, status);
create index if not exists friend_requests_requester_status_idx on friend_requests (requester_id, status);

create table if not exists friendships (
  id text primary key,
  user_a_id text not null references users (id) on delete cascade,
  user_b_id text not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a_id < user_b_id),
  unique (user_a_id, user_b_id)
);

create index if not exists friendships_user_a_idx on friendships (user_a_id);
create index if not exists friendships_user_b_idx on friendships (user_b_id);

create table if not exists market_items (
  id text primary key,
  title text not null,
  category text not null,
  description text not null default '',
  cost_points integer not null check (cost_points >= 0),
  partner_name text,
  repeatable boolean not null default false,
  inventory_count integer check (inventory_count is null or inventory_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_items_active_idx on market_items (is_active, category);

create table if not exists reward_redemptions (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  item_id text not null references market_items (id),
  cost_points integer not null check (cost_points >= 0),
  status text not null default 'requested',
  admin_note text not null default '',
  requested_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

create index if not exists reward_redemptions_user_idx on reward_redemptions (user_id, requested_at desc);
create index if not exists reward_redemptions_status_idx on reward_redemptions (status, requested_at desc);

create table if not exists offline_race_events (
  id text primary key,
  title text not null,
  subtitle text not null default '',
  distance_km numeric(7, 2) not null check (distance_km > 0),
  starts_at timestamptz not null,
  registration_closes_at timestamptz not null,
  participation_mode text not null default 'remote',
  proof_method text not null default 'app_record',
  run_window_minutes integer not null default 60 check (run_window_minutes > 0),
  host_label text not null default 'RunningGround',
  capacity integer check (capacity is null or capacity > 0),
  entry_fee_points integer not null default 0 check (entry_fee_points >= 0),
  distance_options jsonb not null default '[]'::jsonb,
  operation_note text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists offline_race_events_schedule_idx on offline_race_events (starts_at, is_active);

create table if not exists offline_race_entries (
  id text primary key,
  event_id text not null references offline_race_events (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  public_tag text not null,
  distance_km numeric(7, 2) not null check (distance_km > 0),
  entry_points integer not null default 0 check (entry_points >= 0),
  status text not null default 'registered',
  registered_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique (event_id, user_id),
  unique (event_id, public_tag)
);

create index if not exists offline_race_entries_user_idx on offline_race_entries (user_id, registered_at desc);

create table if not exists offline_race_guide_steps (
  position integer primary key check (position > 0),
  message text not null,
  updated_at timestamptz not null default now()
);

create table if not exists notices (
  id text primary key,
  title text not null,
  message text not null,
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notices_active_priority_idx on notices (is_active, priority desc, created_at desc);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on users;
create trigger users_set_updated_at before update on users
for each row execute function set_updated_at();

drop trigger if exists runs_set_updated_at on runs;
create trigger runs_set_updated_at before update on runs
for each row execute function set_updated_at();

drop trigger if exists friend_requests_set_updated_at on friend_requests;
create trigger friend_requests_set_updated_at before update on friend_requests
for each row execute function set_updated_at();

drop trigger if exists market_items_set_updated_at on market_items;
create trigger market_items_set_updated_at before update on market_items
for each row execute function set_updated_at();

drop trigger if exists offline_race_events_set_updated_at on offline_race_events;
create trigger offline_race_events_set_updated_at before update on offline_race_events
for each row execute function set_updated_at();

drop trigger if exists notices_set_updated_at on notices;
create trigger notices_set_updated_at before update on notices
for each row execute function set_updated_at();

commit;
