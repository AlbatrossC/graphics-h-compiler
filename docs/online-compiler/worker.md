# Cloudflare Worker Deployment & Documentation

The Graphics.h Online Compiler uses a Cloudflare Worker backend to handle **User Authentication (Google OAuth)** and **Cloud File Storage (D1 SQLite)**.

This document explains how the worker works and how to deploy it to your own Cloudflare account for a self-hosted instance.

## Why a Cloudflare Worker?

The web application itself (Flask) is stateless and typically deployed on Vercel or similar platforms. However, saving files and managing users requires a database. We use a Cloudflare Worker with a D1 SQLite database because it is incredibly fast, offers a generous free tier, and has zero cold-boot latency.

## Deployment Guide

If you are self-hosting this project, you need to deploy the worker to your Cloudflare account and link it to your web deployment via environment variables.

### Prerequisites

1. A Cloudflare account (free tier is fine).
2. Node.js and npm installed.
3. Wrangler CLI installed (`npm install -g wrangler`).

### Step 1: Login to Cloudflare

Authenticate Wrangler with your Cloudflare account:

```bash
wrangler login
```

### Step 2: Create a D1 Database

You need a D1 database to store user files and data. Navigate to the worker's directory and run the following command:

```bash
cd workers/graphics-oc-files
wrangler d1 create graphicsh_oc_db
```

This will output a `database_id`.

### Step 3: Configure `wrangler.jsonc`

Open `workers/graphics-oc-files/wrangler.jsonc` and replace the `database_id` with the one you generated in the previous step.

```jsonc
{
  "name": "graphics-oc-files",
  "main": "src/index.js",
  "compatibility_date": "2024-02-23",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "graphicsh_oc_db",
      "database_id": "<YOUR_DATABASE_ID_HERE>"
    }
  ]
}
```

### Step 4: Initialize the Database Schema

Run the provided SQL schema to set up the necessary tables (`users`, `folders`, `files`):

```bash
wrangler d1 execute graphicsh_oc_db --file=./schema.sql --remote
```

### Step 5: Set up Secrets

Your worker needs a secret key to sign session cookies. Generate a random string (e.g., using `python -c "import secrets; print(secrets.token_urlsafe(48))"`) and add it to the worker as a secret:

```bash
wrangler secret put SESSION_SECRET
```
Paste your generated secret when prompted.

### Step 6: Deploy the Worker

Deploy your worker to Cloudflare:

```bash
wrangler deploy
```

Once deployed, Wrangler will give you a URL for your worker (e.g., `https://graphics-oc-files.<your-subdomain>.workers.dev`).

### Step 7: Configure Your Web Application

To connect your frontend (Vercel/Flask deployment) to your new worker, you **must not hardcode** the worker URL. Instead, add it to your `.env` file for the Flask application.

In your web app's root `.env` (or Vercel environment variables), set:

```env
USER_FILES_WORKERS=https://graphics-oc-files.<your-subdomain>.workers.dev
```

You will also need to configure your `GOOGLE_CLIENT_ID` and the same `SESSION_SECRET` in your `.env` so the frontend and backend can coordinate authentication. See `.env.example` for details.

---

## Developer Architecture

The worker (`graphics-oc-files`) handles:

- **Auth Proxying**: Verifying Google ID tokens and setting an `HttpOnly` JWT session cookie.
- **File Management**: CRUD operations for user files (`/api/file/save`, `/api/file/delete`).
- **Storage Limits**: Deduplication of files using content hashes to save space.

All UI components dynamically fetch the worker URL from the backend configuration on load. If `USER_FILES_WORKERS` is empty, the application automatically falls back to **Guest Mode**, saving files strictly in the browser's `IndexedDB` with no cloud storage integration.

---

## The Public Assets Worker (`r2-public-assets`)

There is an additional, **completely optional** worker located in `workers/r2-public-assets`. 

This worker is designed to serve heavy static assets (like the Turbo C++ compiler zip file and demo videos) from Cloudflare R2 storage instead of your primary Vercel deployment.

**Why use it?**
If you self-host the frontend on Vercel and serve large zip files and videos directly from the `/static` folder or Vercel Blob, you will quickly hit Vercel's bandwidth and blob storage limits if your site gets traffic. Cloudflare R2 is significantly cheaper (and has a generous free tier) for high-bandwidth egress.

**How to use it:**
1. Create an R2 bucket in Cloudflare.
2. Update the `wrangler.jsonc` in `workers/r2-public-assets` to point to your bucket.
3. Upload the files from the `static/videos` and `compiler-assets` folders to the bucket.
4. Deploy the worker.
5. Add the resulting URL to your `.env` file as `PUBLIC_ASSETS_URL`.

If you do not configure `PUBLIC_ASSETS_URL`, the application will seamlessly fall back to serving all assets locally from your web server.
