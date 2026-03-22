# AI Assistant — Full Technical Reference

The AI assistant generates Turbo C (Borland TC++ 3.0) graphics.h programs in response to natural-language prompts. It is powered by Google Gemini and consists of three layers: a Cloudflare Worker (backend), a Flask proxy, and a vanilla-JS frontend module.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Cloudflare Worker — `workers/ai-assistant/`](#2-cloudflare-worker)
   - [Entry point & routing](#21-entry-point--routing)
   - [Identity & auth](#22-identity--auth)
   - [Request validation](#23-request-validation)
   - [Prompt construction](#24-prompt-construction)
   - [Gemini API call & failover](#25-gemini-api-call--failover)
   - [Response parsing](#26-response-parsing)
   - [Rate limiting](#27-rate-limiting)
   - [Database writes](#28-database-writes)
   - [Session management endpoints](#29-session-management-endpoints)
   - [Action tracking endpoint](#210-action-tracking-endpoint)
   - [Error handling](#211-error-handling)
3. [System Instructions — `system_instructions.md`](#3-system-instructions)
4. [Flask Proxy — `app.py`](#4-flask-proxy)
5. [Frontend Module — `static/js/compiler/ai.js`](#5-frontend-module)
   - [State object](#51-state-object-ai_state)
   - [Identity detection](#52-identity-detection)
   - [New / Edit request flow](#53-new--edit-request-flow)
   - [Preview system](#54-preview-system)
   - [Auto-fix loop](#55-auto-fix-loop)
   - [Session history](#56-session-history)
   - [Delete session](#57-delete-session)
   - [Event listeners & compiler integration](#58-event-listeners--compiler-integration)
6. [compiler.html — AI Panel Structure](#6-compilerhtml--ai-panel-structure)
   - [Sessions view](#61-sessions-view)
   - [Chat view](#62-chat-view)
   - [Generating indicator](#63-generating-indicator)
7. [Database Schema](#7-database-schema)
8. [Request & Response Reference](#8-request--response-reference)

---

## 1. Architecture Overview

```
User types prompt
      │
      ▼
compiler.html  ──  ai.js (POST /api/ai)
                         │
                         ▼
                   app.py (Flask proxy)
                         │
                         ▼
              workers/ai-assistant/src/index.js
                         │
              ┌──────────┴──────────┐
              │                     │
        Gemini API            D1 Database
     (gemini-2.5-flash)    (graphicsh-ai)
```

- **`ai.js`** builds the request payload, manages local UI state, and handles the response.
- **`app.py`** is a thin proxy — it forwards requests verbatim to the Cloudflare Worker and passes cookies through.
- **`src/index.js`** routes the request; handler modules validate, identify the caller, enforce rate limits, call Gemini, parse the response, write to D1, and return the result.
- **D1** stores all requests for session history, analytics, and rate limiting.

---

## 2. Cloudflare Worker

**Entry point:** `workers/ai-assistant/src/index.js`
**Config:** `workers/ai-assistant/wrangler.jsonc`

The worker code is split into modules under `src/`:

| Module | Responsibility |
|--------|---------------|
| `src/config.js` | `CONFIG` constants, `ALLOWED_ORIGINS` |
| `src/cors.js` | CORS headers, `jsonResponse`, `errorResponse`, debug helpers |
| `src/auth.js` | JWT verify, `identifyRequest`, `identifyFromCookieOnly` |
| `src/validate.js` | `validateRequestBody`, `normalizeFilename`, size checks |
| `src/gemini.js` | `buildPrompt`, `callGeminiWithFailover`, `parseGeminiResponse` |
| `src/rateLimit.js` | `evaluateRateLimit`, window/cooldown logic |
| `src/db.js` | All D1 operations, `runPostResponseWrites` |
| `src/handlers.js` | All route handler functions |
| `src/index.js` | Main `fetch` router |

`worker.js` at the root is kept as a legacy re-export only.

### 2.1 Entry point & routing

The worker exports a single `fetch` handler. All routes share the same CORS headers produced by `withCors(request)`, which whitelists specific origins and reflects credentials only for them.

| Method | Path | Handler |
|--------|------|---------|
| `POST` | `/api/ai` | `processAiRequest` |
| `PATCH` | `/api/ai/action` | `processActionRequest` |
| `GET` | `/api/ai/sessions` | `processSessionsRequest` |
| `GET` | `/api/ai/sessions/:id` | `processSessionMessagesRequest` |
| `DELETE` | `/api/ai/sessions/:id` | `processDeleteSessionRequest` |
| `GET` | `/health` | inline — returns `{ ok: true }` |
| `OPTIONS` | any | 204 preflight |

### 2.2 Identity & auth

Every request is resolved to one of two identity kinds:

**Guest** — no session cookie present. The client sends a `fingerprint_id` in the request body (a random string stored in `localStorage` under `graphicsh_ai_guest_id_v1`). The worker treats this as the stable identifier for rate limiting and logging.

**Logged-in user** — a valid `session` HttpOnly cookie is present. The worker verifies it as an HS256 JWT (signed with `SESSION_SECRET`) via `verifySessionJwt()`. On success it extracts the `email` claim, which becomes the stable user identifier. If the token is expired or tampered, the worker returns `401 invalid_session`.

`identifyRequest()` tries the cookie first. If no cookie exists, it falls back to `fingerprint_id`. If neither is present, it returns an appropriate error.

For session-list endpoints (GET/DELETE sessions), `identifyFromCookieOnly()` is used — these routes are only available to logged-in users.

### 2.3 Request validation

`validateRequestBody()` enforces three request types:

**`new`** — generate from scratch.
- Requires: `user_query` (max 2,000 chars), `session_id`
- Optional for logged-in: `filename` (must match `ai_[a-z0-9_]{1,25}\.(cpp|c)`)

**`edit`** — modify existing code.
- Requires: `user_query`, `session_id`
- Optional: `current_code` (max 15,360 bytes / 500 lines), `filename`

**`error`** — fix a compiler error automatically.
- Requires: `generated_code`, `error`, `fix_attempt` (1 or 2), `session_id`
- Optional: `filename`

`normalizeFilename()` validates the filename pattern with a strict regex. An empty string is allowed (guest or no prior filename); an invalid format throws `400 bad_request`.

### 2.4 Prompt construction

`buildPrompt(payload, identity)` assembles the text sent to Gemini as the user turn. The system instruction is always loaded from `system_instructions.md` at import time.

The prompt header always includes:
```
Request type: new | edit | error
Audience: guest user | logged-in user
Current filename: ai_xyz.cpp   (if known)
```

- **`new`**: appends the raw `user_query`.
- **`edit`**: appends current code block (or a note that it was rejected/unavailable) followed by the edit request. Also adds `"Keep the same filename if this is the same program."`.
- **`error`**: appends the broken code, compiler error output, fix attempt number, and a note to preserve the filename and original idea.

### 2.5 Gemini API call & failover

`callGeminiWithFailover()` tries up to two API keys in order:

1. `PRIMARY_KEY` → `callGeminiOnce()`
2. If HTTP 429 → `SECONDARY_KEY` → `callGeminiOnce()`
3. If both return 429 → throws `503 API_DOWN`
4. Non-429 error on any key → throws `502 upstream_error` immediately (no retry)

`callGeminiOnce()` sends a single `generateContent` request with a 50-second AbortController timeout. The request body includes:
- `systemInstruction`: the full text from `system_instructions.md`
- `contents`: single user turn with the assembled prompt
- `generationConfig`: `temperature: 0.45`, `topP: 0.9`, `thinkingBudget: 2048`

The model is read from `env.GEMINI_MODEL` (defaults to `gemini-2.5-flash`).

All Gemini errors are logged to `console.error` with the key name, HTTP status, and a 500-char preview of the raw response body.

### 2.6 Response parsing

`parseGeminiResponse(rawText)` extracts three XML-style tags from Gemini's output:

```xml
<filename>ai_example.cpp</filename>
<chat>Short explanation here.</chat>
<code>/* full Turbo C program */</code>
```

Extraction uses a case-insensitive regex: `/<tagname>([\s\S]*?)<\/tagname>/i`.

Validation chain:
1. Strip outer markdown code fences if Gemini wrapped the whole response.
2. Extract `filename` → run through `normalizeFilename()` (regex check). If extraction succeeds but pattern is invalid, filename becomes empty string (caught below).
3. If any of `filename`, `chat`, or `code` is empty → `console.error` with a detailed diagnostic (which tags were missing, raw filename value, 600-char text preview) → throw `502 invalid_ai_response`.
4. Check `code` size: > 15,360 bytes or > 500 lines → throw `502 invalid_ai_response`.

### 2.7 Rate limiting

Limits use a sliding 12-hour window tracked per guest (`guest_info`) and per user (`logged_users`).

| Caller | Max requests / 12h | Min gap between requests |
|--------|-------------------|--------------------------|
| Guest | 10 | 3 seconds |
| Logged-in | 20 | 3 seconds |

`evaluateRateLimit()` checks two conditions:
- **`LIMIT_REACHED`** → `windowRequests >= maxRequests`. Returns remaining time until window reset.
- **`COOLDOWN`** → last request was < 3 seconds ago. Returns remaining cooldown seconds.

Both return `429`. The window resets automatically once 12 hours have elapsed since `window_start`.

### 2.8 Database writes

After a successful Gemini response, only **one write blocks the response**. The remaining two are deferred.

**Synchronous (critical path):**
1. **`insertRequestLog()`** — writes one row to `logged_sessions` (user) or `guest_logs` (guest) with the full request/response including generated code, filename, chat text, token counts, and API key used. Returns the `request_id` sent back to the client.

**Asynchronous (via `ctx.waitUntil`):**
2. **`updateSubjectUsage()`** — increments `window_requests`, `total_requests`, updates `window_start` if the window reset, and sets `last_request_at`. Runs after the response is sent.

3. **`updateDailyUsage()`** — upserts a row in `daily_usage` for today's date. Increments guest/user/error counters, token totals, and unique-visitor counts (using `isFirstToday`). The `countRequestsToday()` read that determines `isFirstToday` also runs inside the async block, keeping it off the critical path.

Both async writes are bundled in `runPostResponseWrites()` (`src/db.js`) and dispatched together via `Promise.all`.

Version numbers (`v1`, `v2`, …) are computed before writing by counting existing rows for the `session_id`.

### 2.9 Session management endpoints

**`GET /api/ai/sessions`** — returns up to 20 sessions for the authenticated user, grouped by `session_id`, ordered by most recently active. Each row includes `session_title`, message count, `started`, and `last_active`.

**`GET /api/ai/sessions/:id`** — returns all messages for one session in chronological order. Each row includes `version`, `request_type`, `user_query`, `chat_response`, `generated_code`, `generated_filename`, `fix_attempt`, `created_at`. Used to restore conversation history when a session is opened from the sessions list.

**`DELETE /api/ai/sessions/:id`** — deletes all rows in `logged_sessions` where `user_email = ? AND session_id = ?`. Returns `{ success: true, deleted: N }` or `404` if nothing matched. Scoped to the authenticated user — a user cannot delete another user's sessions.

### 2.10 Action tracking endpoint

**`PATCH /api/ai/action`** — records what the user did with an AI draft.

Accepted actions: `apply`, `reject`, `force_apply`.

- `apply` — user clicked Accept; draft was merged into their file.
- `reject` — user clicked Discard; previous code was restored.
- `force_apply` — user sent a new prompt while a draft was pending; the draft was silently applied before processing the new prompt.

Updates the `user_action` column in `logged_sessions` (for users) or `guest_logs` (for guests).

**Ownership scoping:**
- Users: scoped by `request_id AND user_email` — a user cannot update another user's action.
- Guests: scoped by `request_id AND fingerprint_id` — a guest cannot update another guest's action. `fingerprint_id` is required in the request body; omitting it returns `400 bad_request`.

### 2.11 Error handling

All structured errors are thrown as plain objects with `{ statusCode, code, message }`. The main `fetch` handler catches them and calls `errorResponse()`, which sets the `X-AI-Error-Code` response header alongside the JSON body.

Unhandled exceptions fall through to a generic `500 internal_error` with a `console.error` log.

The `X-AI-Debug: 1` request header enables an additional `debug` field in error responses containing the worker name, model, timestamp, and which API key caused the failure.

---

## 3. System Instructions

**File:** `workers/ai-assistant/system_instructions.md`

Loaded at import time via Cloudflare's module system (`import SYSTEM_INSTRUCTION from './system_instructions.md'`) and sent as `systemInstruction` in every Gemini request.

Key rules enforced by the instructions:

- **Format is mandatory.** Every response must contain `<filename>`, `<chat>`, and `<code>` tags in that order, with no text before or after. Missing tags cause a `502 invalid_ai_response` error.
- **Filename pattern.** Must match `ai_[a-z0-9_]{1,25}\.(cpp|c)`. Always prefixed with `ai_`. Default extension `.cpp`.
- **Request type awareness.** The instructions explain all three types (`new`, `edit`, `error`) and their filename stability rules:
  - `new` → choose a descriptive filename.
  - `edit` → keep the same filename if the program concept is the same; use a new one only if the program changes completely.
  - `error` → always keep the same filename.
- **Audience note.** Guest vs logged-in user is stated in the prompt header but does not change the output format.
- **Non-programming prompts.** Still produce a valid Turbo C program — display a sarcastic `outtextxy()` message instead of answering directly.
- **Code constraints.** Must use `initgraph(&gd,&gm,"")`, integer coordinates, valid `graphics.h` functions only, compile under Borland TC++ 3.0.

---

## 4. Flask Proxy

**File:** `app.py`

The AI routes are declared as:

```python
@app.route('/api/ai', methods=['POST', 'OPTIONS'])
@app.route('/api/ai/action', methods=['PATCH', 'OPTIONS'])
@app.route('/api/ai/sessions', methods=['GET', 'OPTIONS'])
@app.route('/api/ai/sessions/<session_id>', methods=['GET', 'DELETE', 'OPTIONS'])
def ai_proxy(session_id=None):
```

All four routes share one view function. `proxy_request()` forwards the method, headers, body, and cookies verbatim to the `AI_ASSISTANT_WORKER` environment variable (the Cloudflare Worker URL). The `session` cookie is forwarded automatically because `build_proxy_headers()` copies all headers except hop-by-hop ones.

The proxy sets `read_timeout=120` for AI requests (vs 20s for other proxies) to accommodate Gemini's thinking time. Timeouts return `504`, network errors return `502`.

The proxy logs outcomes at different levels:
- `POST /api/ai` — logs OK or the error code and reason.
- `PATCH /api/ai/action` — logs action recorded or failure.
- `GET /api/ai/sessions` — logs fetch success or failure.

---

## 5. Frontend Module

**File:** `static/js/compiler/ai.js`

Wrapped in an IIFE. Initializes only if the required DOM elements (`#ai-messages`, `#ai-form`, `#ai-input`, `#ai-send-btn`) exist.

### 5.1 State object (`AI_STATE`)

```js
const AI_STATE = {
    guestFingerprintId: '',      // fp_<timestamp>_<random>, from localStorage
    sessionId: '',               // sess_* for users, gs_* for guests
    messages: [],                // rendered chat history [{role, text, meta}]
    isSending: false,            // blocks duplicate submissions
    hasConversation: false,      // true after first message in a session
    currentVersion: '',          // latest version tag (v1, v2, ...)
    currentFilename: '',         // last AI-generated filename (logged-in only)
    lastDecision: null,          // 'apply' | 'reject' | 'force_apply' | null
    preview: null,               // active preview metadata object (see below)
    forceChatView: false,        // show chat even with no conversation (New button)
};
```

The `preview` object while a draft is pending:
```js
{
    requestId,             // from worker — used for PATCH /api/ai/action
    version,               // 'v1', 'v2', ...
    filename,              // AI-generated filename
    baseSnapshot,          // editor state before this draft was applied
    previousConversationFilename,
    autoFixAttempts,       // 0–2
    awaitingCompile,       // true while the auto-run is in progress
    targetKey,             // CLOUD_STATE file key for logged-in users
    targetFolder,
    targetFolderId,
    targetExistingFile,    // prior file content (for reject restoration)
}
```

### 5.2 Identity detection

`isLoggedInNow()` reads the global `isUserLoggedIn` set by `updateLoginUI()` in `runtime.js`.

Session IDs are created with `createSessionId()`:
- Logged-in: `sess_<timestamp>_<random6>`
- Guest: `gs_<timestamp>_<random6>`

Guest fingerprint IDs are stored in `localStorage` under `graphicsh_ai_guest_id_v1` and created once per browser if absent.

### 5.3 New / Edit request flow

`sendManualPrompt(text)`:

1. If a preview is pending, `force_apply` it silently (the user is moving on).
2. Determine `requestType`: `'new'` if `!AI_STATE.hasConversation`, else `'edit'`.
3. Snapshot the current editor state (`snapshotActiveEditor`) for rollback.
4. Push the user message to `AI_STATE.messages` and render immediately.
5. Build the POST body:
   - Always: `type`, `user_query`, `session_id`
   - Guest only: `fingerprint_id`
   - Edit + logged-in: `current_code` (editor content), `filename` (if known)
6. `POST /api/ai` with `X-AI-Debug: 1`.
7. On success: call `showPreviewInEditor(payload, options)`.
8. On error: push an error message to the chat.
9. Always: `setBusyState(false)`.

### 5.4 Preview system

`showPreviewInEditor(payload, options)`:

**For logged-in users:**
1. `ensureAiFolderId()` — finds or creates the "AI" folder via `POST /api/folder/create`. Result is cached in `CLOUD_STATE`.
2. Sets the file in `CLOUD_STATE.files` with the AI-generated content and filename.
3. Writes a local IndexedDB draft via `setLocalDraft()`.
4. Calls `openFile()` to load the file into the editor (without triggering a save).
5. Stores the prior file state in `preview.targetExistingFile` for rejection rollback.

**For guests:**
- Directly calls `editor.setValue(payload.generated_code)`.

After placing code in the editor:
- Sets `AI_STATE.preview`, `AI_STATE.hasConversation = true`.
- Calls `syncPreviewChrome(true)` — shows the Accept/Discard action bar.
- Pushes the assistant's chat message with version and filename metadata.
- Calls `triggerPreviewRun()` — runs the compiler automatically.

**Accept (`applyPreview('apply')`):**
- For logged-in: force-saves the file to cloud.
- For guests: calls `persistLocalSave()`.
- Records `apply` action via `PATCH /api/ai/action`.
- Clears `AI_STATE.preview`, hides the action bar.

**Discard (`rejectPreview()`):**
- Records `reject` action.
- For logged-in: restores `targetExistingFile` content in `CLOUD_STATE` and IndexedDB, or deletes the file key if it was newly created.
- Calls `restoreBaseSnapshot()` — puts the original code back in the editor.
- Clears `AI_STATE.preview`.

### 5.5 Auto-fix loop

When the compiler emits a `compiler-compilation-error` event while `AI_STATE.preview.awaitingCompile` is true, `sendAutoFix(errorText)` fires automatically.

It sends `type: 'error'` with the current editor content as `generated_code` and the compiler output as `error`. `fix_attempt` increments from 1 to a maximum of 2 (`MAX_FIX_ATTEMPTS`).

On success, `showPreviewInEditor` is called again — the new draft replaces the old one. On failure, an error message is pushed to the chat.

The `compiler-run-success` event (fired when the DOSBox run *starts*) is intentionally ignored by the AI — only `compiler-compile-success` (fired when TC++ finishes compiling successfully) clears `awaitingCompile`.

### 5.6 Session history

`loadSessionHistory()` — called on panel open and after every successful AI response (for logged-in users). Fetches `GET /api/ai/sessions` and passes the result to `renderSessionHistory()`.

`openSessionMessages(session)` — fetches `GET /api/ai/sessions/:id`, reconstructs `AI_STATE.messages` from the stored rows (skipping `request_type === 'error'` rows), loads the last version's code into the editor, and sets `AI_STATE.currentFilename` to the last generated filename so the next edit request references the correct file.

`syncSessionHistoryVisibility()` controls which sub-view is shown:
- **Sessions view** (`#ai-sessions-view`): shown when user is logged in, has no active conversation, and `forceChatView` is false. Sets `body.dataset.aiView = 'sessions'`.
- **Chat view** (`#ai-chat-view`): shown in all other cases. Sets `body.dataset.aiView = 'chat'`.

The Back button resets state and returns to the sessions list. The New button sets `AI_STATE.forceChatView = true` and switches to the chat view with a fresh session.

### 5.7 Delete session

`deleteSession(session, itemEl)`:

1. Adds `.ai-session-deleting` CSS class to the item (fades it out, disables interaction).
2. Calls `DELETE /api/ai/sessions/:session_id`.
3. On success: removes the element from the DOM. If the list is now empty, calls `renderSessionHistory([])` to show the empty state.
4. On failure: removes the class to restore the item.

### 5.8 Event listeners & compiler integration

| Event | Source | Handler |
|-------|--------|---------|
| `submit` on `#ai-form` | User presses send | `sendManualPrompt` |
| `keydown` on `#ai-input` | Enter (no Shift) | `sendManualPrompt` |
| `click` on `#ai-apply-btn` | Accept button | `applyPreview('apply')` |
| `click` on `#ai-reject-btn` | Discard button | `rejectPreview` |
| `compiler-compile-success` | DOSBox compile OK | clear `awaitingCompile`, set status ready |
| `compiler-compilation-error` | DOSBox compile error | `sendAutoFix` |
| `ai-panel-opened` | Panel switch | focus input, load sessions if needed |
| `auth-state-changed` | Login / logout | reset all state, reload sessions |

---

## 6. compiler.html — AI Panel Structure

The AI panel lives inside `#sidebar` as a sibling to the Explorer and Settings panels:

```html
<div id="ai-panel-view" class="ai-panel" style="display: none">

  <!-- SESSIONS VIEW — shown for logged-in users with no active chat -->
  <div id="ai-sessions-view">
    <div class="sidebar-header">
      Your Sessions  |  [+ New] button
    </div>
    <div id="ai-session-history-list"></div>  <!-- rendered by renderSessionHistory() -->
  </div>

  <!-- CHAT VIEW — shown for all users once a session is active -->
  <div id="ai-chat-view">
    <div class="sidebar-header" id="ai-chat-header">
      [← Back] button  (logged-in only)
    </div>

    <div class="ai-messages-container">
      <div id="ai-messages"></div>            <!-- rendered by renderMessages() -->
      <div id="ai-generating-indicator">     <!-- 3-dot animation while Gemini responds -->
        <div class="ai-generating-pulse">
          <span class="ai-generating-dot3"></span>
        </div>
      </div>
      <div id="ai-empty-state">             <!-- shown when messages array is empty -->
        ...placeholder text...
      </div>
    </div>

    <!-- Accept / Discard bar — hidden until a preview is active -->
    <div id="ai-actions" class="ai-actions hidden">
      <button id="ai-reject-btn">Discard</button>
      <button id="ai-apply-btn">Accept</button>
    </div>

    <!-- Composer -->
    <div class="ai-composer-wrapper">
      <form id="ai-form" class="ai-composer">
        <textarea id="ai-input" placeholder="Ask anything..."></textarea>
        <div class="ai-composer-footer">
          <span class="ai-hint">Shift+Enter for new line</span>
          <button id="ai-send-btn" type="submit">▶</button>
        </div>
      </form>
    </div>
  </div>

</div>
```

Panel visibility is driven by `setSidebarView('ai')` in `settings.js`, which sets `body.dataset.sidebarView = 'ai'`. The `syncSessionHistoryVisibility()` function in `ai.js` then toggles the sub-views and sets `body.dataset.aiView`.

### 6.1 Sessions view

Each session item is rendered as:

```html
<div class="ai-session-item">
  <button class="ai-session-item-content">   <!-- opens the session -->
    <span class="ai-session-item-title">Draw a car</span>
    <span class="ai-session-item-meta">2h ago · 3 msgs</span>
  </button>
  <button class="ai-session-delete-btn">     <!-- trash icon, visible on hover -->
    <svg>...</svg>
  </button>
</div>
```

The delete button has `opacity: 0` by default and fades to visible on `.ai-session-item:hover`. `e.stopPropagation()` prevents the click from bubbling to the content button.

### 6.2 Chat view

Messages are `div.ai-message.{role}` where `role` is `user`, `assistant`, `status`, or `error`. Each contains a `.ai-message-row > .ai-bubble` for the text. Assistant messages with a filename render an additional `div.ai-meta > span.ai-meta-chip` below the bubble.

The `#ai-chat-header` (Back button row) is hidden for guest users since guests have no sessions list to return to.

### 6.3 Generating indicator

While `#ai-input` has `aria-busy="true"` (set by `setBusyState(true)`), the CSS selector:

```css
.ai-panel:has(.ai-input[aria-busy="true"]) .ai-generating-indicator
```

transitions the indicator from `max-height: 0; opacity: 0` to `max-height: 60px; opacity: 1`. The indicator renders as a chat-bubble-shaped container (left-aligned, sharp top-left corner) with three grey dots animated by `ai-dot-fade` — a staggered bounce-and-brighten keyframe with 200ms delay between dots.

---

## 7. Database Schema

Four tables in the D1 database `graphicsh-ai`:

**`guest_info`** — one row per guest fingerprint. Tracks rate-limiting counters.

**`guest_logs`** — one row per guest request. Stores `session_id`, `fingerprint_id`, `version`, `request_type`, `user_query`, `generated_code`, `generated_filename`, `chat_response`, `error_message`, `fix_attempt`, `user_action`, `api_key_used`.

**`logged_users`** — one row per registered user (by email). Rate-limiting counters.

**`logged_sessions`** — one row per logged-in user request. Same fields as `guest_logs` plus `user_email`, `session_title` (set from the first query in a session). This is the table queried by the session history and delete endpoints.

**`daily_usage`** — one row per calendar date. Aggregated counters: total/guest/user/error requests, primary/secondary key calls, token totals, unique visitor counts.

---

## 8. Request & Response Reference

### POST /api/ai

**New request:**
```json
{
  "type": "new",
  "user_query": "draw a solar system",
  "session_id": "sess_1234_abcdef",
  "fingerprint_id": "fp_..."   // guests only
}
```

**Edit request:**
```json
{
  "type": "edit",
  "user_query": "add labels for each planet",
  "session_id": "sess_1234_abcdef",
  "current_code": "#include <graphics.h> ...",
  "filename": "ai_solar_system.cpp"            // logged-in only
}
```

**Error fix request:**
```json
{
  "type": "error",
  "generated_code": "#include <graphics.h> ...",
  "error": "Error: undefined symbol 'initgraph'",
  "fix_attempt": 1,
  "session_id": "sess_1234_abcdef",
  "filename": "ai_solar_system.cpp"
}
```

**Success response (logged-in user):**
```json
{
  "generated_code": "#include <graphics.h>\n...",
  "chat": "Here's a solar system with all 8 planets.",
  "filename": "ai_solar_system.cpp",
  "session_id": "sess_1234_abcdef",
  "version": "v1",
  "request_id": "ls_uuid-here",
  "rate_limit": {
    "remaining": 18,
    "max": 20
  }
}
```

**Success response (guest):** Same shape but without `filename`. `rate_limit.max` is `10` for guests.

`rate_limit.remaining` is the number of requests left in the current 12-hour window **after** this request was counted. Frontend can use this to display a usage indicator or warn the user when approaching the limit.

### PATCH /api/ai/action

**Logged-in user:**
```json
{ "request_id": "ls_uuid-here", "action": "apply" }
```

**Guest (fingerprint_id required for ownership check):**
```json
{ "request_id": "gl_uuid-here", "action": "apply", "fingerprint_id": "fp_..." }
```

Response: `{ "success": true, "request_id": "...", "action": "apply" }`

### GET /api/ai/sessions

Response:
```json
{
  "sessions": [
    {
      "session_id": "sess_...",
      "session_title": "draw a solar system",
      "started": "2026-03-20T10:00:00Z",
      "last_active": "2026-03-20T10:05:00Z",
      "messages": 3
    }
  ]
}
```

### GET /api/ai/sessions/:id

Response:
```json
{
  "messages": [
    {
      "version": "v1",
      "request_type": "new",
      "user_query": "draw a solar system",
      "chat_response": "Here's a solar system...",
      "generated_code": "#include <graphics.h>...",
      "generated_filename": "ai_solar_system.cpp",
      "fix_attempt": 0,
      "created_at": "2026-03-20T10:00:00Z"
    }
  ]
}
```

### DELETE /api/ai/sessions/:id

Response: `{ "success": true, "deleted": 3 }`
Error (not found): `404 { "error": "Session not found", "code": "not_found" }`

### Error response shape

```json
{
  "error": "Human-readable message",
  "code": "LIMIT_REACHED | COOLDOWN | API_DOWN | invalid_ai_response | upstream_error | ...",
  "debug": { ... }   // only when X-AI-Debug: 1 header is sent
}
```

Header `X-AI-Error-Code` always mirrors the `code` field for easy client-side detection without parsing JSON.
