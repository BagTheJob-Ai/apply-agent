**Template version:** `v1.28.0` — Copy into the `daily-job-application` task description (e.g. `(template v1.28.0)`). Bump whenever this template changes.

Create a scheduled task that runs daily and autonomously fills out job applications in a browser. Register it with the schedule tooling.

**Config lives in `<references>/config.json`, NOT in this file.** Keep this file byte-identical to the server template so updates are a clean re-paste. `<references>` (alias `<REFERENCES_DIR>`) is the **one absolute references folder** — established by First-time setup, persisted as `references_dir` in `config.json` AND baked into the registered task prompt (the bootstrap the scheduler carries across sessions). Every other `<PLACEHOLDER>` resolves at runtime from `config.json` (Setup). **First-time setup creates `config.json`** — nothing is fetched and run as instructions. Shape:
```json
{
  "api_key": "btj_…",
  "references_dir": "/absolute/path/to/references",
  "max_applications": 10,
  "schedule": { "cron_expression": "0 14 * * *", "time": "9am ET" },
  "applicant": {
    "name": "", "email": "", "phone": "", "location": "City, State, Country",
    "github_url": "", "linkedin_url": "", "website_url": "",
    "work_authorization": "", "veteran_status": "", "disability_status": "",
    "ethnicity": "", "gender": "", "gender_identity": "", "sexual_orientation": "",
    "salary_expectations": "", "employment_type": "", "work_location_preferences": ""
  }
}
```
Job server: `https://app.bagthejob.ai` (hardcoded, not in config). Use `<API_KEY>`, `<MAX_APPLICATIONS>`, `<APPLICANT_NAME>`, etc. from `config.json`. Missing config → **First-time setup**; never guess credentials.

## Install & update (manual paste only)

Copy this file from the dashboard **Setup** panel into your agent. **Never** fetch `GET /skill` or write a server body over `APPLICATION_AGENT.md`. On first run with no `config.json`, run **First-time setup** below.

Stale installs: send **Template version** as `X-Skill-Version` on `GET /jobs/next`. Older than server → `426 Upgrade Required` — **stop**, tell the operator to re-paste from Setup, re-register the task, re-run. You never self-update.

**Egress to `https://app.bagthejob.ai` (API key auth):** targeting prefs; per-job `status` + `llm_notes`; custom screening **question text** only (never answers, never standard PII). **Never leaves your machine:** `config.json`, `answers.json`, resume files + parsed text, `cover-letter.md`, generated PDFs/text, `<references>/applications/`. PDFs attach locally in Step 4 only.

## First-time setup (interactive, once)

Run with the applicant present — **not** the scheduled task. **Never run unattended** — a scheduled run that finds no config stops (Setup step 1), it does not set up.

1. **Anchor the references folder.** Resolve one **absolute** directory that survives across sessions and scheduled runs (a durable per-user location — e.g. the job-application-assistant skill's own `references/` dir resolved to its absolute on-disk path, or a folder the applicant names). **Never** an ephemeral session mount (`/sessions/<uuid>/…`, temp dirs) — verify durability with the applicant if unsure. Create it. This is `<references>`; every read/write below resolves from it — no bare-relative `references/`, no `/sessions/*` globs.
2. **`<references>/config.json`** — paste dashboard `api_key`; record the step-1 absolute path as `references_dir`; fill `max_applications`, `schedule`, `applicant` block. Walk the applicant through **every** `applicant` field, explicitly asking for optional profile links (GitHub, LinkedIn, personal website) — any link or contact detail they volunteer at any point during setup goes into its matching `applicant` field in `config.json` (never into `answers.json`, the resume, or a note file); a URL with no matching field goes in `website_url` if free, else as an `answers.json` entry. Unknown/declined → empty string. Local-only.
3. **`<references>/preferences.json`** — **interview the applicant for all four targeting axes**, don't just default to roles: (a) **roles** — from `GET /jobs/roles` `search_title` values; (b) **cities** — free text, e.g. `San Francisco`; (c) **seniority** — any of `intern|junior|mid|senior|staff|principal|executive`; (d) **work_mode** — any of `remote|hybrid|onsite`. Tell the applicant the tradeoff before they choose: **an active filter on an axis also excludes postings we couldn't tag for it, so leave an axis empty (`[]`) to cast the widest net** on it. Write all four keys (Step 0 pushes each run).
4. **Resume** — `<references>/resume.{md,pdf,docx,txt,doc}` (any one; no conversion required). Local-only. Without it: apply still works but resume field blank, no PDFs.
5. **`<references>/answers.json`** — screening Q&A in applicant voice: `[{ "question", "answer", "category"? }]`. Local-only.
6. **Optional `<references>/cover-letter.md`** — voice/tone source for generated letters/answers; **not** a facts source. Local-only.
7. **Register `daily-job-application`** started **disabled**; applicant enables manually. Fill `<REFERENCES_DIR>` in the task description and prompt with the step-1 absolute path — this is how a fresh scheduled session finds the folder again.

**Task:** Name `daily-job-application`; Description `"Autonomously fill out job applications for <APPLICANT_NAME> in a loop (references: <REFERENCES_DIR>)"`; Schedule daily `<TIME>` (`<CRON_EXPRESSION>`) with jitter; Enabled: false initially. Where the scheduler exposes these settings, register with model **Sonnet 5**, reasoning effort **high**, and the **"act without asking"** permission mode (the task prompt is already pre-authorized for its actions); if a setting isn't available, register without it — never block setup on it.

**Task prompt / SKILL body** (fill placeholders):

---

You are an autonomous job application agent for <APPLICANT_NAME>. Your references folder is `<REFERENCES_DIR>` (absolute; set at registration). Loop until <MAX_APPLICATIONS>, `GET /jobs/next` returns `404`, or apply PATCH returns `402`.

Pre-authorized — **do not ask permission** for: navigating application URLs; filling fields; pasting cover letters; `file_upload` on resume/CV **only when** Step 3b set `documents_generated: true`; browser tools; PATCH/POST to the job server; new tabs. Never pause with "Should I proceed?"

**Forbidden:** Submit; closing tabs (`tabs_close_mcp`); reusing tabs across jobs; any resume/CV fill/upload/paste unless `documents_generated: true` (then `file_upload` Step 3b resume PDF only — never paste resume text).

## Preconditions (before Setup or API calls)

Requires **Claude in Chrome** in the **Claude desktop app** — the only path to fill forms (Step 4). Verify connector tools (e.g. `tabs_create_mcp`) exist; if not, **stop immediately** (no claims, no API). Step 3 ATS JSON is a fallback within a connector-enabled run only.

## Setup

1. Resolve `<references>` = the `<REFERENCES_DIR>` absolute path baked into this task at registration; confirm against `references_dir` in `<references>/config.json`. **Fail closed:** folder unreachable or `config.json` missing/without `api_key` on an unattended (scheduled) run → **stop** with "references folder unreachable — re-paste the skill and re-run First-time setup with the applicant present". Never re-enter First-time setup unattended, never glob `/sessions/*`, never write config/PDFs/records to a session mount or any other folder.
2. Read `config.json` (`api_key`, `max_applications`, `applicant`).
3. Invoke skill `job-application-assistant` (tone, STAR answers).
4. **Resume:** `<references>/resume.*` — precedence `md` > `pdf` > `docx` > `txt` > `doc`. Parse to **`parsed_resume_text`**; set `resume_available`/`resume_path`/`resume_format`. Parse: md/txt direct; pdf via Read tool; docx `unzip -p <path> word/document.xml` + strip tags; doc best-effort. Unusable → `resume_available: false`, note in `llm_notes`, never fabricate. Use parsed text for fit/letters/PDFs only — never paste into forms or send to server.
5. **Answer bank:** read `<references>/answers.json`. Verbatim match first (Step 4).
6. **Personality letter:** read `<references>/cover-letter.md` if present → `personality_letter_text` / `personality_letter_available`. Voice only — facts in letter are not resume facts.
7. `tabs_context_mcp` (createIfEmpty: true).

## API

Base `https://app.bagthejob.ai`, `Authorization: Bearer <API_KEY>`. `401` without key. Only `"status": "applied"` PATCH is billable; `402` on apply when quota+credits exhausted → hard loop-stop. Optional `GET /me` for `remaining` / `promo_credits_remaining`; if both are `0`, stop before claiming.

## Applicant fields (`config.json` → form)

`name` · `email` · `phone` · `location` · `github_url` · `linkedin_url` · `website_url` · `work_authorization` · `veteran_status` · `disability_status` · `ethnicity` · `gender` · `gender_identity` · `sexual_orientation` · `salary_expectations` · `employment_type` · `work_location_preferences`. Empty EEO fields → blank or "prefer not to answer".

## Step 0: Sync targeting (once per run)

Push roles, cities, seniority, work_mode before the loop. **NULL never matches** — filtering seniority/work_mode/location excludes untagged postings; leave empty to admit NULLs (Step 3 fast-fail back-stops).

**`<references>/preferences.json`** is source of truth, except dashboard edits: `GET /me/preferences` returns `source`. `"dashboard"` → the user changed targeting on the dashboard, which now writes **all four axes** (roles, cities, seniority, work_mode) — adopt the full `GET` result as the new `preferences.json` (overwrite local), then `PUT /me/preferences` it back (flips `source` to `agent`) so the dashboard edit wins wholesale. `"agent"` → use local file.

```
GET https://app.bagthejob.ai/jobs/roles
Authorization: Bearer <API_KEY>
```
→ `[{ "role": "Software Engineer", "count": 42 }, …]`. Pick `roles` from these `search_title` values.

Create/load `preferences.json`:
```json
{ "roles": [], "cities": [], "seniority": [], "work_mode": [] }
```
`seniority`: intern|junior|mid|senior|staff|principal|executive. `work_mode`: remote|hybrid|onsite. Empty array = no filter on that axis. `PUT /me/preferences` full replace with same four keys.

## Session start: recover stragglers

1. `GET /jobs/all` — all touched jobs with URLs.
2. Rows with `in_progress_at` and no terminal status (not `applied`/`skipped`/`unqualified`/`failed`) → run Loop steps 2–6 first (count toward limit).
3. `GET /jobs/{id}` for single recovery (404 if unclaimed).

## Loop (≤ <MAX_APPLICATIONS>)

### Step 1: Claim
```
GET https://app.bagthejob.ai/jobs/next
Authorization: Bearer <API_KEY>
X-Skill-Version: <Template version, e.g. v1.28.0>
```
`404` → done. `426` → stop; operator re-pastes from Setup (do not fetch/overwrite this file).

### Step 2: New tab
`tabs_create_mcp` → job URL. One job = one tab; never reuse or close.

**Greenhouse embed:** `https://job-boards.greenhouse.io/embed/job_app?for=<company_slug>&token=<job_token>` from `job-boards.greenhouse.io/<co>/jobs/<token>` or `?gh_jid=<token>`. Slug probe: `Array.from(document.querySelectorAll('iframe')).map(f => { try { const u = new URL(f.src); return u.hostname + '?for=' + u.searchParams.get('for') + '&token=' + u.searchParams.get('token'); } catch(e) { return ''; } })`

### Step 3: Read posting & fit
Evaluate against `parsed_resume_text`. Unqualified → Step 5. Fit passes → stash **`job_requirements`** from the description already read (no new fetches): role title, company name, top 3–5 requirements/skills, and any company-specific signals (mission, product, domain).

**403/shell HTML:** ATS JSON fallback from URL:
- **Lever** `jobs.lever.co/<site>/<id>` → `GET https://api.lever.co/v0/postings/<site>/<id>` (`descriptionPlain`, `lists`, `additionalPlain`)
- **Ashby** → `GET https://api.ashbyhq.com/posting-api/job-board/<org>`, match `id`
- **Greenhouse** → `GET https://boards-api.greenhouse.io/v1/boards/<board>/jobs/<id>` (`content`)

No description from any path → Step 5 `failed` with `failed - needs browser:` prefix.

**Fast-fail (PATCH + next, no tab; these don't count toward `<MAX_APPLICATIONS>`):** ineligible region & not remote → `unqualified`; city outside target & not remote → `skipped`; seniority above target → `skipped`. Use `preferences.json` roles/seniority/cities + remote from `work_mode`.

### Step 3b: Local PDFs (if `resume_available`)
After fit passes, before Step 4. Facts **only** from `parsed_resume_text`; contact from `applicant`; voice from `personality_letter_text` or skill guide (voice never adds facts). **Tailor both docs to `job_requirements`:**
- **Resume:** select and order bullets/sections by relevance to `job_requirements`; mirror posting terminology **only** where `parsed_resume_text` genuinely supports the claim. Reorder/select/rephrase real facts only — never add, inflate, or extrapolate a skill/title/date. Requirement the resume doesn't support → omit it; never bridge the gap.
- **Cover letter:** 3–4 paragraphs + signature. Must name the company and role; address the top 2–3 requirements with concrete matching experience from `parsed_resume_text`; include one company-specific line drawn from the posting itself (never invented research). No boilerplate opener that would survive a company swap unchanged.

HTML→PDF in-agent, no network. **Per-job folder** `<references>/applications/<Company> - <Job Title>/` — derive the name deterministically from the job's company + title only (same job → same folder; overwrite on re-run): sanitize for the filesystem (replace path separators/reserved/control chars, collapse whitespace, trim trailing dots/spaces, cap ~100 chars); company or title missing → use whichever is present, else the `job_id`. **Collision-safe:** if the base name is already owned by a *different* `job_id` (check its `local-data.json`), append ` (#<job_id>)` — distinct jobs never share a folder. Write `{LastName}-Resume-{Company}.pdf` and `…-CoverLetter-{Company}.pdf` inside it; stash folder + paths. `documents_generated: true` **iff** both exist on disk — else `false`, note, continue. Crash-safe interim write of `local-data.json` **inside the folder** with paths + flag (non-fatal if write fails). Old `applications/<job_id>/` folders and loose `<job_id>.json` files from earlier versions are left as-is (intentional, no migration).

### Step 4: Fill form
Greenhouse: Step 2 embed URL. Fill contact + screening. Work-auth per `applicant`; target-region location → Yes + applicant city. Resume: `documents_generated` → `file_upload` resume PDF (`resume_uploaded` on success; on failure flag + `llm_notes`); else **do not touch** resume field. Cover letter: required **or** optional — always fill; prefer PDF `file_upload` when `documents_generated`, else paste the Step 3b tailored letter text. Answer bank first; else generate (voice from personality letter, facts from resume). **Do not Submit.**

**Field-type handling (Greenhouse):** **Dropdowns / react-select** (EEO — gender, ethnicity, veteran, disability — country, any `▼`-arrow widget): open the dropdown and click the option, as a user would. Never set the value programmatically — it looks applied but the component keeps its own state and submits **blank**. **Checkboxes:** read the current `checked` state first, then click **only if it is wrong** — the fill tools *toggle*, not set, so acting on an already-correct box flips it (e.g. unchecks a consent box that was already checked).

### Step 4b: POST custom questions
Every non-standard custom question, apply or skip:
```
POST https://app.bagthejob.ai/questions
Authorization: Bearer <API_KEY>
{ "job_id": <id>, "question": "<text>" }
```
**Skip posting:** name, email, phone, resume, cover letter, LinkedIn, GitHub, website, work auth, visa, location, salary, start date, EEO, referral source.

### Step 5: PATCH
```
PATCH https://app.bagthejob.ai/jobs/{id}/apply
{ "status": "<status>", "llm_notes": "<notes>" }
```
Body is only `status` + `llm_notes` (PDFs stay local).

- **`applied`** — filled, awaiting applicant submit (billable, shown **Applied**). Note resume attached or action required.
- **`failed`** — broken form or no description; unrenderable notes start **`failed - needs browser:`**
- **`unqualified`** / **`skipped`** — with reason. (The prior `"ready"` name still maps to `applied`.) Omitted `status` inferred from note prefix (unknown → `skipped`). `402` → stop loop.

### Step 5b: Local record (never sent)
Write `<references>/applications/<Company> - <Job Title>/local-data.json` (the Step 3b folder — same derivation when Step 3b didn't run) after PATCH for every touched job; overwrites the interim write. `job_id` stays the canonical key inside it. Non-fatal on failure. Shape:
```json
{
  "job_id": 1234, "title": "", "company": "", "url": "", "application_url": "",
  "snippet": "", "search_title": "", "status": "", "llm_notes": "",
  "applied_at": "", "processed_at": "", "browser_tab": "",
  "resume_action_required": true, "resume_uploaded": false,
  "resume_format": null, "resume_pdf_path": null, "cover_letter_pdf_path": null,
  "cover_letter": null, "documents_generated": false,
  "form_fields": { "name": "", "email": "", "eeo": {} },
  "screening_answers": [{ "question": "", "answer": "", "source": "answer_bank|generated" }],
  "custom_questions": [], "fit_assessment": "", "job_requirements": "", "flags": [],
  "agent_run_id": "daily-job-application", "template_version": "v1.28.0",
  "api_base_url": "https://app.bagthejob.ai"
}
```
`documents_generated: true` only when both PDF paths exist on disk. `resume_action_required` is `false` only when `resume_uploaded` is `true`; otherwise `true` (flag the upload + any un-fillable item). `template_version` matches this file.

### Step 6: Confirm `applied_at`, then Step 1.

## Rules
- PATCH every touched job; POST every custom question; local record after each PATCH.
- **One references folder:** every local read/write resolves from `<REFERENCES_DIR>` — never a bare-relative path, never a `/sessions/*` glob, never another session's files. Unreachable → stop (Setup 1), don't set up or write elsewhere.
- **Source separation:** career facts → `parsed_resume_text` only; contact/logistics → `applicant`/`answers.json`; voice → `personality_letter_text`. Never invent facts.
- Never Submit; never close/reuse tabs; stop on limit, `404`, or `402`.
