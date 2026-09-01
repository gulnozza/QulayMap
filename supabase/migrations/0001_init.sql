-- QulayMap Uzbekistan — initial schema
-- PostGIS geometries use SRID 4326 (lng/lat). GeoJSON on the wire.
-- Append-only: never edit this file after it has been applied; write a new migration.

create extension if not exists postgis;
create extension if not exists "uuid-ossp";

-- ============================================================
-- Enums
-- ============================================================
create type org_role as enum ('reviewer', 'admin');
create type collection_visibility as enum ('public', 'unlisted', 'private');
create type layer_kind as enum ('resource', 'condition', 'route_preference');
create type routing_behavior as enum ('hard_avoid', 'soft_prefer', 'soft_avoid', 'informational', 'destination_filter');
create type trust_state as enum ('community_submitted', 'org_reviewed', 'community_confirmed', 'needs_recheck');
create type submission_status as enum ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'published');
create type verification_method as enum ('field_visit', 'photo_evidence', 'partner_data', 'phone_check');

-- ============================================================
-- Identity & organizations
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  preferred_language text not null default 'uz' check (preferred_language in ('uz','ru','en')),
  created_at timestamptz not null default now()
);

create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  description text,
  verified_at timestamptz,          -- null = not yet platform-verified
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role org_role not null default 'reviewer',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- ============================================================
-- Maps: collections → layers → features
-- ============================================================
create table collections (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  slug text not null unique,        -- e.g. 'access-uz', 'care-uz'
  title text not null,
  description text,
  visibility collection_visibility not null default 'public',
  created_at timestamptz not null default now()
);

create table layers (
  id uuid primary key default uuid_generate_v4(),
  collection_id uuid not null references collections(id) on delete cascade,
  slug text not null,
  title text not null,
  kind layer_kind not null,
  routing_behavior routing_behavior not null default 'informational',
  -- JSON Schema for category-specific attributes; validated at submission time
  attribute_schema jsonb not null default '{}',
  style jsonb not null default '{}',  -- map styling hints (color token, icon)
  unique (collection_id, slug)
);

create table map_features (
  id uuid primary key default uuid_generate_v4(),
  layer_id uuid not null references layers(id) on delete cascade,
  geometry geometry(Geometry, 4326) not null,  -- Point | LineString | Polygon
  properties jsonb not null default '{}',      -- validated against layer.attribute_schema
  name text,
  trust_state trust_state not null default 'community_submitted',
  source text not null,                        -- who/what supplied it ('field visit', 'partner: X', 'demo data')
  is_demo boolean not null default false,      -- demo data is always labeled honestly
  visibility collection_visibility not null default 'public',
  observed_at timestamptz not null,            -- when the condition was last observed
  published_at timestamptz,
  updated_at timestamptz not null default now()
);
create index map_features_geometry_idx on map_features using gist (geometry);
create index map_features_layer_idx on map_features (layer_id);

-- ============================================================
-- Contributions & trust
-- ============================================================
create table submissions (
  id uuid primary key default uuid_generate_v4(),
  layer_id uuid not null references layers(id) on delete cascade,
  feature_id uuid references map_features(id) on delete set null,  -- null = new place
  payload jsonb not null,                      -- proposed geometry + properties + note
  photo_paths text[] not null default '{}',    -- Supabase Storage paths (EXIF-stripped)
  status submission_status not null default 'submitted',
  submitted_by uuid not null references profiles(id),
  reviewer_note text,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index submissions_status_idx on submissions (status);
create index submissions_layer_idx on submissions (layer_id);

create table verifications (
  id uuid primary key default uuid_generate_v4(),
  feature_id uuid not null references map_features(id) on delete cascade,
  method verification_method not null,
  confidence numeric not null check (confidence between 0 and 1),
  observed_at timestamptz not null,
  verified_by uuid references profiles(id),
  note text,
  created_at timestamptz not null default now()
);
create index verifications_feature_idx on verifications (feature_id);

-- Append-only moderation audit. Never update or delete rows.
create table audit_log (
  id bigint generated always as identity primary key,
  submission_id uuid not null references submissions(id) on delete cascade,
  actor_id uuid not null references profiles(id),
  from_status submission_status not null,
  to_status submission_status not null,
  reason text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Pilot routing graph
-- ============================================================
create table route_nodes (
  id bigint primary key,                        -- OSM node id
  geometry geometry(Point, 4326) not null
);
create index route_nodes_geometry_idx on route_nodes using gist (geometry);

create table route_edges (
  id bigint generated always as identity primary key,
  from_node bigint not null references route_nodes(id),
  to_node bigint not null references route_nodes(id),
  geometry geometry(LineString, 4326) not null,
  length_m numeric not null,
  base_cost numeric not null,                   -- seconds at walking speed
  wheelchair_ok boolean not null default true,  -- from OSM tags where present
  tags jsonb not null default '{}'
);
create index route_edges_geometry_idx on route_edges using gist (geometry);
create index route_edges_from_idx on route_edges (from_node);
create index route_edges_to_idx on route_edges (to_node);

-- Layer effects on edges (construction, lighting...). Computed by matching
-- map_features geometry to nearby edges; refreshed when features change.
create table edge_conditions (
  edge_id bigint not null references route_edges(id) on delete cascade,
  layer_id uuid not null references layers(id) on delete cascade,
  feature_id uuid not null references map_features(id) on delete cascade,
  severity numeric not null default 1 check (severity between 0 and 1),
  trust_state trust_state not null,
  observed_at timestamptz not null,
  primary key (edge_id, feature_id)
);
create index edge_conditions_layer_idx on edge_conditions (layer_id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table profiles enable row level security;
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table collections enable row level security;
alter table layers enable row level security;
alter table map_features enable row level security;
alter table submissions enable row level security;
alter table verifications enable row level security;
alter table audit_log enable row level security;
alter table route_nodes enable row level security;
alter table route_edges enable row level security;
alter table edge_conditions enable row level security;

-- Helper: does the current user hold a role in the org owning a collection?
create or replace function is_org_member(p_collection_id uuid, p_roles org_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from collections c
    join organization_members m on m.organization_id = c.organization_id
    where c.id = p_collection_id
      and m.user_id = auth.uid()
      and m.role = any (p_roles)
  );
$$;

-- Profiles: users read/update themselves; display names are readable for attribution
create policy "read profiles" on profiles for select using (true);
create policy "update own profile" on profiles for update using (id = auth.uid());
create policy "insert own profile" on profiles for insert with check (id = auth.uid());

-- Organizations & membership: public read of orgs; members visible to co-members
create policy "read orgs" on organizations for select using (true);
create policy "read own memberships" on organization_members for select
  using (user_id = auth.uid() or exists (
    select 1 from organization_members m2
    where m2.organization_id = organization_members.organization_id
      and m2.user_id = auth.uid()));
create policy "admins manage members" on organization_members for all
  using (exists (
    select 1 from organization_members m
    where m.organization_id = organization_members.organization_id
      and m.user_id = auth.uid() and m.role = 'admin'));

-- Collections: anyone reads public/unlisted; members read private; admins write
create policy "read public collections" on collections for select
  using (visibility in ('public','unlisted')
         or is_org_member(id, array['reviewer','admin']::org_role[]));
create policy "admins write collections" on collections for all
  using (exists (
    select 1 from organization_members m
    where m.organization_id = collections.organization_id
      and m.user_id = auth.uid() and m.role = 'admin'));

-- Layers follow their collection; only org admins create/modify layers
create policy "read layers of readable collections" on layers for select
  using (exists (
    select 1 from collections c where c.id = layers.collection_id
      and (c.visibility in ('public','unlisted')
           or is_org_member(c.id, array['reviewer','admin']::org_role[]))));
create policy "admins write layers" on layers for all
  using (is_org_member(collection_id, array['admin']::org_role[]));

-- Map features: public reads published+public only; org members see all of theirs
create policy "read published public features" on map_features for select
  using (
    (published_at is not null and visibility = 'public')
    or exists (
      select 1 from layers l where l.id = map_features.layer_id
        and is_org_member(l.collection_id, array['reviewer','admin']::org_role[])));
create policy "reviewers write features" on map_features for all
  using (exists (
    select 1 from layers l where l.id = map_features.layer_id
      and is_org_member(l.collection_id, array['reviewer','admin']::org_role[])));

-- Submissions: authors create as themselves and read their own;
-- org reviewers/admins read + update submissions for their collections
create policy "create own submissions" on submissions for insert
  with check (submitted_by = auth.uid());
create policy "read own submissions" on submissions for select
  using (submitted_by = auth.uid());
create policy "org reads submissions" on submissions for select
  using (exists (
    select 1 from layers l where l.id = submissions.layer_id
      and is_org_member(l.collection_id, array['reviewer','admin']::org_role[])));
create policy "org reviews submissions" on submissions for update
  using (exists (
    select 1 from layers l where l.id = submissions.layer_id
      and is_org_member(l.collection_id, array['reviewer','admin']::org_role[])));

-- Verifications: readable with the feature; writable by org members
create policy "read verifications" on verifications for select using (true);
create policy "org writes verifications" on verifications for insert
  with check (exists (
    select 1 from map_features f join layers l on l.id = f.layer_id
    where f.id = verifications.feature_id
      and is_org_member(l.collection_id, array['reviewer','admin']::org_role[])));

-- Audit log: append-only; org members read their own org's entries
create policy "org reads audit" on audit_log for select
  using (exists (
    select 1 from submissions s join layers l on l.id = s.layer_id
    where s.id = audit_log.submission_id
      and is_org_member(l.collection_id, array['reviewer','admin']::org_role[])));
create policy "insert audit" on audit_log for insert
  with check (actor_id = auth.uid());
-- No update/delete policies on audit_log: rows are immutable by design.

-- Routing graph: world-readable, service-role-writable (no user policies for write)
create policy "read graph nodes" on route_nodes for select using (true);
create policy "read graph edges" on route_edges for select using (true);
create policy "read edge conditions" on edge_conditions for select using (true);

-- ============================================================
-- Seed helper view: coverage/recheck gaps (privacy-preserving aggregates)
-- ============================================================
create or replace view coverage_summary as
select
  l.collection_id,
  l.id as layer_id,
  l.title as layer_title,
  count(f.id) filter (where f.published_at is not null) as published_count,
  count(f.id) filter (where f.trust_state = 'needs_recheck') as needs_recheck_count,
  max(f.observed_at) as freshest_observation
from layers l
left join map_features f on f.layer_id = l.id
group by l.collection_id, l.id, l.title;
