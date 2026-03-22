# Graphics.h AI Assistant — Architecture Plan

> **Stack:** Cloudflare Worker + D1 + Gemini API  
> **Date:** March 2026

---

## Table of Contents

1. [What We're Building](#1-what-were-building)
2. [User Types](#2-user-types)
3. [Architecture — Who Does What](#3-architecture--who-does-what)
4. [Auth Verification (Anti-Spoof)](#4-auth-verification-anti-spoof)
5. [Three Request Types](#5-three-request-types)
6. [Filename Rules](#6-filename-rules)
7. [Workflow — Guest User](#7-workflow--guest-user)
8. [Workflow — Logged-in User](#8-workflow--logged-in-user)
9. [Error Auto-Fix Flow](#9-error-auto-fix-flow)
10. [API Key Failover](#10-api-key-failover)
11. [D1 Database — 5 Tables](#11-d1-database--5-tables)
12. [Sliding Window Rate Limiting](#12-sliding-window-rate-limiting)
13. [Worker Processing Pipeline](#13-worker-processing-pipeline)
14. [Worker Endpoint Design](#14-worker-endpoint-design)
15. [System Instruction](#15-system-instruction)
16. [SQL Schema](#16-sql-schema)
17. [Config](#17-config)
18. [Quick Reference Tables](#18-quick-reference-tables)
19. [Future Improvements](#19-future-improvements)

---

## 1. What We're Building

An AI code assistant inside the Graphics.h Online Compiler. Users describe what they want in plain English, and Gemini generates complete Turbo C / BGI graphics code. The generated code auto-compiles, auto-fixes errors, and the user can apply or reject the result.

---

## 2. User Types

| | Guest (not signed in) | Logged-in (Google sign-in) |
|---|---|---|
| **Who** | Anyone using the site without signing in | Users who signed in with Google to save files to cloud |
| **Auth** | FingerprintJS visitor ID | Google email via JWT session cookie |
| **Files saved?** | No — code only shown in editor, not saved | Yes — files saved to `AI/` folder in cloud |
| **Filename?** | Gemini returns it, Worker **strips** it from response | Included in response (e.g., `ai_starfield.cpp`) |
| **Sessions** | Multiple (per page load) but **invisible** to guest — stored for analytics only | Multiple — full history visible, switchable |
| **Limit** | 10 requests / 12h window | 20 requests / 12h window |
| **Data stored?** | Yes, in `guest_logs` (guest can't see it) | Yes, in `logged_sessions` (visible as history) |

---

## 3. Architecture — Who Does What

### Decision: Worker parses Gemini's response

The **Worker** parses, validates, and cleans Gemini's output. The frontend receives a clean JSON object. This is the right approach because:

- **Security** — The Worker is the only trusted layer. Raw Gemini output should never reach the frontend.
- **Storage** — The Worker needs to extract `generated_code`, `chat_response`, `generated_filename` to store in D1 anyway. Parse once, not twice.
- **Validation** — Worker validates code size (max 500 lines / 15KB), filename format, and strips fields for guests.
- **Consistency** — If Gemini wraps output in markdown fences or adds preamble, the Worker handles it. Frontend never sees broken responses.

### Gemini always returns filename

One system instruction for both user types. Gemini always returns `{ filename, code, chat }`. The Worker:
- **Logged-in:** includes `filename` in response, saves file to cloud
- **Guest:** strips `filename` from response, but still stores it in `guest_logs.generated_filename` for analytics

### Full proxy chain

```
Frontend (compiler.html + ai.js)
    │  fetch('/api/ai', { ... })
    │  Cookie: session=<JWT>  (if logged in)
    ▼
Flask Backend (app.py)
    │  proxy_request() → forwards to AI Worker
    │  Rewrites cookies, logs operation
    ▼
AI Worker (graphics-oc-ai)
    │  1. Verify JWT from cookie → logged-in or guest?
    │  2. Check rate limits (sliding window)
    │  3. Call Gemini API (with failover)
    │  4. Parse Gemini response (extract filename, code, chat)
    │  5. Validate (size limits, filename format)
    │  6. Store in D1 (guest_logs or logged_sessions)
    │  7. Strip filename for guests
    │  8. Return clean JSON to frontend
    ▼
Frontend receives clean JSON → renders chat + code in editor
```

---

## 4. Auth Verification (Anti-Spoof)

**The frontend NEVER tells the Worker "I am logged in."** The Worker decides for itself by verifying the JWT session cookie. No cookie or invalid JWT = guest. This cannot be spoofed.

### How it works on every AI request

```
POST /api/ai arrives at Worker

Step 1: Extract session cookie
    → Cookie: session=eyJhbGciOiJIUzI1NiIs...
    → No cookie? → GUEST (must have fingerprint_id in body)

Step 2: Verify JWT signature
    → jwt.verify(token, SESSION_SECRET)
    → Invalid/expired? → GUEST
    → Valid? → extract email from payload

Step 3: Look up user in D1
    → SELECT * FROM logged_users WHERE user_email = ?
    → Not found? → Create row (first-time user)
    → Found? → LOGGED-IN USER confirmed

Result:
    Logged-in → logged_users + logged_sessions tables
                → include filename in response
                → rate limit: 20 req / 12h

    Guest     → guest_info + guest_logs tables
                → strip filename from response
                → rate limit: 10 req / 12h
```

### Why this can't be spoofed

- **JWT is signed with a secret only the Worker knows** — stored as a Cloudflare Worker secret (`wrangler secret put SESSION_SECRET`)
- **The same `SESSION_SECRET` must be shared with the existing `graphics-oc-files` Worker** — otherwise logged users will be treated as guests
- **Worker ignores `fingerprint_id` and `email` from the request body if a valid JWT exists** — the JWT always wins
- **Body `email` is ignored** — the Worker uses the email from the verified JWT payload

---

## 5. Three Request Types

### `new` — First message in a session

| | Guest | Logged-in |
|---|---|---|
| **Sends** | `type`, `user_query`, `fingerprint_id`, `session_id` | `type`, `user_query`, `session_id` *(email from JWT)* |
| **Returns** | `generated_code`, `chat`, `session_id`, `version`, `request_id` | Same + `filename` |

### `edit` — Follow-up in same session

| | Guest | Logged-in |
|---|---|---|
| **Sends** | `type`, `user_query`, `current_code`, `fingerprint_id`, `session_id` | Same + `filename` *(email from JWT)* |
| **Returns** | `generated_code`, `chat`, `version` | Same + `filename` |

If user clicked **Reject**, `current_code` is omitted. If user **ignored** (sent new msg without Apply/Reject), frontend force-applies then sends `current_code`.

### `error` — Auto-triggered on compile failure (max 2 attempts)

| | Guest | Logged-in |
|---|---|---|
| **Sends** | `type`, `generated_code`, `error`, `fix_attempt`, `fingerprint_id`, `session_id` | Same + `filename` |
| **Returns** | `generated_code`, `chat`, `version` | Same + `filename` |

---

## 6. Filename Rules

Gemini **always** returns a filename. The Worker strips it for guests.

**For logged-in users:**
- Default extension: `.cpp` — use `.c` only if user explicitly says "write in C"
- Always starts with `ai_` prefix
- Descriptive, under 30 characters, lowercase + underscores
- Files saved in `AI/` folder in user's workspace
- **Edit requests:** same topic → keep filename. Different topic → new filename.
- **Error requests:** always keep the same filename.

```
WORKSPACE (logged-in user)
├── main/
│   ├── mycode.cpp
│   └── code.cpp
└── AI/
    ├── ai_starfield.cpp
    ├── ai_bouncing_ball.cpp
    └── ai_house_scene.c      ← user asked for .c code
```

---

## 7. Workflow — Guest User

### Important: Guest sessions are per page load

Every time a guest loads/reloads the page, the frontend generates a **new `session_id`** (format: `gs_` + timestamp + `_` + random). The guest never sees or controls sessions. Their `fingerprint_id` ties all sessions together for analytics.

---

### 7.1 Guest sends `new` request

**Frontend sends:**

```json
{
  "type": "new",
  "user_query": "Create a twinkling starfield",
  "fingerprint_id": "fp_abc123",
  "session_id": "gs_1711000000_abc"
}
```

**Worker does:**

```
1. No session cookie → GUEST
2. Look up guest_info WHERE fingerprint_id = 'fp_abc123'
   → Not found? Create row with total_requests=0, window_requests=0, window_start=now
3. Check: now > window_start + 12h? → if yes, reset window_requests to 0
4. Check: window_requests < 10? ✓
5. Check: now - last_request_at > 3s? ✓
6. Call Gemini → parse response → extract { filename, code, chat }
7. Validate: code < 500 lines, < 15KB
```

**DB writes:**

`guest_info` — UPDATE:

```sql
UPDATE guest_info
SET total_requests = total_requests + 1,
    window_requests = 1,
    window_start = '2026-03-20T10:00:00Z',
    last_request_at = '2026-03-20T10:00:00Z'
WHERE fingerprint_id = 'fp_abc123'
```

`guest_logs` — INSERT:

```sql
INSERT INTO guest_logs
  (id, session_id, fingerprint_id, version, request_type, user_query,
   generated_code, generated_filename, chat_response, fix_attempt, api_key_used)
VALUES
  ('gl_001', 'gs_1711000000_abc', 'fp_abc123', 'v1', 'new',
   'Create a twinkling starfield',
   '#include<graphics.h>...',
   'ai_starfield.cpp',
   'Here is a starfield with 200 twinkling stars...',
   0, 'primary')
```

`daily_usage` — UPSERT:

```sql
INSERT INTO daily_usage (date, total_requests, guest_requests, primary_key_calls, last_request_at)
VALUES ('2026-03-20', 1, 1, 1, '2026-03-20T10:00:00Z')
ON CONFLICT(date) DO UPDATE SET
  total_requests = total_requests + 1,
  guest_requests = guest_requests + 1,
  primary_key_calls = primary_key_calls + 1,
  last_request_at = '2026-03-20T10:00:00Z'
```

**Frontend receives (filename STRIPPED):**

```json
{
  "generated_code": "#include<graphics.h>\n...",
  "chat": "Here's a starfield with 200 twinkling stars...",
  "session_id": "gs_1711000000_abc",
  "version": "v1",
  "request_id": "gl_001"
}
```

**Frontend does:**
- Shows code in editor with blue highlights (no file created, no AI/ folder)
- Shows chat in AI panel
- Shows [Reject] [Apply] buttons
- Auto-triggers Compile & Run

---

### 7.2 Guest clicks Apply → sends `edit` request

User clicked Apply → `generated_code` becomes `current_code` in frontend memory.

`PATCH /api/ai/action` → `{ request_id: "gl_001", action: "apply" }` updates `guest_logs.user_action`.

User types: "Add shooting stars every few seconds"

**Frontend sends:**

```json
{
  "type": "edit",
  "user_query": "Add shooting stars every few seconds",
  "current_code": "#include<graphics.h>\n...the applied starfield code...",
  "fingerprint_id": "fp_abc123",
  "session_id": "gs_1711000000_abc"
}
```

**DB writes:**

```sql
-- guest_info
UPDATE guest_info
SET total_requests = total_requests + 1,
    window_requests = 2,
    last_request_at = '2026-03-20T10:05:00Z'
WHERE fingerprint_id = 'fp_abc123'

-- guest_logs
INSERT INTO guest_logs
  (id, session_id, fingerprint_id, version, request_type, user_query,
   generated_code, generated_filename, chat_response, fix_attempt, api_key_used)
VALUES
  ('gl_002', 'gs_1711000000_abc', 'fp_abc123', 'v2', 'edit',
   'Add shooting stars every few seconds',
   '#include<graphics.h>...updated code...',
   'ai_starfield.cpp',
   'Added shooting stars using line()...',
   0, 'primary')
```

**Frontend receives:**

```json
{
  "generated_code": "#include<graphics.h>\n...updated code with shooting stars...",
  "chat": "Added shooting stars using line()...",
  "session_id": "gs_1711000000_abc",
  "version": "v2",
  "request_id": "gl_002"
}
```

---

### 7.3 Guest reloads the page

```
All frontend state is LOST:
  - current_code = null
  - generated_code = null
  - chat history = gone

Frontend generates NEW session_id: gs_1711000345_def
FingerprintJS returns SAME visitor ID: fp_abc123

Guest types "Make a bouncing ball"
  → type: "new" (fresh start, no context)
  → session_id: gs_1711000345_def  ← different from before
```

**DB writes:**

```sql
INSERT INTO guest_logs
  (id, session_id, fingerprint_id, version, request_type, user_query,
   generated_code, generated_filename, chat_response, fix_attempt, api_key_used)
VALUES
  ('gl_003', 'gs_1711000345_def', 'fp_abc123', 'v1', 'new',
   'Make a bouncing ball',
   '#include<graphics.h>...bouncing ball code...',
   'ai_bouncing_ball.cpp',
   'Here is a bouncing ball animation...',
   0, 'primary')
```

**Result in D1 — two sessions for this guest:**

```
guest_logs:
┌────────────────────────┬─────┬──────┬──────────────────────────┐
│ session_id             │ ver │ type │ user_query               │
├────────────────────────┼─────┼──────┼──────────────────────────┤
│ gs_1711000000_abc      │ v1  │ new  │ Create a twinkling...    │
│ gs_1711000000_abc      │ v2  │ edit │ Add shooting stars       │
│ gs_1711000345_def      │ v1  │ new  │ Make a bouncing ball     │
└────────────────────────┴─────┴──────┴──────────────────────────┘

All tied by fingerprint_id = fp_abc123
```

**Analytics queries:**

```sql
-- All sessions by a specific guest
SELECT DISTINCT session_id, MIN(created_at) as started, COUNT(*) as messages
FROM guest_logs
WHERE fingerprint_id = 'fp_abc123'
GROUP BY session_id
ORDER BY started DESC

-- Full chat for one session
SELECT version, request_type, user_query, chat_response, generated_code
FROM guest_logs
WHERE session_id = 'gs_1711000000_abc'
ORDER BY created_at ASC
```

---

### 7.4 Guest hits rate limit

```
Guest has made 10 requests in the current 12h window.
→ Worker: window_requests (10) >= MAX (10)
→ Returns:

{ "error": "Free limit reached (10/10). Resets in 2h 15m.", "code": "LIMIT_REACHED" }

2 hours later (window expired):
→ window_requests reset to 0, window_start = now
→ total_requests keeps counting (was 10, now 11)
```

---

## 8. Workflow — Logged-in User

### 8.1 Logged-in user sends `new` request

**Frontend sends:**

```json
{
  "type": "new",
  "user_query": "Create a twinkling starfield",
  "session_id": "sess_xyz789"
}
```

Cookie `session=eyJhbGci...` is sent automatically by the browser.

**Worker does:**

```
1. Extract session cookie → verify JWT → valid → email: soham@gmail.com
2. Look up logged_users WHERE user_email = 'soham@gmail.com'
3. Check sliding window: window_requests < 20? ✓
4. Call Gemini → parse → extract { filename, code, chat }
```

**DB writes:**

```sql
-- logged_users
UPDATE logged_users
SET total_requests = total_requests + 1,
    window_requests = 1,
    window_start = '2026-03-20T21:00:00Z',
    last_request_at = '2026-03-20T21:00:00Z'
WHERE user_email = 'soham@gmail.com'

-- logged_sessions
INSERT INTO logged_sessions
  (id, user_email, session_id, session_title, version, request_type, user_query,
   generated_code, generated_filename, chat_response, fix_attempt, api_key_used)
VALUES
  ('ls_001', 'soham@gmail.com', 'sess_xyz789', 'Starfield animation', 'v1', 'new',
   'Create a twinkling starfield',
   '#include<graphics.h>...',
   'ai_starfield.cpp',
   'Here is a starfield with 200 twinkling stars...',
   0, 'primary')

-- daily_usage
INSERT INTO daily_usage (date, total_requests, user_requests, primary_key_calls, last_request_at)
VALUES ('2026-03-20', 1, 1, 1, '2026-03-20T21:00:00Z')
ON CONFLICT(date) DO UPDATE SET
  total_requests = total_requests + 1,
  user_requests = user_requests + 1,
  primary_key_calls = primary_key_calls + 1,
  last_request_at = '2026-03-20T21:00:00Z'
```

**Frontend receives (filename INCLUDED):**

```json
{
  "filename": "ai_starfield.cpp",
  "generated_code": "#include<graphics.h>\n...",
  "chat": "Here's a starfield with 200 twinkling stars...",
  "session_id": "sess_xyz789",
  "version": "v1",
  "request_id": "ls_001"
}
```

**Frontend does:**
- `AI/` folder appears in file tree
- `ai_starfield.cpp` appears inside it
- New editor tab opens with generated code
- Auto-triggers Compile & Run
- On Apply → file saved to cloud via existing `/api/file/save`

---

### 8.2 Logged-in user sends `edit` request

User clicked Apply, then types: "Add shooting stars every few seconds"

**Frontend sends:**

```json
{
  "type": "edit",
  "user_query": "Add shooting stars every few seconds",
  "current_code": "#include<graphics.h>\n...the applied starfield code...",
  "filename": "ai_starfield.cpp",
  "session_id": "sess_xyz789"
}
```

**DB writes:**

```sql
INSERT INTO logged_sessions
  (id, user_email, session_id, session_title, version, request_type, user_query,
   generated_code, generated_filename, chat_response, fix_attempt, api_key_used)
VALUES
  ('ls_002', 'soham@gmail.com', 'sess_xyz789', 'Starfield animation', 'v2', 'edit',
   'Add shooting stars every few seconds',
   '#include<graphics.h>...updated code...',
   'ai_starfield.cpp',
   'Added shooting stars using line()...',
   0, 'primary')
```

**Frontend receives:**

```json
{
  "filename": "ai_starfield.cpp",
  "generated_code": "#include<graphics.h>\n...updated code...",
  "chat": "Added shooting stars using line()...",
  "session_id": "sess_xyz789",
  "version": "v2",
  "request_id": "ls_002"
}
```

---

### 8.3 Logged-in user starts new session

```
User clicks "+ New Session"
  → Context reset (current_code, chat)
  → Previous session appears in HISTORY sidebar:
    "Starfield animation — 2 min ago"
  → User can click it to view past chat (read-only)
```

**Session history query:**

```sql
SELECT session_id, session_title,
       MIN(created_at) as started,
       MAX(created_at) as last_active,
       COUNT(*) as messages
FROM logged_sessions
WHERE user_email = 'soham@gmail.com'
GROUP BY session_id
ORDER BY last_active DESC
```

---

## 9. Error Auto-Fix Flow

```
1. AI generates code → auto-compile → ERROR
   "Undefined symbol 'shootX'"

2. Frontend auto-sends (fix_attempt = 1):
   { type: "error", generated_code: "...", error: "Undefined symbol...", fix_attempt: 1 }

   Chat shows: ⚡ Auto-fixing (attempt 1/2)...
   Gemini fixes it → auto-compile → SUCCESS
   [Reject] [Apply] buttons appear

3. If STILL fails:
   fix_attempt = 2 → auto-sends again
   Gemini tries → auto-compile → STILL ERROR
   fix_attempt = 2 (max) → STOP
   Chat: ✗ Max fix attempts reached. Describe the issue manually.
```

**Error request DB insert (guest example):**

```sql
INSERT INTO guest_logs
  (id, session_id, fingerprint_id, version, request_type, user_query,
   generated_code, generated_filename, chat_response,
   error_message, fix_attempt, api_key_used)
VALUES
  ('gl_004', 'gs_1711000000_abc', 'fp_abc123', 'v3', 'error',
   '',
   '#include<graphics.h>...fixed code...',
   'ai_starfield.cpp',
   'Fixed! Declared shootX before the loop.',
   'Undefined symbol shootX in function main',
   1, 'secondary')
```

---

## 10. API Key Failover

Two Gemini API keys from 2 different Google accounts, stored as Worker secrets.

```
1. Try PRIMARY key
   → Success → return result, log api_key_used = "primary"
   → 429 Rate Limited → mark limited for 60s → try step 2
   → Other error → throw (no failover for non-rate errors)

2. Try SECONDARY key
   → Success → return result, log api_key_used = "secondary"
   → 429 → mark limited → step 3

3. Both limited
   → Return: { error: "AI is temporarily busy. Try again in a minute.", code: "API_DOWN" }
```

---

## 11. D1 Database — 5 Tables

| Table | Purpose | Scale |
|---|---|---|
| `guest_info` | One row per guest. Identity + sliding window rate limit. | ~thousands |
| `guest_logs` | One row per guest request. Has `fingerprint_id` + `generated_filename`. | ~tens of thousands |
| `logged_users` | One row per signed-in user. Identity + sliding window rate limit. | ~hundreds |
| `logged_sessions` | One row per logged-in request. Sessions + chat + code + filename. | ~thousands |
| `daily_usage` | One row per day. Platform-wide analytics. | ~365/year |

### `guest_info`

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `fingerprint_id` | TEXT UNIQUE INDEX | FingerprintJS visitor ID |
| `total_requests` | INTEGER | **Lifetime total. NEVER resets.** |
| `window_requests` | INTEGER | Requests in current window. Resets when expired. |
| `window_start` | TEXT | When current window started (ISO 8601) |
| `last_request_at` | TEXT | For 3-second cooldown |
| `created_at` | TEXT | First seen |

### `guest_logs`

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `session_id` | TEXT INDEX | Groups requests per page load |
| `fingerprint_id` | TEXT INDEX | Ties sessions across reloads |
| `version` | TEXT | v1, v2, v3... |
| `request_type` | TEXT | new / edit / error |
| `user_query` | TEXT | What user typed |
| `generated_code` | TEXT | Gemini's code output |
| `generated_filename` | TEXT | Gemini's filename (stored for analytics, NOT sent to guest) |
| `chat_response` | TEXT | Gemini's explanation |
| `error_message` | TEXT | Compile error (type=error only) |
| `fix_attempt` | INTEGER | 0 = normal, 1-2 = auto-fix |
| `user_action` | TEXT | apply / reject / force_apply (updated via PATCH) |
| `api_key_used` | TEXT | primary / secondary |
| `created_at` | TEXT | Timestamp |

### `logged_users`

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `user_email` | TEXT UNIQUE INDEX | Google email |
| `user_name` | TEXT | Display name from Google |
| `total_requests` | INTEGER | **Lifetime total. NEVER resets.** |
| `window_requests` | INTEGER | Resets when window expires |
| `window_start` | TEXT | Window start |
| `last_request_at` | TEXT | Cooldown |
| `created_at` | TEXT | Account creation |

### `logged_sessions`

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `user_email` | TEXT INDEX | Owner |
| `session_id` | TEXT INDEX | Groups requests into a session |
| `session_title` | TEXT | Auto-set from first query |
| `version` | TEXT | v1, v2, v3... |
| `request_type` | TEXT | new / edit / error |
| `user_query` | TEXT | User's message |
| `generated_code` | TEXT | Gemini's code |
| `generated_filename` | TEXT | Filename Gemini returned |
| `chat_response` | TEXT | Gemini's explanation |
| `error_message` | TEXT | Compile error if any |
| `fix_attempt` | INTEGER | 0-2 |
| `user_action` | TEXT | apply / reject / force_apply |
| `api_key_used` | TEXT | primary / secondary |
| `created_at` | TEXT | Timestamp |

### `daily_usage`

| Column | Type | Description |
|---|---|---|
| `date` | TEXT PK | YYYY-MM-DD (one row per day) |
| `total_requests` | INTEGER | All requests today |
| `guest_requests` | INTEGER | Guest only |
| `user_requests` | INTEGER | Logged-in only |
| `error_requests` | INTEGER | Auto-error fixes |
| `primary_key_calls` | INTEGER | Primary API key usage |
| `secondary_key_calls` | INTEGER | Secondary API key usage |
| `total_input_tokens` | INTEGER | Tokens sent to Gemini |
| `total_output_tokens` | INTEGER | Tokens received |
| `unique_guests` | INTEGER | Distinct fingerprints |
| `unique_users` | INTEGER | Distinct emails |
| `last_request_at` | TEXT | Last request time |

---

## 12. Sliding Window Rate Limiting

Both `guest_info` and `logged_users` use the same mechanism. No cron jobs — the Worker checks on every request and resets lazily.

```
On every request:
  1. Load user row
  2. Is now > window_start + RESET_HOURS?
     YES → reset: window_requests = 0, window_start = now
     NO  → keep current values
  3. Is window_requests >= MAX?
     YES → return LIMIT_REACHED with time remaining
     NO  → continue
  4. Is now - last_request_at < 3 seconds?
     YES → return COOLDOWN
     NO  → continue
  5. After Gemini call succeeds:
     total_requests += 1       ← NEVER resets
     window_requests = new     ← either old+1 or 1 (if window just reset)
     last_request_at = now
```

**Example:**

```
10:00 AM  → first request    → window_requests=1,  total_requests=1
 9:00 PM  → request #10      → window_requests=10  (LIMIT REACHED)
 9:30 PM  → blocked          → "Resets in 30m"
10:01 PM  → window expired   → window_requests=1   (reset), total_requests=11 (keeps going)
```

---

## 13. Worker Processing Pipeline

```
 1. Parse request body
    → Validate: user_query < 2000 chars, current_code < 15KB
    → Validate: type is "new" | "edit" | "error"

 2. Identify user
    → Verify JWT cookie → valid? → LOGGED-IN (email from JWT)
    → No valid JWT? → GUEST (fingerprint_id from body)
    → Neither? → return 400

 3. Rate limit check (sliding window)
    → If window expired → reset
    → If window_requests >= max → return LIMIT_REACHED
    → If cooldown not elapsed → return COOLDOWN

 4. Pick API key
    → Check api_key_status → primary or secondary (with failover)

 5. Build Gemini prompt
    → System instruction loaded from system-instruction.md
    → type="new":   system_instruction + user_query
    → type="edit":  system_instruction + current_code + user_query [+ filename if logged]
    → type="error": system_instruction + generated_code + error [+ filename if logged]

 6. Call Gemini API (with failover)

 7. Parse Gemini response
    → Strip markdown fences if present
    → JSON.parse → extract { filename, code, chat }

 8. Validate
    → Code < 500 lines, < 15KB
    → Filename starts with ai_, ends with .cpp or .c

 9. Determine version
    → SELECT COUNT(*) FROM [table] WHERE session_id = ? → +1

10. Write to D1
    → UPDATE guest_info or logged_users
    → INSERT into guest_logs or logged_sessions
    → UPSERT daily_usage
    → UPDATE api_key_status

11. Build response
    → Guest: strip filename
    → Logged-in: include filename

12. Return clean JSON
```

---

## 14. Worker Endpoint Design

### `POST /api/ai` — Main AI endpoint

**Request body:**

```json
{
  "type": "new | edit | error",
  "user_query": "Create a starfield",
  "current_code": "...",
  "filename": "ai_starfield.cpp",
  "error": "Undefined symbol...",
  "fix_attempt": 1,
  "session_id": "gs_1711000000_abc",
  "fingerprint_id": "fp_abc123"
}
```

`session_id` is **ALWAYS required**. Frontend generates it on page load (guest) or new session (user). Auth is via the `session` cookie (JWT), not anything in the request body.

**Success response:**

```json
{
  "filename": "ai_starfield.cpp",
  "generated_code": "#include<graphics.h>...",
  "chat": "Here's a starfield...",
  "session_id": "gs_1711000000_abc",
  "version": "v1",
  "request_id": "gl_001"
}
```

`filename` only present for logged-in users.

**Error response:**

```json
{
  "error": "Free limit reached (10/10). Resets in 2h 15m.",
  "code": "LIMIT_REACHED | COOLDOWN | API_DOWN | MAX_FIX_ATTEMPTS"
}
```

### `PATCH /api/ai/action` — Apply / Reject

```json
{
  "request_id": "gl_001",
  "action": "apply | reject"
}
```

Updates `user_action` column in `guest_logs` or `logged_sessions`.

---

## 15. System Instruction

The Gemini system instruction is maintained in **`system-instruction.md`**.

The Worker loads it and sends it with every Gemini API call. One instruction for both user types — Gemini always returns `{ filename, code, chat }`. The Worker strips `filename` for guests after parsing.

---

## 16. SQL Schema

```sql
-- Run: wrangler d1 execute graphicsh-ai --file=schema.sql

CREATE TABLE IF NOT EXISTS guest_info (
  id TEXT PRIMARY KEY,
  fingerprint_id TEXT NOT NULL UNIQUE,
  total_requests INTEGER NOT NULL DEFAULT 0,
  window_requests INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL,
  last_request_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gi_fp ON guest_info(fingerprint_id);

CREATE TABLE IF NOT EXISTS guest_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  fingerprint_id TEXT NOT NULL,
  version TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK(request_type IN ('new','edit','error')),
  user_query TEXT NOT NULL,
  generated_code TEXT NOT NULL,
  generated_filename TEXT NOT NULL,
  chat_response TEXT NOT NULL,
  error_message TEXT,
  fix_attempt INTEGER NOT NULL DEFAULT 0,
  user_action TEXT CHECK(user_action IN ('apply','reject','force_apply')),
  api_key_used TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gl_session ON guest_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_gl_fp ON guest_logs(fingerprint_id);

CREATE TABLE IF NOT EXISTS logged_users (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL UNIQUE,
  user_name TEXT NOT NULL,
  total_requests INTEGER NOT NULL DEFAULT 0,
  window_requests INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL,
  last_request_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lu_email ON logged_users(user_email);

CREATE TABLE IF NOT EXISTS logged_sessions (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  session_id TEXT NOT NULL,
  session_title TEXT,
  version TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK(request_type IN ('new','edit','error')),
  user_query TEXT NOT NULL,
  generated_code TEXT NOT NULL,
  generated_filename TEXT NOT NULL,
  chat_response TEXT NOT NULL,
  error_message TEXT,
  fix_attempt INTEGER NOT NULL DEFAULT 0,
  user_action TEXT CHECK(user_action IN ('apply','reject','force_apply')),
  api_key_used TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ls_email ON logged_sessions(user_email);
CREATE INDEX IF NOT EXISTS idx_ls_session ON logged_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_ls_email_session ON logged_sessions(user_email, session_id);

CREATE TABLE IF NOT EXISTS daily_usage (
  date TEXT PRIMARY KEY,
  total_requests INTEGER NOT NULL DEFAULT 0,
  guest_requests INTEGER NOT NULL DEFAULT 0,
  user_requests INTEGER NOT NULL DEFAULT 0,
  error_requests INTEGER NOT NULL DEFAULT 0,
  primary_key_calls INTEGER NOT NULL DEFAULT 0,
  secondary_key_calls INTEGER NOT NULL DEFAULT 0,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  unique_guests INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER NOT NULL DEFAULT 0,
  last_request_at TEXT
);

CREATE TABLE IF NOT EXISTS api_key_status (
  key_name TEXT PRIMARY KEY,
  is_rate_limited INTEGER NOT NULL DEFAULT 0,
  rate_limited_until TEXT,
  total_requests_today INTEGER NOT NULL DEFAULT 0,
  total_errors_today INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  last_error TEXT
);
INSERT OR IGNORE INTO api_key_status VALUES ('primary', 0, NULL, 0, 0, NULL, NULL);
INSERT OR IGNORE INTO api_key_status VALUES ('secondary', 0, NULL, 0, 0, NULL, NULL);
```

---

## 17. Config

Hardcoded in the Worker. Change and redeploy with `wrangler deploy`.

```javascript
const CONFIG = {
  MAX_GUEST_REQUESTS: 10,
  MAX_USER_REQUESTS: 20,
  RESET_HOURS: 12,
  MIN_REQUEST_GAP_SECONDS: 3,
  MAX_FIX_ATTEMPTS: 2,
  MAX_CODE_LINES: 500,
  MAX_CODE_BYTES: 15360,
  MAX_QUERY_LENGTH: 2000,
  RATE_LIMIT_COOLDOWN_MS: 60000,
  GUEST_DATA_RETENTION_DAYS: 30,
  SYSTEM_INSTRUCTION_VERSION: "1.0"
};
```

**Secrets** (stored via `wrangler secret put`):
- `PRIMARY_KEY` — Gemini API key #1
- `SECONDARY_KEY` — Gemini API key #2
- `SESSION_SECRET` — shared with `graphics-oc-files` Worker for auth verification

---

## 18. Quick Reference Tables

### Guest (no filename in response)

| Scenario | type | Sends | Returns |
|---|---|---|---|
| First message | `new` | user_query, fingerprint_id, session_id | generated_code, chat, version |
| Applied → follow-up | `edit` | current_code, user_query, session_id | generated_code, chat, version |
| Rejected → follow-up | `edit` | user_query, session_id (no code) | generated_code, chat, version |
| Ignored → follow-up | `edit` | current_code (force-applied), user_query, session_id | generated_code, chat, version |
| Compile error | `error` | generated_code, error, fix_attempt, session_id | generated_code, chat, version |
| **After page reload** | `new` | user_query, fingerprint_id, **NEW session_id** | generated_code, chat, version |

### Logged-in (filename included)

| Scenario | type | Sends | Returns |
|---|---|---|---|
| First message | `new` | user_query, session_id | filename, generated_code, chat, version |
| Applied → follow-up | `edit` | current_code, user_query, filename, session_id | filename, generated_code, chat, version |
| Rejected → follow-up | `edit` | user_query, filename, session_id (no code) | filename, generated_code, chat, version |
| Ignored → follow-up | `edit` | current_code (force), user_query, filename, session_id | filename, generated_code, chat, version |
| Compile error | `error` | generated_code, error, filename, fix_attempt, session_id | filename, generated_code, chat, version |

### What gets inserted into DB — every request

| Step | What | Where |
|---|---|---|
| 1 | `total_requests += 1`, update `window_requests` | `guest_info` or `logged_users` |
| 2 | INSERT full request row (query, code, chat, filename, version...) | `guest_logs` or `logged_sessions` |
| 3 | UPSERT day totals (+1 requests, +tokens, etc.) | `daily_usage` |
| 4 | `total_requests_today += 1` | `api_key_status` |

### On PATCH /api/ai/action (Apply / Reject)

| Step | What | Where |
|---|---|---|
| 1 | `SET user_action = 'apply'` or `'reject'` | `guest_logs` or `logged_sessions` |

---

