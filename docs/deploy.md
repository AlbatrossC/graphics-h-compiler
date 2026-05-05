# Vercel Deployment Guide

The Graphics.h Online Compiler is fully configured to be deployed on Vercel with zero friction. Follow these steps to host your own instance of the compiler frontend.

## 1. Prerequisites

- A [Vercel](https://vercel.com) account.
- The repository pushed to your own GitHub, GitLab, or Bitbucket account.

## 2. Deploying on Vercel

1. Log into your Vercel dashboard and click **Add New... > Project**.
2. Select your repository from the list and click **Import**.
3. **Framework Preset**: Vercel will likely detect Python. If it asks, the Framework Preset is "Other".
4. **Build Command**: The `vercel.json` in the root directory will handle the build command automatically (it runs `python build.py`), so you don't need to override the build command in the Vercel dashboard.

## 3. Environment Variables

During the deployment setup (or in the **Settings > Environment Variables** tab after deployment), you need to add the following variables:

| Variable | Description |
|----------|-------------|
| `USER_FILES_WORKERS` | The URL of your deployed Cloudflare Worker for auth & file storage. Example: `https://graphics-oc-files.your-subdomain.workers.dev`. If left empty, the app runs in guest mode (browser storage only). |
| `PUBLIC_ASSETS_URL` | The URL for serving large static files (videos, zip files). Example: `https://r2-public-assets.your-subdomain.workers.dev`. If left empty, assets fall back to being served directly from your Vercel deployment. |
| `GOOGLE_CLIENT_ID` | Your Google OAuth 2.0 Client ID (from Google Cloud Console). Required if you want the "Sign in with Google" button to work. |
| `SESSION_SECRET` | A 64-character random string used by the backend to sign JWT tokens. You **must** configure this identically here and in your Cloudflare Worker. |
| `DISCORD_WEBHOOK_URL` | Optional. If you want the contact page to work, paste a Discord channel webhook URL here. |

## 4. Deploy

Click **Deploy**. 

Vercel will:
1. Run `python build.py` to minify the CSS and JS, bundle CodeMirror, and generate `asset-manifest.json`.
2. Build the serverless Flask functions (via Vercel's Python runtime).
3. Deploy the application!

## 5. Post-Deployment Steps

If you are using Google Authentication:
1. Go to your [Google Cloud Console](https://console.cloud.google.com).
2. Find your OAuth Client ID credentials.
3. Add your new Vercel domain (e.g., `https://your-project.vercel.app`) to the **Authorized JavaScript origins**.
4. Add `https://your-project.vercel.app` to the **Authorized redirect URIs** (although the application intercepts the callback, Google still requires the origin to be authorized).

That's it! Your Graphics.h Online Compiler is now live.
