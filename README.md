# FairPlay Click Game

A lightweight, responsive click game that starts with a player name prompt, runs a 30-second round, and posts the final score to the FairPlay backend.

## What it sends

The game creates a session and then submits these metrics to the API:

- `score`
- `accuracy`
- `reactionTime`
- `reactionStd`
- `networkLatency`
- `targetsHit`
- `targetsMissed`
- `emptyClicks`
- `inputTiming`

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set the API URL:

   ```bash
   copy .env.example .env
   ```

3. Run the app:

   ```bash
   npm run dev
   ```

## Environment

- `VITE_API_URL` defaults to `/api` and should usually stay `/api`.
- Backend routes remain `/sessions`, `/health`, etc. The `/api` prefix is only on the game service and is stripped by proxy before forwarding.
- `BACKEND_INTERNAL_URL` is used by the runtime server to proxy `/api` to your backend service.
- `BACKEND_PUBLIC_URL` is an optional fallback if private networking cannot be reached from the game service.
- `VITE_BACKEND_PUBLIC_URL` is an optional browser fallback URL if `/api` responds with `502`.
- `VITE_DEV_API_TARGET` is optional and only used for local `npm run dev` proxying.

## Railway deployment

Use the included `Dockerfile` or deploy the folder as a Node service.

- Build command: `npm run build`
- Start command: `node server.cjs`
- Public port: `4173` or the Railway `PORT` value exposed to the container

Recommended Railway variable:

- `BACKEND_INTERNAL_URL=http://fairplay-gamified-backend.railway.internal`

Optional fallback variable:

- `BACKEND_PUBLIC_URL=https://fairplay-gamified-backend-production.up.railway.app`

The game is static after build, so it stays lightweight even when hosted on Railway.