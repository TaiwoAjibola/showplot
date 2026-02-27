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
- Copy the deployed backend URL (example: `https://showplot-api.onrender.com`)

### 2) Deploy User app to Vercel

- Import the GitHub repo into Vercel
- **Framework preset**: Vite
- **Build command**: `npm run build:user`
- **Output directory**: `dist`
- Environment variables:
	- `VITE_GOOGLE_CLIENT_ID`
	- `BACKEND_ORIGIN` (the backend base URL from step 1)

### 3) Deploy Admin app to Vercel (separate project)

Create a second Vercel project pointing to the same repo, with:

- **Framework preset**: Vite
- **Build command**: `npm run build:admin`
- **Output directory**: `dist-admin`
- Environment variables:
	- `VITE_GOOGLE_CLIENT_ID`
	- `BACKEND_ORIGIN`

### Notes

- This repo includes a Vercel Serverless Function at `api/[...path].js` which proxies `/api/*` to your backend using `BACKEND_ORIGIN`.
- For Google OAuth, add your Vercel URLs (user + admin) to **Authorized JavaScript origins** in Google Cloud Console.

## Notes

- API endpoints under `/api/plots` and `/api/feedback` require a signed-in user.
- Sessions are stored in an HTTP-only cookie (`sp_session`). In production you should run behind HTTPS.
