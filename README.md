# FairPlay Click Game

A lightweight, responsive click game with multiple game modes and difficulty levels. Players select their preferred challenge, complete a timed round, and compete on global leaderboards.

## Game Modes

The game features four competitive modes, each with three difficulty levels (Easy, Normal, Hard):

### Classic
- **Duration**: 30 seconds (45s on Easy, 20s on Hard)
- **Objective**: Click the moving target dot as many times as possible
- **Scoring**: 100 points per successful hit
- **Mechanics**: Standard reaction-time gameplay

### Time Attack
- **Duration**: 2 minutes (all difficulties)
- **Objective**: Maximize your score before time runs out
- **Difficulty Scaling**: Target speed increases every 10 hits (adaptive challenge)
- **Scoring**: 100 points per hit; difficulty multiplier affects speed progression

### Survival
- **Duration**: Unlimited until first miss
- **Objective**: Achieve the longest hit streak
- **Game Over**: Missing one target ends the round immediately
- **Difficulty Scaling**: Targets fast up and become harder (exponentially faster on Hard)
- **Ranking Metric**: Hit count (survival length)

### Accuracy Challenge
- **Duration**: 60 seconds
- **Objective**: Maximize accuracy while scoring
- **Scoring Penalties**: -10 points per empty click
- **Scoring Bonus**: +0 to +25 points based on final accuracy (e.g., 100% accuracy = +25 bonus)
- **Focus**: Precision over speed

## Difficulty Levels

All modes support three difficulty tiers affecting target speed:

- **Easy**: Slower targets (2.0–2.5s spawn interval), longer rounds where applicable
- **Normal**: Standard speed (0.9–1.5s spawn interval), baseline experience
- **Hard**: Faster targets (0.5–0.9s spawn interval), shorter rounds where applicable

## Mode & Difficulty Selection

Before each game, players are presented with:
1. **Mode selector** — Choose which game mode (Classic, Time Attack, Survival, Accuracy Challenge)
2. **Difficulty picker** — Select your challenge level (Easy, Normal, Hard)
3. **Mode descriptions** — Hover over mode cards to see details

This data is sent to the backend and stored with the session for accurate leaderboard ranking.

## Post-Game Leaderboard Snapshot

After completing a game, the results modal displays:
- Your final score, accuracy, and reaction time
- **Top 3 scores** for the exact mode/difficulty just played
- Your rank badge if in top 3
- Encouragement to compete for the leaderboard

## Mobile Notes

- Optimized for both desktop and mobile viewport sizes.
- Mode selector adapts to single-column layout on small screens.
- Results modal supports mobile scrolling for smaller screens.
- Arena and controls adapt spacing and sizing for touch use.

## What it sends

The game creates a session and submits these metrics to the API:

- `score` — Final score (mode-dependent calculation)
- `accuracy` — Hit rate percentage
- `reactionTime` — Average reaction time in milliseconds
- `reactionStd` — Standard deviation of reaction times
- `networkLatency` — Initial connection latency
- `targetsHit` — Total successful target clicks
- `targetsMissed` — Targets that expired before click
- `emptyClicks` — Clicks on empty board area
- `inputTiming` — Average time from spawn to click
- `game_mode` — Selected game mode (classic, time_attack, survival, accuracy_challenge)
- `difficulty_mode` — Selected difficulty (easy, normal, hard)

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