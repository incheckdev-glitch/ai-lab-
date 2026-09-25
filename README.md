# InCheck 360 AI Location Report Lab

This repository tests one focused workflow:

**Supabase checklist report data → select client/location/date → AI management issue summary**

There is **no PDF upload in the web app**. PDF reports are only used once as source material when populating the test database. The normal report check reads stored report records from Supabase.

## What the app does

1. Loads available client / location / reporting-date combinations from `ai_report_sources`.
2. Pulls all matching checklist instances from `ai_report_records`.
3. Sends the stored evidence to the InCheck 360 Location Report Analyst prompt.
4. For exceptionally large daily reports, splits evidence into large chunks, extracts issue evidence in parallel, then produces one final concise management report.
5. Saves the result in `ai_location_reports`.

## Database

Run the complete root `supabase.sql` file in **Supabase → SQL Editor**. It creates:

- `ai_report_sources`
- `ai_report_records`
- `ai_location_reports`

RLS is enabled. Browser roles receive no table access; the Next.js API uses only the server-side service-role key.

The separate generated `seed-report-data.sql` file contains the converted sample records from the supplied InCheck 360 report PDFs and can be run after `supabase.sql`.

## Vercel variables

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-5.6-luna
```

`SUPABASE_URL` is also supported as a server-side alias for the project URL.

Never expose the Supabase service-role key or OpenAI API key with a `NEXT_PUBLIC_` prefix.

## Local development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Production note

This remains a test lab. Before production rollout, add authentication, tenant authorization, request rate limiting, audit controls, AI evaluation/monitoring and an agreed retention policy for report evidence and AI outputs.
