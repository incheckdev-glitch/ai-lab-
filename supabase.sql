-- InCheck 360 AI Location Report Lab
-- Run this complete file in Supabase SQL Editor.
-- It creates only the report-analysis tables. It does NOT create operational checklist templates.

begin;

create extension if not exists pgcrypto;

create table if not exists public.ai_report_sources (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  location_name text not null,
  report_date date not null,
  source_filename text not null,
  source_page_count integer not null default 0 check (source_page_count >= 0),
  record_count integer not null default 0 check (record_count >= 0),
  imported_at timestamptz not null default now(),
  unique (client_name, location_name, report_date, source_filename)
);

create table if not exists public.ai_report_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.ai_report_sources(id) on delete cascade,
  checklist_title text not null,
  display_at_text text,
  due_at_text text,
  expiry_at_text text,
  completion_at_text text,
  submitted_by text,
  instance_status text,
  start_page integer not null check (start_page > 0),
  end_page integer not null check (end_page >= start_page),
  raw_text text not null,
  created_at timestamptz not null default now(),
  unique (source_id, start_page)
);

create table if not exists public.ai_location_reports (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  location_name text not null,
  report_date date not null,
  summary text not null,
  priority text not null check (priority in ('LOW','MEDIUM','HIGH','NOT ASSESSED')),
  management_attention text not null check (management_attention in ('YES','NO IDENTIFIED NEED','UNABLE TO DETERMINE')),
  model text,
  record_count integer not null default 0,
  source_ids uuid[] not null default '{}',
  generated_at timestamptz not null default now()
);

create index if not exists idx_ai_report_sources_lookup
  on public.ai_report_sources (client_name, location_name, report_date);
create index if not exists idx_ai_report_records_source_page
  on public.ai_report_records (source_id, start_page);
create index if not exists idx_ai_location_reports_lookup
  on public.ai_location_reports (client_name, location_name, report_date, generated_at desc);

alter table public.ai_report_sources enable row level security;
alter table public.ai_report_records enable row level security;
alter table public.ai_location_reports enable row level security;

revoke all on table public.ai_report_sources from anon, authenticated;
revoke all on table public.ai_report_records from anon, authenticated;
revoke all on table public.ai_location_reports from anon, authenticated;

grant all on table public.ai_report_sources to service_role;
grant all on table public.ai_report_records to service_role;
grant all on table public.ai_location_reports to service_role;

commit;
