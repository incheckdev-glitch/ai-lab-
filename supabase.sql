-- InCheck 360 AI Lab - Supabase setup
-- Run this entire file in Supabase > SQL Editor.
-- Designed for the isolated AI/checklist test environment, not production.

begin;

create extension if not exists pgcrypto;

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  version text not null default '1.0',
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  title text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_questions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.checklist_sections(id) on delete cascade,
  code text not null,
  question text not null,
  response_type text not null check (response_type in ('yes_no','number','text','photo')),
  required boolean not null default false,
  critical boolean not null default false,
  min_value numeric,
  max_value numeric,
  unit text,
  requires_photo boolean not null default false,
  ai_enabled boolean not null default false,
  ai_instruction text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(section_id, code)
);

create table if not exists public.checklist_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id),
  location_id uuid references public.locations(id),
  location_name text not null,
  inspector_name text not null,
  score numeric not null default 0 check (score >= 0 and score <= 100),
  status text not null default 'in_progress' check (status in ('in_progress','completed','cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_answers (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.checklist_runs(id) on delete cascade,
  question_id uuid not null references public.checklist_questions(id),
  value_json jsonb,
  photo_path text,
  is_compliant boolean,
  created_at timestamptz not null default now(),
  unique(run_id, question_id)
);

create table if not exists public.ai_analysis (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.checklist_runs(id) on delete cascade,
  answer_id uuid references public.checklist_answers(id) on delete cascade,
  question_id uuid not null references public.checklist_questions(id),
  status text not null check (status in ('pass','fail','review')),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 100),
  finding text not null,
  recommendation text not null,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists idx_sections_template on public.checklist_sections(template_id, sort_order);
create index if not exists idx_questions_section on public.checklist_questions(section_id, sort_order);
create index if not exists idx_runs_template on public.checklist_runs(template_id, created_at desc);
create index if not exists idx_answers_run on public.checklist_answers(run_id);
create index if not exists idx_ai_run on public.ai_analysis(run_id);

-- RLS is enabled on every public table. The web app uses the service-role key only in server-side API routes.
alter table public.locations enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_sections enable row level security;
alter table public.checklist_questions enable row level security;
alter table public.checklist_runs enable row level security;
alter table public.checklist_answers enable row level security;
alter table public.ai_analysis enable row level security;

-- No anon/authenticated policies are created intentionally. This lab's browser never talks directly to the database.
revoke all on table public.locations from anon, authenticated;
revoke all on table public.checklist_templates from anon, authenticated;
revoke all on table public.checklist_sections from anon, authenticated;
revoke all on table public.checklist_questions from anon, authenticated;
revoke all on table public.checklist_runs from anon, authenticated;
revoke all on table public.checklist_answers from anon, authenticated;
revoke all on table public.ai_analysis from anon, authenticated;

grant all on table public.locations to service_role;
grant all on table public.checklist_templates to service_role;
grant all on table public.checklist_sections to service_role;
grant all on table public.checklist_questions to service_role;
grant all on table public.checklist_runs to service_role;
grant all on table public.checklist_answers to service_role;
grant all on table public.ai_analysis to service_role;

-- Private evidence bucket. Signed URLs are generated by the server when a report is opened.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'checklist-evidence',
  'checklist-evidence',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Seed location
insert into public.locations (id, name, code)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Kitchen', 'TEST-001')
on conflict (id) do update set name = excluded.name, code = excluded.code;

-- Seed checklist template
insert into public.checklist_templates (id, name, code, version, description, is_active)
values (
  '11111111-1111-1111-1111-111111111111',
  'Daily Food Safety Inspection',
  'FS-DAILY-001',
  '1.0',
  'Sample checklist used to validate the InCheck 360 AI checklist workflow.',
  true
)
on conflict (id) do update set
  name = excluded.name,
  code = excluded.code,
  version = excluded.version,
  description = excluded.description,
  is_active = excluded.is_active;

insert into public.checklist_sections (id, template_id, title, description, sort_order)
values
  ('22222222-2222-2222-2222-222222222221','11111111-1111-1111-1111-111111111111','Cold Storage','Refrigeration, storage condition and food protection.',1),
  ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','Kitchen & Hygiene','Basic kitchen controls and personal hygiene.',2)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.checklist_questions
(id, section_id, code, question, response_type, required, critical, min_value, max_value, unit, requires_photo, ai_enabled, ai_instruction, sort_order)
values
  ('33333333-3333-3333-3333-333333333331','22222222-2222-2222-2222-222222222221','CS-01','Is the refrigerator clean and free from visible contamination?','yes_no',true,false,null,null,null,false,true,'Assess whether the answer and any image indicate a visibly clean refrigerator.',1),
  ('33333333-3333-3333-3333-333333333332','22222222-2222-2222-2222-222222222221','CS-02','What is the refrigerator temperature?','number',true,true,0,5,'°C',false,false,null,2),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222221','CS-03','Are all open foods protected, covered or stored in approved containers?','yes_no',true,true,null,null,null,true,true,'Look for open, uncovered or poorly protected food containers and identify visible concerns.',3),
  ('33333333-3333-3333-3333-333333333334','22222222-2222-2222-2222-222222222222','KH-01','Are food-contact work surfaces visibly clean?','yes_no',true,false,null,null,null,true,true,'Assess visible cleanliness and flag spills, residue, waste or obvious contamination.',1),
  ('33333333-3333-3333-3333-333333333335','22222222-2222-2222-2222-222222222222','KH-02','Record any hygiene observation that requires follow-up.','text',false,false,null,null,null,false,true,'Classify the written observation as pass, fail or review and suggest one concise operational action.',2)
on conflict (id) do update set
  question = excluded.question,
  response_type = excluded.response_type,
  required = excluded.required,
  critical = excluded.critical,
  min_value = excluded.min_value,
  max_value = excluded.max_value,
  unit = excluded.unit,
  requires_photo = excluded.requires_photo,
  ai_enabled = excluded.ai_enabled,
  ai_instruction = excluded.ai_instruction,
  sort_order = excluded.sort_order;

commit;
