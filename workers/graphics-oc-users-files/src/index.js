import { betterAuth } from "better-auth"

/*
==================================================
  Structured Logger
==================================================
*/
function log(level, message, data = {}) {
  console.log(
    JSON.stringify({
      level,
      message,
      ...data,
      time: new Date().toISOString()
    })
  )
}

/*
==================================================
  CORS Headers
==================================================
*/
function splitCsv(value = "") {
  return String(value)
    .split(",")
    .map(v => v.trim())
    .filter(Boolean)
}

function getAllowedOrigins(env) {
  return Array.from(
    new Set([
      ...splitCsv(env.FRONTEND_URL),
      ...splitCsv(env.EXTRA_TRUSTED_ORIGINS),
      env.WORKER_URL
    ].filter(Boolean))
  )
}

function corsHeaders(env, request = null) {
  const allowedOrigins = getAllowedOrigins(env)
  const requestOrigin = request?.headers?.get("Origin") || ""
  const allowOrigin = allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : (allowedOrigins[0] || "*")

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie"
  }
}

/*
==================================================
  JSON Response Helper
==================================================
*/
function json(data, status = 200, env, request = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(env, request)
    }
  })
}

/*
==================================================
  Better Auth Setup
==================================================

  Better Auth creates its own internal tables:
    user, session, account, verification

  These are SEPARATE from our migrated "users" table.
  We use Better Auth purely for OAuth + session cookies,
  then map session.user.email → users.user_id ourselves.
==================================================
*/
function createAuth(env) {

  return betterAuth({

    secret: env.BETTER_AUTH_SECRET,

    baseURL: env.WORKER_URL,
    basePath: "/auth",

    trustedOrigins: getAllowedOrigins(env),

    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET
      }
    },

    account: {
      storeStateStrategy: "cookie"
    },

    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true
      }
    }
  })
}

function getPostLoginRedirectUrl(env) {
  const frontend = (env.FRONTEND_URL || "").trim().replace(/\/+$/, "")
  if (!frontend) return "/compiler.html"

  // If FRONTEND_URL already includes a path, keep it.
  if (/\/.+/.test(frontend.replace(/^https?:\/\/[^/]+/, ""))) {
    return frontend
  }

  return `${frontend}/compiler.html`
}

function resolveLoginCallbackURL(request, env) {
  const url = new URL(request.url)
  const requested = url.searchParams.get("callbackURL")

  if (requested) {
    try {
      const parsed = new URL(requested)
      const allowedOrigins = getAllowedOrigins(env)
      if (allowedOrigins.includes(parsed.origin)) {
        return parsed.toString()
      }
      log("warn", "Rejected callbackURL origin", {
        requestedOrigin: parsed.origin,
        allowedOrigins
      })
    } catch {
      log("warn", "Invalid callbackURL provided", { requested })
    }
  }

  return getPostLoginRedirectUrl(env)
}

/*
==================================================
  Get REAL user_id from session
==================================================

  Flow:
    1. auth.api.getSession() → session.user.email
    2. SELECT user_id FROM users WHERE email = ?
    3. Return that user_id (the migrated Supabase UUID)

  NEVER generates new user IDs.
==================================================
*/
async function getUserFromSession(request, env, auth) {

  try {
    const headers = new Headers(request.headers)
    const authHeader = headers.get("Authorization")

    // Cross-domain fix: Better Auth primarily looks for cookies.
    // We always favor the Bearer token if provided to avoid stale cookie issues.
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7)
      headers.set("Cookie", `better-auth.session_token=${token}`)
    }

    const session = await auth.api.getSession({
      headers: headers
    })

    log("debug", "Session response", {
      hasSession: !!session,
      hasUser: !!session?.user,
      sessionUserId: session?.user?.id || "none",
      sessionUserEmail: session?.user?.email || "none",
      hasAuthHeader: !!authHeader
    })

    if (!session?.user) {
      log("warn", "No active session found")
      return null
    }

    const email = session.user.email

    if (!email) {
      log("error", "Session user has no email", {
        sessionUser: JSON.stringify(session.user)
      })
      return null
    }

    log("info", "Authenticated email from session", { email })

    // Map email → migrated users table user_id
    const row = await env.DB.prepare(
      "SELECT user_id FROM users WHERE email = ?"
    )
      .bind(email)
      .first()

    if (!row) {
      log("error", "Email NOT found in migrated users table", { email })
      log("error", "This means the user exists in Better Auth but not in our users table")
      return null
    }

    log("info", "Mapped email to real user_id", {
      email,
      user_id: row.user_id
    })

    return row.user_id

  } catch (err) {
    log("error", "getUserFromSession failed", {
      error: err.message,
      stack: err.stack
    })
    return null
  }
}

/*
==================================================
  Verify File Ownership
==================================================
*/
async function verifyFile(userId, fileId, env) {

  const file = await env.DB.prepare(
    "SELECT * FROM files WHERE file_id = ?"
  )
    .bind(fileId)
    .first()

  if (!file) {
    return { error: "File not found", status: 404 }
  }

  if (file.user_id !== userId) {
    log("warn", "File ownership mismatch", {
      fileUserId: file.user_id,
      requestUserId: userId
    })
    return { error: "Forbidden", status: 403 }
  }

  return { file }
}

/*
==================================================
  Simple path matcher for /projects/:id/files
==================================================
*/
function matchRoute(path, pattern) {
  const pathParts = path.split("/").filter(Boolean)
  const patternParts = pattern.split("/").filter(Boolean)

  if (pathParts.length !== patternParts.length) return null

  const params = {}
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i])
    } else if (patternParts[i] !== pathParts[i]) {
      return null
    }
  }
  return params
}

/*
==================================================
  Worker — Main Fetch Handler
==================================================
*/
export default {

  async fetch(request, env) {

    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    log("info", "Incoming request", { method, path, url: url.toString() })

    /*
    --------------------------------------------------
    CORS Preflight
    --------------------------------------------------
    */
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(env, request)
      })
    }

    const auth = createAuth(env)

    /*
    --------------------------------------------------
    GET /
    Health check
    --------------------------------------------------
    */
    if (path === "/") {
      return json({
        status: "ok",
        service: "graphics compiler backend",
        login: `${env.WORKER_URL}/login`,
        routes: [
          "GET /",
          "GET /login",
          "GET /auth/me",
          "GET /projects",
          "GET /projects/:projectId/files",
          "GET /files/:fileId",
          "GET /files/list",
          "POST /files/create",
          "POST /files/save",
          "DELETE /files/:fileId"
        ]
      }, 200, env, request)
    }

    /*
    --------------------------------------------------
    GET /login
    Redirect to Google OAuth
    --------------------------------------------------
    */
    if (path === "/login") {
      log("info", "Login redirect requested")

      try {
        const callbackURL = resolveLoginCallbackURL(request, env)
        const res = await auth.api.signInSocial({
          body: {
            provider: "google",
            callbackURL
          },
          headers: request.headers,
          returnHeaders: true,
          returnStatus: true
        })

        const headers = new Headers(res.headers)
        headers.set("Location", res.response.url)

        // Merge CORS headers
        const cors = corsHeaders(env, request)
        for (const [k, v] of Object.entries(cors)) {
          headers.set(k, v)
        }

        return new Response(null, {
          status: 302,
          headers
        })
      } catch (err) {
        log("error", "Login redirect failed", { error: err.message })
        return json({ error: "Login failed" }, 500, env, request)
      }
    }

    /*
    --------------------------------------------------
    GET /auth/me
    Returns the REAL migrated user_id (not Better Auth's internal ID)
    --------------------------------------------------
    */
    if (path === "/auth/me" && method === "GET") {

      log("info", "GET /auth/me called")

      const userId = await getUserFromSession(request, env, auth)

      if (!userId) {
        // Return 200 with null user instead of 401 to avoid 'Failed to load resource' console errors
        return json({ user_id: null, authenticated: false }, 200, env, request)
      }

      log("info", "GET /auth/me returning real user_id", { user_id: userId })

      return json({ user_id: userId, authenticated: true }, 200, env, request)
    }

    /*
    --------------------------------------------------
    Better Auth catch-all  (/auth/*)
    Handles: /auth/callback/google, /auth/get-session, etc.
    --------------------------------------------------
    */
    if (path.startsWith("/auth")) {
      try {
        log("info", "Delegating to Better Auth handler", { path })

        const response = await auth.handler(request)

        // Add CORS headers to Better Auth responses
        const newHeaders = new Headers(response.headers)

        // Cross-domain fix: Append session_token to the redirect URL
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = newHeaders.get("Location")
          if (location) {
            const cookies = newHeaders.getSetCookie ? newHeaders.getSetCookie() : []
            log("debug", "Checking cookies for session token", { count: cookies.length })
            for (const cookie of cookies) {
              const match = cookie.match(/(?:^|;)\s*[a-zA-Z0-9._-]*session_token=([^;]+)/)
              if (match) {
                const token = match[1]
                const joiner = location.includes("?") ? "&" : "?"
                newHeaders.set("Location", location + joiner + "session_token=" + token)
                log("info", "Appended session_token to redirect URL for cross-domain support", {
                  location: location + joiner + "session_token=REDACTED"
                })
                break
              }
            }
          }
        }

        const cors = corsHeaders(env, request)
        for (const [k, v] of Object.entries(cors)) {
          newHeaders.set(k, v)
        }

        return new Response(response.body, {
          status: response.status,
          headers: newHeaders
        })

      } catch (err) {
        log("error", "Auth handler error", { error: err.message, path })
        return json({ error: "Auth failed" }, 500, env, request)
      }
    }

    /*
    ==================================================
    All routes below require authentication
    ==================================================
    */
    const userId = await getUserFromSession(request, env, auth)

    if (!userId) {
      log("warn", "Unauthenticated request to protected route", { path })
      return json({ error: "Unauthorized" }, 401, env, request)
    }

    log("info", "Authenticated user for protected route", { userId, path })

    /*
    --------------------------------------------------
    GET /projects
    List all projects (folders) for the user
    --------------------------------------------------
    */
    if (method === "GET" && path === "/projects") {

      log("info", "Listing projects", { userId })

      const { results } = await env.DB.prepare(
        "SELECT * FROM projects WHERE user_id = ?"
      )
        .bind(userId)
        .all()

      log("info", "Projects query result", {
        userId,
        count: results.length
      })

      return json({ folders: results }, 200, env, request)
    }

    /*
    --------------------------------------------------
    GET /projects/:projectId/files
    List files in a project
    --------------------------------------------------
    */
    const projectFilesMatch = matchRoute(path, "/projects/:projectId/files")
    if (method === "GET" && projectFilesMatch) {

      const { projectId } = projectFilesMatch

      log("info", "Listing files in project", { projectId, userId })

      const { results } = await env.DB.prepare(
        "SELECT file_id, filename, file_size, version, created_at, updated_at FROM files WHERE project_id = ? AND user_id = ?"
      )
        .bind(projectId, userId)
        .all()

      log("info", "Files query result", {
        projectId,
        userId,
        count: results.length
      })

      return json({ files: results }, 200, env, request)
    }

    /*
    --------------------------------------------------
    GET /files/list
    List ALL files for the user (used by frontend file explorer)
    Returns files with folder info for the sidebar
    --------------------------------------------------
    */
    if (method === "GET" && path === "/files/list") {

      log("info", "Listing all files for user", { userId })

      const { results } = await env.DB.prepare(
        "SELECT file_id, project_id AS folder, filename, file_size, version FROM files WHERE user_id = ?"
      )
        .bind(userId)
        .all()

      log("info", "All files query result", {
        userId,
        count: results.length
      })

      return json({ files: results }, 200, env, request)
    }

    /*
    --------------------------------------------------
    GET /files/read?folder=X&filename=Y
    Read file content from R2  (used by frontend openFile)
    --------------------------------------------------
    */
    if (method === "GET" && path === "/files/read") {

      const folder = url.searchParams.get("folder")
      const filename = url.searchParams.get("filename")

      if (!folder || !filename) {
        return json({ error: "Missing folder or filename" }, 400, env, request)
      }

      log("info", "Reading file by folder/filename", { folder, filename, userId })

      // Look up file in D1
      const file = await env.DB.prepare(
        "SELECT file_id, r2_key, file_hash FROM files WHERE project_id = ? AND filename = ? AND user_id = ?"
      )
        .bind(folder, filename, userId)
        .first()

      if (!file) {
        log("warn", "File not found in D1", { folder, filename, userId })
        return json({ error: "File not found" }, 404, env, request)
      }

      // Read from R2
      const obj = await env.FILES_BUCKET.get(file.r2_key)

      if (!obj) {
        log("error", "File exists in D1 but missing from R2", {
          r2_key: file.r2_key
        })
        return json({ error: "File content missing in R2" }, 404, env, request)
      }

      const content = await obj.text()

      // Update last_accessed
      await env.DB.prepare(
        "UPDATE files SET last_accessed = ? WHERE file_id = ?"
      )
        .bind(Date.now(), file.file_id)
        .run()

      // Return raw text (frontend expects text/plain)
      const headers = {
        "Content-Type": "text/plain; charset=utf-8",
        ...corsHeaders(env, request)
      }

      if (file.file_hash) {
        headers["ETag"] = file.file_hash
      }

      return new Response(content, { status: 200, headers })
    }

    /*
    --------------------------------------------------
    GET /files/:fileId
    Read a single file by ID from R2
    --------------------------------------------------
    */
    if (method === "GET" && path.startsWith("/files/")) {

      const fileId = path.split("/")[2]

      if (!fileId) {
        return json({ error: "Missing file ID" }, 400, env, request)
      }

      log("info", "Reading file by ID", { fileId, userId })

      const check = await verifyFile(userId, fileId, env)

      if (check.error) {
        return json({ error: check.error }, check.status, env, request)
      }

      const file = check.file

      const obj = await env.FILES_BUCKET.get(file.r2_key)

      if (!obj) {
        log("error", "File exists in D1 but missing from R2", {
          r2_key: file.r2_key
        })
        return json({ error: "File missing in R2" }, 404, env, request)
      }

      const content = await obj.text()

      log("info", "File read successfully", {
        fileId,
        filename: file.filename,
        size: content.length
      })

      return json({
        file_id: file.file_id,
        filename: file.filename,
        project_id: file.project_id,
        content
      }, 200, env, request)
    }

    /*
    --------------------------------------------------
    POST /files/save
    Save/update a file (used by frontend autosave)
    Body: { folder, filename, content }
    --------------------------------------------------
    */
    if (method === "POST" && path === "/files/save") {

      const body = await request.json()
      const { folder, filename, content } = body

      if (!folder || !filename) {
        return json({ error: "Missing folder or filename" }, 400, env, request)
      }

      log("info", "Saving file", { folder, filename, userId })

      const now = Date.now()

      // Compute hash of new content
      const encoder = new TextEncoder()
      const data = encoder.encode(content || "")
      const hashBuffer = await crypto.subtle.digest("SHA-256", data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const newHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("")

      // Check if file exists in D1
      const existing = await env.DB.prepare(
        "SELECT file_id, r2_key, file_hash FROM files WHERE project_id = ? AND filename = ? AND user_id = ?"
      )
        .bind(folder, filename, userId)
        .first()

      if (existing) {
        // Skip write if content unchanged
        if (existing.file_hash === newHash) {
          log("info", "File unchanged, skipping R2 write", { folder, filename })
          return json({
            file_id: existing.file_id,
            hash: newHash,
            skipped: true
          }, 200, env, request)
        }

        // Update existing file
        await env.FILES_BUCKET.put(existing.r2_key, content || "")

        await env.DB.prepare(
          "UPDATE files SET file_hash = ?, file_size = ?, version = version + 1, updated_at = ? WHERE file_id = ?"
        )
          .bind(newHash, data.byteLength, now, existing.file_id)
          .run()

        log("info", "File updated", { file_id: existing.file_id, folder, filename })

        return json({
          file_id: existing.file_id,
          hash: newHash,
          skipped: false
        }, 200, env, request)

      } else {
        // Create new file
        const fileId = crypto.randomUUID()
        const r2Key = `${userId}/${folder}/${filename}`

        await env.FILES_BUCKET.put(r2Key, content || "")

        await env.DB.prepare(`
        INSERT INTO files
        (file_id, user_id, project_id, filename, r2_key, file_hash, file_size, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `)
          .bind(fileId, userId, folder, filename, r2Key, newHash, data.byteLength, now, now)
          .run()

        // Update project file_count
        await env.DB.prepare(
          "UPDATE projects SET file_count = file_count + 1, updated_at = ? WHERE project_id = ? AND user_id = ?"
        )
          .bind(now, folder, userId)
          .run()

        log("info", "File created", { file_id: fileId, folder, filename })

        return json({
          file_id: fileId,
          hash: newHash,
          skipped: false
        }, 201, env, request)
      }
    }

    /*
    --------------------------------------------------
    POST /files/create
    Create a new empty file
    Body: { projectId, filename, content? }
    --------------------------------------------------
    */
    if (method === "POST" && path === "/files/create") {

      const body = await request.json()
      const { projectId, filename, content = "" } = body

      if (!projectId || !filename) {
        return json({ error: "Missing projectId or filename" }, 400, env, request)
      }

      log("info", "Creating file", { projectId, filename, userId })

      // Check if file already exists
      const existing = await env.DB.prepare(
        "SELECT file_id FROM files WHERE project_id = ? AND filename = ? AND user_id = ?"
      )
        .bind(projectId, filename, userId)
        .first()

      if (existing) {
        return json({ error: "File already exists", file_id: existing.file_id }, 409, env, request)
      }

      const fileId = crypto.randomUUID()
      const r2Key = `${userId}/${projectId}/${filename}`
      const now = Date.now()

      await env.FILES_BUCKET.put(r2Key, content)

      await env.DB.prepare(`
      INSERT INTO files
      (file_id, user_id, project_id, filename, r2_key, file_size, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `)
        .bind(fileId, userId, projectId, filename, r2Key, content.length, now, now)
        .run()

      // Update project file_count
      await env.DB.prepare(
        "UPDATE projects SET file_count = file_count + 1, updated_at = ? WHERE project_id = ? AND user_id = ?"
      )
        .bind(now, projectId, userId)
        .run()

      log("info", "File created successfully", { file_id: fileId, r2Key })

      return json({ file_id: fileId }, 201, env, request)
    }

    /*
    --------------------------------------------------
    DELETE /files/:fileId
    Delete a file from D1 and R2
    --------------------------------------------------
    */
    if (method === "DELETE" && path.startsWith("/files/")) {

      const fileId = path.split("/")[2]

      if (!fileId) {
        return json({ error: "Missing file ID" }, 400, env, request)
      }

      log("info", "Deleting file", { fileId, userId })

      const check = await verifyFile(userId, fileId, env)

      if (check.error) {
        return json({ error: check.error }, check.status, env, request)
      }

      const file = check.file

      // Delete from R2
      await env.FILES_BUCKET.delete(file.r2_key)

      // Delete from D1
      await env.DB.prepare(
        "DELETE FROM files WHERE file_id = ?"
      )
        .bind(fileId)
        .run()

      // Update project file_count
      await env.DB.prepare(
        "UPDATE projects SET file_count = file_count - 1, updated_at = ? WHERE project_id = ? AND user_id = ?"
      )
        .bind(Date.now(), file.project_id, file.user_id)
        .run()

      log("info", "File deleted", { fileId, filename: file.filename })

      return json({ deleted: true }, 200, env, request)
    }

    /*
    --------------------------------------------------
    404 — Route not found
    --------------------------------------------------
    */
    log("warn", "Route not found", { method, path })

    return json({
      error: "Route not found",
      method,
      path
    }, 404, env, request)
  }

}
