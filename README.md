# InCheck 360 AI Lab

A deliberately small test application for validating this flow:

**Checklist PDF → structured Supabase data → web checklist → AI analysis → browser report**

The app can run in **demo mode with no services configured**. When Supabase/OpenAI environment variables are added, the same UI switches to real persistence and AI calls.

## Included

- Next.js App Router + TypeScript
- Sample food-safety checklist
- Yes/No, number, text and photo evidence inputs
- Automatic numeric compliance rules
- Optional per-question AI analysis
- Real Supabase persistence through server-only API routes
- Private Supabase Storage evidence bucket + signed report URLs
- Minimal report with Print / Save PDF
- `supabase.sql` one-file database setup and seed
- Vercel-ready environment configuration

## 1. Test locally without Supabase

```bash
npm install
# npm creates package-lock.json on first install; commit it before team deployment.
npm run dev
```

Open `http://localhost:3000`. The app will use its bundled sample checklist and browser localStorage.

## 2. Create the Supabase database later

1. Create a new isolated Supabase project.
2. Open **SQL Editor**.
3. Copy the full contents of `supabase.sql`.
4. Run it once.
5. The script creates the tables, RLS configuration, private evidence bucket and sample checklist.

The SQL is intentionally configured with **no browser database access**. All database calls are made from Next.js API routes using the server-side service role key.

## 3. Environment variables

Copy `.env.example` to `.env.local` for local testing:

```bash
cp .env.example .env.local
```

Set:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
OPENAI_API_KEY=YOUR_OPENAI_API_KEY        # optional
OPENAI_MODEL=gpt-5.6-luna                 # optional
```

Never prefix the service-role key or OpenAI key with `NEXT_PUBLIC_`.

## 4. Vercel deployment later

1. Push this folder to a GitHub repository.
2. Import the repository in Vercel.
3. Add the same environment variables in Vercel Project Settings.
4. Deploy.

If you configure Supabase but omit `OPENAI_API_KEY`, database storage is real while AI findings remain deterministic demo results. This is useful for testing the checklist/report flow before spending API credits.

## 5. Converting your PDF checklists

For each PDF, convert it into:

- `checklist_templates`
- `checklist_sections`
- `checklist_questions`

Each question can carry:

- response type
- required / optional
- critical flag
- accepted numeric range and unit
- photo requirement
- AI enabled flag
- AI-specific instruction
- sort order

The PDF itself is therefore a source document; the operational checklist becomes structured database data.

## Important

This repository is a testing lab, not the production InCheck 360 application. Before production use, add authentication, tenant/location authorization, audit logging, rate limiting, stronger validation, retention rules, and a formal AI evaluation process.
