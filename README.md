# ORT SA STEM & IT Academy - Management System

React + TypeScript + Tailwind PWA on Supabase (Postgres, Auth, Storage, Edge Functions).
Mobile-first for facilitators in the field (offline drafts, camera capture), desktop-friendly for managers, administrators and the HOD.

## What is in the box

| Area | Where |
|---|---|
| Database schema (your original) | `supabase/migrations/001_base_schema.sql` |
| Security hardening of that schema | `002_security_hardening.sql` |
| Workflow RPCs (submit / review / query / approve, documents, schools, members, external links) | `003_workflow_functions.sql` |
| Dashboards, outstanding items, project health, reports, analytics | `004_reporting_functions.sql` |
| Assignable-user lookup for managers | `005_assignable_users.sql` |
| Edge Functions | `supabase/functions/{admin-users,request-access,external-upload,report-narrative}` |
| Frontend | `src/` (feature folders: auth, dashboard, projects, observations, documents, schools, teachers, reports, analytics, audit, users, admin, external) |
| Local SQL tests | `supabase/tests/` |

## Why migration 002 exists (read this)

The base schema is a solid foundation, but several policies contradicted the rules in the build prompt. They are fixed in 002 rather than by editing your file:

- A facilitator could `UPDATE observations.status/approved_by` directly (self-approval). Now blocked by a guard trigger; status only changes inside workflow functions.
- Any project member (including other facilitators) could read **draft** observations. Drafts are now visible only to their author.
- HOD/management saw records regardless of workflow state. HOD now sees **approved** observations only (aggregate counts on the dashboard still include pending/queried so action items are visible).
- Any facilitator could edit **any** school/teacher, and `project_schools`/`project_teachers` writes had no project check. Writes now go through `upsert_school` / `upsert_teacher`, which check project scope.
- Colleagues' profiles were unreadable (names would show blank). Profiles are now readable for people who share a project with you.
- Uploaders could self-verify documents; storage reads were folder-based. Documents are immutable except through `set_document_status`; a storage object is readable only if its `documents` row is readable.
- `senior_facilitator` had **zero** permissions in the seed, which would have locked them out of field work. Fixed.
- Assignment history can no longer be rewritten or deleted (end + create instead); `replace_project_member` does this atomically.

## Setup

1. **Create a Supabase project.** In *Authentication → Providers/Settings*:
   - **Disable "Allow new users to sign up"** (accounts are invite-only).
   - Set Site URL to your deployed URL and add `https://YOUR-DOMAIN/set-password` to Redirect URLs.
   - Enable MFA (TOTP). Set minimum password length ≥ 10. Keep Supabase's default auth rate limits on.
2. **Run the migrations in order** (SQL editor or `supabase db push`): 001 → 005. All of 002-005 are safe to re-run.
3. **Bootstrap the first Super Admin.** Create your user in *Authentication → Users* (a profile row is created automatically), then:
   ```sql
   insert into user_roles(user_id, role_id)
   select u.id, r.id from auth.users u, roles r
   where u.email = 'you@yourorg.org' and r.name = 'super_admin';
   ```
4. **Deploy Edge Functions and secrets**
   ```bash
   supabase functions deploy admin-users request-access external-upload report-narrative
   supabase secrets set SITE_URL=https://YOUR-DOMAIN ALLOWED_ORIGINS=https://YOUR-DOMAIN IP_SALT=$(openssl rand -hex 16)
   # optional, enables "Draft with AI" on reports:
   supabase secrets set ANTHROPIC_API_KEY=... 
   ```
   `request-access` and `external-upload` are deployed with JWT verification off (see `supabase/config.toml`); they validate and rate-limit themselves. The service-role key exists only inside Edge Functions, never in the browser.
5. **Frontend**: `cp .env.example .env`, fill `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, then `npm install && npm run dev` (or `npm run build` and host `dist/` on any static host with SPA fallback to `index.html`).
6. Log in as Super Admin (you'll be asked to enrol an authenticator app), create a project, **Users → Invite user**, assign project roles under *Projects → Team*, add schools/teachers.

## How access works

Three layers, all enforced in Postgres (the UI only hides things):

1. **Global role** (`user_roles`) → **permissions** (`role_permissions`), e.g. `field.approve`.
2. **Project assignment** (`project_members`, with start/end dates) decides *which* project data you can touch.
3. **Row-level security + guard triggers** on every table; business rules live in `SECURITY DEFINER` functions that check both 1 and 2.

Observation workflow: `draft → submitted → under_review → (queried → resubmitted → under_review →) approved`. Every transition is a function call that writes `observation_status_history`, `audit_logs` and notifications. Approvers cannot approve their own observation. When a facilitator is replaced, the old assignment is ended (not deleted), old observations keep their original facilitator, and the new facilitator can see the project's **approved** history.

## Offline behaviour (facilitators)

- Observation drafts, evidence photos and a "submit when online" request are stored in IndexedDB and synced automatically when the connection returns (banner shows *Syncing…* / *Sync complete*). Autosave on every change.
- School/teacher lists are cached after the first online load of a project; the app shell is precached by the service worker. **First load and login need a connection.**
- API/Storage responses are deliberately **not** cached by the service worker (private data).
- Conflict rule: if the same draft was edited on two devices, the newer local copy wins on that device.

## Tests I ran (and what I did not)

Run against a local PostgreSQL 16 with a minimal stub of Supabase's `auth`/`storage` schemas (`supabase/tests/supabase_stub.sql`):

- Fresh build of 001→005, and re-run of 002→005 (idempotent): **clean**.
- `supabase/tests/acceptance.sql`: full lifecycle (add school/teacher → draft → self-approve attempt blocked → submit → review → query → resubmit → approve → HOD sees it → unrelated user sees nothing → facilitator replaced, new one sees history, original facilitator preserved → report/health/dashboard/analytics → audit rows).
- `supabase/tests/security_tests.sql`: **33 assertions, 33 pass** (RLS visibility, tamper attempts, immutability, anon access, internal functions not callable, token stored hashed, etc.).
- Frontend: `tsc` strict typecheck and `vite build` pass.

**Not verified - please treat as untested until you run them:**
- The frontend has not been exercised against a live Supabase project or in a browser (none was available here). Expect small integration fixes on first run.
- Edge Functions were written but not executed (no Deno/Supabase runtime here).
- Storage uploads use an XHR POST to the Storage REST endpoint (for progress); confirm against your project.
- Real Supabase differences from my stub (e.g. `auth.jwt()` claims, Realtime) are not covered.

## Known gaps / honest limitations

- **No malware scanning.** Uploads are type/size/magic-byte checked, stay `uploaded` until a human verifies them, and are served only via short-lived signed URLs. Add AV scanning (e.g. a Storage webhook) before going live with external uploads.
- **MFA is enforced in the app** for Super Admin/HOD, not at the database level.
- **Rate limiting** is custom only on `request-access` (per email and per hashed IP). Login throttling is Supabase Auth's built-in limits.
- **Reports**: on-screen, CSV and *Print → Save as PDF* (no server-side PDF). Qualitative sections group identical wording only; they don't cluster similar phrases. "Draft with AI" is optional and only sees the stored snapshot; a human must review it.
- Document requirement frequencies implemented: `once` and `monthly` (per-term/other frequencies are treated as `once`).
- No UI yet for removing a school/teacher from a project or a form builder (Forms page is read-only; extra template fields render in the observation form). The `upsert_*` functions already accept `is_active` for deactivation.
- Facilitator-to-school assignment is new (`school_facilitators`); "My schools" shows assigned ones with a switch to show all project schools.
- If a database insert fails after a file upload succeeds, an orphan file may remain (stored files are immutable by design; no delete policy).
- Retention settings are recorded policy only; nothing purges data automatically.
- Weekly HOD digest notifications are not implemented; the dashboard shows "approved this week".
