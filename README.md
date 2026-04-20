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

- `VITE_API_URL` should point to the deployed backend, for example `https://fairplay-gamified-backend-production.up.railway.app`.

## Railway deployment

Use the included `Dockerfile` or deploy the folder as a Node service.

- Build command: `npm run build`
- Start command: `node server.cjs`
- Public port: `4173` or the Railway `PORT` value exposed to the container

The game is static after build, so it stays lightweight even when hosted on Railway.