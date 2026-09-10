-- HAVEN Innovation layer: predictive analytics storage, AI interaction audit,
-- inventory consumption movements, and QR-based operations.
-- Additive only; every table follows the existing service-role-only access
-- pattern (RLS enabled, anon/authenticated revoked, service_role granted).

-- ---------------------------------------------------------------------------
-- Predictive analytics: model runs + prediction snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_model_runs (
  id uuid primary key default gen_random_uuid(),
  model_type text not null,
  model_version text not null,
  generated_at timestamptz not null default now(),
  source_window_start date,
  source_window_end date,
  parameters jsonb not null default '{}'::jsonb,
  status text not null default 'completed' check (status in ('completed','failed'))
);
create index if not exists analytics_model_runs_type_idx on public.analytics_model_runs(model_type, generated_at desc);

create table if not exists public.analytics_predictions (
  id uuid primary key default gen_random_uuid(),
  model_run_id uuid not null references public.analytics_model_runs(id) on delete cascade,
  prediction_type text not null,
  target_date date not null,
  target_resource_type text not null,
  target_resource_id text,
  predicted_value numeric(14,2) not null,
  risk_level text not null default 'low' check (risk_level in ('low','medium','high')),
  data_quality text not null default 'limited' check (data_quality in ('high','medium','limited')),
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now()
);
create index if not exists analytics_predictions_type_date_idx on public.analytics_predictions(prediction_type, target_date desc);
create index if not exists analytics_predictions_run_idx on public.analytics_predictions(model_run_id);

-- ---------------------------------------------------------------------------
-- AI interaction audit: who used which AI feature and how it went.
-- Prompt/response bodies are deliberately NOT stored (privacy decision) —
-- see docs/innovation-architecture.md.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_accounts(id) on delete set null,
  role text not null,
  feature text not null check (feature in ('brief','ask','explain','report_summary')),
  tool_calls_used jsonb not null default '[]'::jsonb,
  status text not null check (status in ('ok','unavailable','invalid','rate_limited','error')),
  model text,
  latency_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists ai_interactions_user_recent_idx on public.ai_interactions(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Inventory consumption history — the smallest correct movement log.
-- Forecasts read `consumption` rows; `restock`/`adjustment` rows keep the
-- ledger complete for audit. quantity is always positive; direction carries
-- the sign.
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references public.inventory(id) on delete restrict,
  quantity numeric(12,2) not null check (quantity > 0),
  direction text not null check (direction in ('consumption','restock','adjustment')),
  source_type text,
  source_id text,
  recorded_by uuid references public.user_accounts(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists inventory_movements_item_idx on public.inventory_movements(item_id, created_at desc);
create index if not exists inventory_movements_source_idx on public.inventory_movements(source_type, source_id) where source_id is not null;

-- ---------------------------------------------------------------------------
-- QR-based operations: opaque hashed tokens + scan audit.
-- The QR payload contains only the random token; the plaintext token is never
-- stored (SHA-256 hash only), and validation ALWAYS re-checks the current
-- state of the underlying resource.
-- ---------------------------------------------------------------------------
create table if not exists public.qr_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  resource_type text not null check (resource_type in ('reservation','room')),
  resource_id text not null,
  purpose text not null default 'check_in',
  created_by uuid references public.user_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);
create index if not exists qr_tokens_active_idx on public.qr_tokens(resource_type, resource_id) where revoked_at is null;

create table if not exists public.qr_scan_events (
  id uuid primary key default gen_random_uuid(),
  qr_token_id uuid not null references public.qr_tokens(id) on delete restrict,
  scanner_user_id uuid references public.user_accounts(id) on delete set null,
  scanner_role text,
  resource_type text not null,
  resource_id text not null,
  action text not null default 'resolve',
  result text not null check (result in ('authorized','invalid','expired','revoked','unauthorized','ineligible')),
  scanned_at timestamptz not null default now()
);
create index if not exists qr_scan_events_token_idx on public.qr_scan_events(qr_token_id, scanned_at desc);

-- ---------------------------------------------------------------------------
-- Lock everything to the service role (app server only), like every other
-- HAVEN table: no anon/authenticated access, RLS enabled.
-- ---------------------------------------------------------------------------
alter table public.analytics_model_runs enable row level security;
alter table public.analytics_predictions enable row level security;
alter table public.ai_interactions enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.qr_tokens enable row level security;
alter table public.qr_scan_events enable row level security;

revoke all on table public.analytics_model_runs, public.analytics_predictions, public.ai_interactions, public.inventory_movements, public.qr_tokens, public.qr_scan_events from anon, authenticated;
grant all on table public.analytics_model_runs, public.analytics_predictions, public.ai_interactions, public.inventory_movements, public.qr_tokens, public.qr_scan_events to service_role;
