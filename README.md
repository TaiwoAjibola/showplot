# ShowPlot

Stage plot builder with an asset library and Google-only sign-in.

## Requirements

- Node.js 20+
- MongoDB (Atlas or local)

## Environment variables

Copy `.env.example` to `.env` and fill in values.

Required:

- `MONGODB_URI`
- `MONGODB_DB`
- `GOOGLE_CLIENT_ID` (Google OAuth Web client ID)
- `VITE_GOOGLE_CLIENT_ID` (same value as `GOOGLE_CLIENT_ID`)
- `SESSION_SECRET` (long random string used to sign session cookies)

## Google OAuth setup (high level)

In Google Cloud Console:

- Create an OAuth 2.0 Client ID (Web application)
- Add Authorized JavaScript origins:
	- `http://localhost:5173`
	- `https://showplot.vercel.app`
- Add Authorized redirect URIs:
	- (not required for Google Identity Services button/One Tap)

## Run (development)

Install deps:

`npm install`

Start client + server:

`npm run dev`

- App: `http://localhost:5173/app`
- Admin: `http://localhost:5174/`
- API: `http://localhost:5050/api`

## Build + run (production)

Build:

`npm run build`

This produces two frontend builds:

- User app: `dist/`
- Admin app: `dist-admin/`

Start server:

`npm run start`

Then visit:

- `http://localhost:5050/app`

## Deploy (Vercel frontends + hosted backend)

You will typically deploy:

- Backend (Express) to a Node host (Render / Railway / Fly.io)
- Frontends (User + Admin) to Vercel

### 1) Deploy backend (Render example)

- Create a new Web Service from this repo
- **Build command**: `npm install`
- **Start command**: `node server.js`
- Set environment variables (see `.env.example`):
	- `MONGODB_URI`, `MONGODB_DB`, `GOOGLE_CLIENT_ID`, `SESSION_SECRET`
	- `CORS_ORIGIN` (comma-separated allowlist)
		- Dev: `http://localhost:5173,http://localhost:5174`
		- Prod (this repo's default Vercel domains): `https://showplot.vercel.app,https://showplot-admin.vercel.app`
- Copy the deployed backend URL (example: `https://showplot-api.onrender.com`)

### 2) Deploy User app to Vercel

- Import the GitHub repo into Vercel
- **Framework preset**: Vite
- **Build command**: `npm run build:user`
- **Output directory**: `dist`
- Environment variables:
	- `VITE_GOOGLE_CLIENT_ID`

This repo proxies API calls by rewriting `/api/*` to the Render backend in `vercel.user.json`.
If your backend URL differs, update the `destination` there.

### 3) Deploy Admin app to Vercel (separate project)

Create a second Vercel project pointing to the same repo, with:

- **Framework preset**: Vite
- **Build command**: `npm run build:admin`
- **Output directory**: `dist-admin`
- Environment variables:
	- `VITE_USER_APP_ORIGIN` (production user app origin, e.g. `https://showplot.vercel.app`)

This repo proxies API calls by rewriting `/api/*` to the Render backend in `vercel.admin.json`.
If your backend URL differs, update the `destination` there.

### Deploy using Vercel CLI (2 projects)

This repo includes two Vercel config files so each project can have different build/output settings:

- `vercel.user.json` (builds `dist/`)
- `vercel.admin.json` (builds `dist-admin/`)

1) Login:

`npm run vercel:login`

2) One-time setup: link + store each project

Link and pick/create the **User** project:

`npm run vercel:link`

Store the link as `.vercel.user/`:

`npm run vercel:store:user`

Now link and pick/create the **Admin** project:

`npm run vercel:link`

Store the link as `.vercel.admin/`:

`npm run vercel:store:admin`

3) Deploy User app:

`npm run deploy:user`

4) Deploy Admin app:

`npm run deploy:admin`

5) Set env vars for each project (run after activating that project):

- `VITE_GOOGLE_CLIENT_ID`
- `BACKEND_ORIGIN`

Example:

`npx vercel env add BACKEND_ORIGIN production`

Paste your backend base URL when prompted.

### Notes

- API proxying is implemented via Vercel `rewrites` in `vercel.json`, `vercel.user.json`, and `vercel.admin.json`.
- For Google OAuth, add your Vercel URL (user app) to **Authorized JavaScript origins** in Google Cloud Console.

## Notes

- API endpoints under `/api/plots` and `/api/feedback` require a signed-in user.
- Sessions are stored in an HTTP-only cookie (`sp_session`). In production you should run behind HTTPS.
