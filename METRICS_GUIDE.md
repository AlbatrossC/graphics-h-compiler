# Structured Logging & Metrics Implementation Guide

## Overview

This document explains the structured logging and metrics system added to the Graphics.h Online Compiler. The system is **purely observational** and does NOT change any logic, behavior, or performance characteristics.

**No external analytics libraries are used.** All logging goes to the browser console or worker logs.

---

## Global Metrics Object

### Location
`static/js/compiler/core.js` - Defined early in the page load, accessible to all subsequent scripts.

### Structure
```javascript
const metrics = {
  editor: { changeCount, lastChangeAt },
  idle: { timerStartedCount, idleTriggeredCount, lastIdleAt },
  storage: { localDraftWrites, cloudWrites, cloudReads, cloudSkips },
  autosave: { scheduled, executed, skippedClean, skippedGuest },
  auth: { clientCacheHits, clientCacheMisses, workerCacheHits, workerCacheMisses, supabaseVerifications },
  runtime: { runCount, runtimeReuseErrors, zipExtractionStarted, zipExtractionCompleted }
}
```

### Debug Access
```javascript
metricsDebug.metrics          // View current metrics
metricsDebug.printSummary()   // Print formatted summary to console
metricsDebug.reset()          // Reset all counters to 0
```

---

## Instrumentation by Component

### 1. Editor Changes (`static/js/compiler/editor.js`)

**What is tracked:**
- Total number of editor content changes
- Last change timestamp
- Log once every N changes (configurable)

**Where incremented:**
```javascript
// Line 245: editor.on('change', () => {
metrics.editor.changeCount++;
metrics.editor.lastChangeAt = Date.now();
if (metrics.editor.changeCount % metrics.editor.changeLogInterval === 0) {
    Logger.info(`[Editor] Changes: ${metrics.editor.changeCount}`);
}
```

**Why this location:**
- This event fires when user types/pastes/deletes text
- Accurate reflection of user activity without per-keystroke spam
- Logging every 10 changes avoids console spam while remaining informative

**How it aids debugging:**
- Detect unresponsive editor (changeCount stuck)
- Verify editor event listeners are working
- Understand typing patterns before/after saves
- Detect auto-format tools that trigger change events

---

### 2. Autosave Scheduling (`static/js/compiler/storage.js`)

**What is tracked:**
- Number of times autosave is scheduled
- Reasons for scheduling

**Where incremented:**
```javascript
// Line 455: function scheduleAutosave() {
CLOUD_STATE.autosaveTimer = setTimeout(async () => {
    metrics.autosave.scheduled++;
    await forceSaveActiveFile();
}, AUTOSAVE_DELAY_MS);
```

**Why this location:**
- Fires when user stops typing for 3s
- **Before** the actual 30s delay, so counts the initial schedule
- Distinguishes between "scheduled to run" vs "actually ran"

**How it aids debugging:**
- Count how many autosaves are queued
- If scheduled >> executed, indicates network issues
- Compare scheduling frequency to actual saves
- Detect if autosave is never being scheduled

---

### 3. Autosave Execution & Skips (`static/js/compiler/storage.js`)

**What is tracked:**
- Number of autosaves that executed
- Number skipped due to clean state
- Number skipped (guest, no network, etc)

**Where incremented:**
```javascript
// Line 392: if (CLOUD_STATE.lastSavedHash === hash ...) {
metrics.autosave.skippedClean++;
Logger.info('Content unchanged, skipping cloud save');

// Line 432: if (response.ok) {
metrics.autosave.executed++;
metrics.storage.cloudWrites++;
Logger.info(`[Autosave] Executed | total=${metrics.autosave.executed}`);
```

**Why this location:**
- Hash comparison detects unchanged content (avoid unnecessary cloud writes)
- Log immediately when skipped vs executed
- Critical for understanding autosave efficiency

**How it aids debugging:**
- High skips = good (not wasting bandwidth)
- Low executes with many schedules = network latency
- detect infinite loops (should never be > changeCount)

---

### 4. Cloud Storage Operations (`static/js/compiler/storage.js`)

#### Local Draft Writes
```javascript
// Line 132: function setLocalDraftImmediate()
metrics.storage.localDraftWrites++;
```

**Why:** Tracks localStorage writes (should be high, fast operations)

#### Cloud Writes (on file save)
```javascript
// Line 432: In forceSaveActiveFile()
metrics.storage.cloudWrites++;
Logger.info(`[Cloud] WRITE ${filename} | trigger=autosave | writes=${metrics.storage.cloudWrites}`);
```

**Why:** Tracks actual cloud operations (expensive, want to minimize)

#### Cloud Skipped Saves
```javascript
// Line 392 & 434: In autosave skip logic
metrics.storage.cloudSkips++;
metrics.storage.cloudSkips++;
```

**Why:** Counts files not written because unchanged (optimization validation)

#### Cloud Reads
```javascript
// Line 724: In openFile() cloud fetch branch
metrics.storage.cloudReads++;
Logger.info(`[Cloud] READ ${filename} | reads=${metrics.storage.cloudReads}`);
```

**Why:** Tracks file retrievals (indicates cache misses from Tier 1 & Tier 2)

**How it aids debugging:**
- Ratio of cloudSkips to cloudWrites shows deduplication efficiency
- cloudWrites vs cloudReads should be roughly balanced
- High localDraftWrites with low cloudWrites indicates guest users
- Sudden cloudReads spike could indicate cache clearing

---

### 5. Authentication Cache Effectiveness (`static/js/compiler/storage.js`)

#### Client-Side Cache (Browser Memory)
```javascript
// Line 65: In getCachedSessionToken()
const cachedToken = getCachedToken();
if (cachedToken) {
    metrics.auth.clientCacheHits++;
    return { access_token: cachedToken };
}

metrics.auth.clientCacheMisses++;
Logger.info(`[Auth][Client] Cache MISS → fetching session`);
```

**Why:** 
- Tracks memory session cache effectiveness
- Hit = no network call (fast)
- Miss = must call Supabase (slow)

**How it aids debugging:**
- clientCacheHits should be >> clientCacheMisses (99%+ expected)
- If hits ~= misses, cache isn't working
- Sudden misses = token refresh or page reload

---

### 6. Worker-Side Auth Verification Caching (`workers/graphics-compiler-users-worker/src/index.js`)

#### Cache Hits
```javascript
// Line 504: In authenticateRequest()
const cachedUserId = await getCachedUserId(token);
if (cachedUserId) {
    console.log('[Auth][Worker] Cache HIT');
    return { userId: cachedUserId.userId, token };
}
```

#### Cache Misses (Supabase Verification)
```javascript
// Line 509: In authenticateRequest()
console.log('[Auth][Worker] Cache MISS, verifying with Supabase');
const user = await verifyUserViaSupabase(env, token);

// Line 527: In verifyUserViaSupabase()
console.log('[Auth][Worker] Supabase verification performed');
```

#### 401 Errors (Cache Invalidation)
```javascript
// Line 540: When Supabase returns 401
console.log('[Auth][Worker] Token invalid (401) – cache cleared');
await clearCachedUserIdForToken(token);
```

**How it aids debugging:**
- Compare worker cache hits to client cache hits
- If client hits >> worker hits, indicates different tokens/devices
- 401 logs show when tokens become invalid
- Supabase verification logs = actual API calls (want to minimize)

---

### 7. Runtime Execution (`static/js/compiler/runtime.js`)

#### Run Triggered
```javascript
// Line 121: In runProgram()
metrics.runtime.runCount++;
Logger.info(`[Run] Triggered | count=${metrics.runtime.runCount}`);
```

**Why:** Counts how many times user clicks "Compile & Run"

#### Runtime Reuse Prevention
```javascript
// Line 169: In runProgram() when dosInstance exists
if (dosInstance) {
    metrics.runtime.runtimeReuseErrors++;
    Logger.warn('[Run] Runtime already alive – reuse prevented');
    dosInstance.exit();
}
```

**Why:** When user clicks Run while previous run is still active, we must terminate old runtime

**How it aids debugging:**
- runtimeReuseErrors should be rare (user clicked Run twice quickly)
- High counts = users are clicking frantically (UI feedback issue?)
- Shows need for debouncing the Run button

---

### 8. ZIP Extraction Visibility (`static/js/compiler/runtime.js`)

#### Extraction Started
```javascript
// Line 232: Before fs.extract()
metrics.runtime.zipExtractionStarted++;
Logger.info('[Runtime] Extracting compiler ZIP...');
```

#### Extraction Completed
```javascript
// Line 240: After fs.extract()
metrics.runtime.zipExtractionCompleted++;
Logger.info('[Runtime] ZIP extraction complete');
```

**Why:** 
- Track if ZIP extraction completes or hangs
- High-level visibility only (no file-by-file logging)
- Indicates warmup effectiveness

**How it aids debugging:**
- zipExtractionStarted === zipExtractionCompleted = healthy
- If started > completed = extraction hung/failed
- Compare to runCount to see cache hit rate

---

## Logging Patterns

### Consistent Prefixes

All logs use one of these patterns:

| Category | Prefix | Example |
|----------|--------|---------|
| Editor | `[Editor]` | `[Editor] Changes: 30` |
| Autosave | `[Autosave]` | `[Autosave] Executed \| total=4` |
| Cloud Storage | `[Cloud]` | `[Cloud] WRITE main.cpp \| writes=12` |
| Auth Client | `[Auth][Client]` | `[Auth][Client] Cache MISS → fetching` |
| Auth Worker | `[Auth][Worker]` | `[Auth][Worker] Cache HIT` |
| Runtime | `[Runtime]` | `[Runtime] ZIP extraction complete` |
| Run | `[Run]` | `[Run] Triggered \| count=6` |

### Log Levels

- `Logger.info()` - Normal operation
- `Logger.warn()` - Unusual but handled situation
- `Logger.error()` - Failure that needs user attention
- `console.log()` - Worker logs (no Logger available)

---

## Metrics Summary Function

### Usage
```javascript
// From browser console:
metricsDebug.printSummary()
```

### Output Example
```
[Metrics Summary]
Editor changes: 124
Idle triggers: 4
Local draft writes: 98
Cloud writes: 12
Cloud reads: 7
Cloud skips: 15
Auth client hits/misses: 45 / 2
Auth worker hits/misses: 58 / 3
Supabase verifications: 3
Runs: 9
Runs blocked (reuse): 1
ZIP extractions started: 9
ZIP extractions completed: 9
```

### How to Use
1. Open DevTools (F12)
2. Type: `metricsDebug.printSummary()`
3. Review metrics to understand session behavior
4. Use screenshot for bug reports
5. Call `metricsDebug.reset()` to start fresh count

---

## Performance Regression Detection

### Symptoms and Causes

| Symptom | Likely Cause | Check |
|---------|-------------|-------|
| Many cloudSkips, few cloudWrites | Good (deduplication working) | Normal |
| Few cloudSkips, many cloudWrites | Bad (writing unchanged files) | Hash comparison broken? |
| cloudReads > 10 | Cache misses (new users expect ~1-2) | Memory cache expiring too fast? |
| clientCacheMisses > 10% | Token not cached (should be <1%) | setCachedSession not called? |
| supabaseVerifications > 5/hour | Worker cache not working | 30-min TTL too short? |
| runtimeReuseErrors > 5 | Users clicking Run repeatedly | Add button debouncing |
| zipExtractionStarted > completed | Extraction hung | Check blobUrl creation |
| scheduled >> executed | High skip rate (ok) or network issues | Check cloudWrites |

---

## Rules Enforced

✅ **What was done:**
- Count-only metrics (no sampling)
- Console logging only (no external services)
- Consistent logging prefixes
- No behavioral changes
- No additional network calls
- No additional awaits
- Deterministic logging (same input = same output)

❌ **What was NOT done:**
- No sampling or rate limiting
- No analytics APIs
- No server-side metrics collection
- No timing modifications
- No new dependencies
- No business logic changes

---

## Testing the Metrics

### Manual Test Checklist

```javascript
// 1. Verify metrics object exists
metricsDebug.metrics  // Should show all counters

// 2. Type in editor
// editor.changeCount should increase

// 3. Save file with changes
// autosave.executed should increase
// storage.cloudWrites should increase

// 4. Don't change anything for 30s
// autosave.skippedClean should increase

// 5. Switch files
// storage.cloudReads should increase (first time only)
// storage.cloudWrites may increase (save previous file)

// 6. Sign out and back in
// auth.clientCacheMisses should increase once
// auth.clientCacheHits should then increase on next operation

// 7. Click Run
// runtime.runCount should increase
// runtime.zipExtractionStarted should increase

// 8. Print summary
metricsDebug.printSummary()  // Review all counts
```

---

## Known Limitations

1. **Worker metrics not aggregated** - Worker logs go to Cloudflare logs, not visible in browser console. Only the client-side metrics object is easily accessible.

2. **Memory impact** - Metrics object stays in memory for page lifetime. Impact is negligible (<1KB).

3. **No persistence** - Metrics reset on page reload. Use screenshot/summary before reload.

4. **Console only** - No UI dashboard. Open DevTools to see metrics.

5. **No timestamps on counters** - Metrics show totals, not per-minute rates. Calculate manually if needed.

---

## Conclusion

This structured logging system provides **complete observability** into runtime behavior without changing any logic or performance. Use it to:

✅ Debug performance regressions
✅ Understand user behavior patterns
✅ Validate caching effectiveness
✅ Detect edge cases and failures
✅ Generate reliable bug reports

**Remember:** These are observation tools, not measurement. They reflect what the system is **doing**, not how **fast** it's doing it.
