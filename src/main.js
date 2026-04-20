import './style.css';

const app = document.querySelector('#app');

const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL || '/api');
const PUBLIC_API_FALLBACK_BASE = normalizeApiBase(import.meta.env.VITE_BACKEND_PUBLIC_URL || '');
const GAME_SECONDS = 30;
const MIN_TARGET_LIFE_MS = 900;
const MAX_TARGET_LIFE_MS = 1500;
const DOT_SCORE = 100;

const state = {
  phase: 'idle',
  playerName: '',
  sessionId: null,
  score: 0,
  hits: 0,
  missedTargets: 0,
  emptyClicks: 0,
  reactionTimes: [],
  startLatencyMs: 0,
  timeLeft: GAME_SECONDS,
  spawnAt: 0,
  targetId: 0,
};

const refs = {
  form: null,
  nameInput: null,
  error: null,
  status: null,
  score: null,
  hits: null,
  misses: null,
  empties: null,
  accuracy: null,
  reaction: null,
  timeLeft: null,
  board: null,
  target: null,
  results: null,
  resultsBody: null,
  playAgain: null,
};

let countdownTimer = null;
let targetTimer = null;
let finishLock = false;

renderIntro();

function normalizeApiBase(value) {
  return String(value).replace(/\/$/, '');
}

async function api(path, options = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  const requestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  };

  const response = await fetch(`${API_BASE}${normalizedPath}`, requestInit);

  // If same-origin proxy (/api) fails with gateway errors, retry directly against public backend.
  if (
    response.status === 502 &&
    API_BASE.startsWith('/') &&
    PUBLIC_API_FALLBACK_BASE &&
    /^https?:\/\//i.test(PUBLIC_API_FALLBACK_BASE)
  ) {
    const fallbackResponse = await fetch(`${PUBLIC_API_FALLBACK_BASE}${normalizedPath}`, requestInit);
    if (!fallbackResponse.ok) {
      const fallbackText = await fallbackResponse.text();
      throw new Error(fallbackText || `Request failed with status ${fallbackResponse.status}`);
    }

    if (fallbackResponse.status === 204) {
      return null;
    }

    return fallbackResponse.json();
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function renderIntro(errorMessage = '') {
  cleanupGameTimers();
  state.phase = 'idle';
  app.innerHTML = `
    <main class="intro-shell">
      <section class="intro-card">
        <p class="eyebrow">FairPlay Game</p>
        <h1>Click the dot for 30 seconds.</h1>
        <p class="intro-copy">
          Enter your name, start the round, and send your score directly to the dashboard API.
        </p>
        <form class="start-form" id="start-form" novalidate>
          <label class="field-label" for="player-name">Player name</label>
          <div class="field-row">
            <input id="player-name" name="playerName" class="text-input" maxlength="24" autocomplete="nickname" placeholder="e.g. Nova" required />
            <button class="primary-button" type="submit">Start game</button>
          </div>
          <p class="field-hint">The game is optimized for mobile and desktop screens.</p>
          <p class="field-error" id="intro-error" role="alert">${escapeHtml(errorMessage)}</p>
        </form>
      </section>
      <aside class="preview-card">
        <div class="preview-ring"></div>
        <div class="preview-dot"></div>
        <p>Lightweight, responsive, and built to post live results to your backend.</p>
      </aside>
    </main>
  `;

  refs.form = document.querySelector('#start-form');
  refs.nameInput = document.querySelector('#player-name');
  refs.error = document.querySelector('#intro-error');

  refs.form.addEventListener('submit', handleStart);
  refs.nameInput.focus();
}

async function handleStart(event) {
  event.preventDefault();

  const name = refs.nameInput.value.trim();
  if (!name) {
    showIntroError('Enter a player name first.');
    return;
  }

  setIntroBusy(true);
  showIntroError('');

  try {
    const startedAt = performance.now();
    const session = await api('/sessions', {
      method: 'POST',
      body: JSON.stringify({ player: name }),
    });

    state.playerName = session.player || name;
    state.sessionId = session.id;
    state.startLatencyMs = Math.max(0, Math.round(performance.now() - startedAt));
    startGame();
  } catch (error) {
    showIntroError(error.message || 'Could not start the game. Check the API URL and try again.');
    setIntroBusy(false);
  }
}

function setIntroBusy(isBusy) {
  if (refs.form) {
    const button = refs.form.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = isBusy;
      button.textContent = isBusy ? 'Starting...' : 'Start game';
    }
  }
  if (refs.nameInput) {
    refs.nameInput.disabled = isBusy;
  }
}

function showIntroError(message) {
  if (refs.error) {
    refs.error.textContent = message;
  }
}

function startGame() {
  state.phase = 'playing';
  state.score = 0;
  state.hits = 0;
  state.missedTargets = 0;
  state.emptyClicks = 0;
  state.reactionTimes = [];
  state.timeLeft = GAME_SECONDS;
  state.spawnAt = 0;
  state.targetId = 0;
  finishLock = false;

  app.innerHTML = `
    <main class="game-shell">
      <header class="hud">
        <div class="hud-block">
          <span class="hud-label">Player</span>
          <strong id="hud-player"></strong>
        </div>
        <div class="hud-grid">
          <div class="hud-block">
            <span class="hud-label">Score</span>
            <strong id="hud-score">0</strong>
          </div>
          <div class="hud-block">
            <span class="hud-label">Hits</span>
            <strong id="hud-hits">0</strong>
          </div>
          <div class="hud-block">
            <span class="hud-label">Misses</span>
            <strong id="hud-misses">0</strong>
          </div>
          <div class="hud-block">
            <span class="hud-label">Empty clicks</span>
            <strong id="hud-empties">0</strong>
          </div>
          <div class="hud-block">
            <span class="hud-label">Accuracy</span>
            <strong id="hud-accuracy">0%</strong>
          </div>
          <div class="hud-block">
            <span class="hud-label">Avg reaction</span>
            <strong id="hud-reaction">0 ms</strong>
          </div>
        </div>
        <div class="timer-pill">
          <span class="hud-label">Time left</span>
          <strong id="hud-time">30s</strong>
        </div>
      </header>

      <section class="arena-wrap">
        <div class="arena" id="arena" aria-label="Game board">
          <div class="arena-grid"></div>
          <button class="target" id="target" type="button" aria-label="Click the dot"></button>
        </div>
        <p class="status-line" id="status-line">Get ready. The first dot is live.</p>
      </section>
    </main>

    <section class="results-panel hidden" id="results-panel" aria-live="polite">
      <div class="results-card">
        <p class="eyebrow">Round complete</p>
        <h2 id="results-title">Nice run.</h2>
        <div class="results-grid" id="results-body"></div>
        <div class="results-actions">
          <button class="primary-button" id="play-again" type="button">Play again</button>
        </div>
      </div>
    </section>
  `;

  refs.score = document.querySelector('#hud-score');
  refs.hits = document.querySelector('#hud-hits');
  refs.misses = document.querySelector('#hud-misses');
  refs.empties = document.querySelector('#hud-empties');
  refs.accuracy = document.querySelector('#hud-accuracy');
  refs.reaction = document.querySelector('#hud-reaction');
  refs.timeLeft = document.querySelector('#hud-time');
  refs.board = document.querySelector('#arena');
  refs.target = document.querySelector('#target');
  refs.results = document.querySelector('#results-panel');
  refs.resultsBody = document.querySelector('#results-body');
  refs.playAgain = document.querySelector('#play-again');
  const playerNode = document.querySelector('#hud-player');
  const statusNode = document.querySelector('#status-line');

  playerNode.textContent = state.playerName;
  statusNode.textContent = 'Tap the dot as fast as you can.';

  refs.board.addEventListener('click', handleBoardClick);
  refs.target.addEventListener('click', handleTargetClick);
  refs.playAgain.addEventListener('click', () => renderIntro());

  updateHud();
  spawnTarget();
  countdownTimer = window.setInterval(tickClock, 1000);
}

function handleBoardClick(event) {
  if (state.phase !== 'playing') {
    return;
  }

  if (event.target === refs.target) {
    return;
  }

  state.emptyClicks += 1;
  updateHud('Empty click recorded.');
}

function handleTargetClick(event) {
  event.stopPropagation();

  if (state.phase !== 'playing') {
    return;
  }

  const reactionTime = Math.max(0, Math.round(performance.now() - state.spawnAt));
  state.reactionTimes.push(reactionTime);
  state.hits += 1;
  state.score += DOT_SCORE;

  clearTimeout(targetTimer);
  updateHud('Nice hit. New dot appears.');
  spawnTarget();
}

function spawnTarget() {
  if (state.phase !== 'playing') {
    return;
  }

  state.targetId += 1;
  const activeTargetId = state.targetId;
  state.spawnAt = performance.now();

  positionTarget();

  clearTimeout(targetTimer);
  const lifeMs = randomBetween(MIN_TARGET_LIFE_MS, MAX_TARGET_LIFE_MS);
  targetTimer = window.setTimeout(() => {
    if (state.phase !== 'playing' || state.targetId !== activeTargetId) {
      return;
    }

    state.missedTargets += 1;
    updateHud('The dot moved before you reached it.');
    spawnTarget();
  }, lifeMs);
}

function positionTarget() {
  if (!refs.board || !refs.target) {
    return;
  }

  const boardRect = refs.board.getBoundingClientRect();
  const targetRect = refs.target.getBoundingClientRect();
  const maxX = Math.max(0, boardRect.width - targetRect.width - 12);
  const maxY = Math.max(0, boardRect.height - targetRect.height - 12);
  const x = randomBetween(12, maxX + 12);
  const y = randomBetween(12, maxY + 12);

  refs.target.style.transform = `translate(${x}px, ${y}px)`;
}

function tickClock() {
  if (state.phase !== 'playing') {
    return;
  }

  state.timeLeft -= 1;
  updateHud();

  if (state.timeLeft <= 0) {
    finishGame();
  }
}

async function finishGame() {
  if (finishLock || state.phase !== 'playing') {
    return;
  }

  finishLock = true;
  state.phase = 'finishing';
  cleanupGameTimers();

  const summary = buildSummary();
  showResults(summary, 'Submitting results...');

  try {
    await api(`/sessions/${state.sessionId}/metrics`, {
      method: 'POST',
      body: JSON.stringify(summary),
    });

    await api(`/sessions/${state.sessionId}/complete`, {
      method: 'POST',
    });

    showResults(summary, 'Results saved to the dashboard.');
  } catch (error) {
    showResults(summary, `Saved locally, but API submission failed: ${error.message}`);
  } finally {
    state.phase = 'finished';
    setIntroBusy(false);
    finishLock = false;
  }
}

function buildSummary() {
  const totalClicks = state.hits + state.missedTargets + state.emptyClicks;
  const accuracy = totalClicks > 0 ? roundToOne((state.hits / totalClicks) * 100) : 0;
  const averageReaction = average(state.reactionTimes);
  const reactionStd = standardDeviation(state.reactionTimes);

  return {
    score: state.score,
    accuracy,
    reactionTime: Math.round(averageReaction),
    reactionStd: roundToOne(reactionStd),
    networkLatency: state.startLatencyMs,
    targetsHit: state.hits,
    targetsMissed: state.missedTargets,
    emptyClicks: state.emptyClicks,
    inputTiming: Math.round(averageReaction),
  };
}

function updateHud(message = '') {
  if (refs.score) {
    refs.score.textContent = String(state.score);
  }
  if (refs.hits) {
    refs.hits.textContent = String(state.hits);
  }
  if (refs.misses) {
    refs.misses.textContent = String(state.missedTargets);
  }
  if (refs.empties) {
    refs.empties.textContent = String(state.emptyClicks);
  }
  if (refs.accuracy) {
    refs.accuracy.textContent = `${formatAccuracy()}%`;
  }
  if (refs.reaction) {
    refs.reaction.textContent = `${Math.round(average(state.reactionTimes))} ms`;
  }
  if (refs.timeLeft) {
    refs.timeLeft.textContent = `${Math.max(0, state.timeLeft)}s`;
  }
  if (message) {
    const statusLine = document.querySelector('#status-line');
    if (statusLine) {
      statusLine.textContent = message;
    }
  }
}

function formatAccuracy() {
  const totalClicks = state.hits + state.missedTargets + state.emptyClicks;
  if (totalClicks === 0) {
    return '0.0';
  }
  return roundToOne((state.hits / totalClicks) * 100).toFixed(1);
}

function showResults(summary, message) {
  if (!refs.results || !refs.resultsBody) {
    return;
  }

  refs.results.classList.remove('hidden');
  refs.resultsBody.innerHTML = `
    <div class="metric"><span>Player</span><strong>${escapeHtml(state.playerName)}</strong></div>
    <div class="metric"><span>Score</span><strong>${summary.score}</strong></div>
    <div class="metric"><span>Accuracy</span><strong>${summary.accuracy.toFixed(1)}%</strong></div>
    <div class="metric"><span>Average reaction</span><strong>${summary.reactionTime} ms</strong></div>
    <div class="metric"><span>Hits</span><strong>${summary.targetsHit}</strong></div>
    <div class="metric"><span>Misses</span><strong>${summary.targetsMissed}</strong></div>
    <div class="metric"><span>Empty clicks</span><strong>${summary.emptyClicks}</strong></div>
    <div class="metric"><span>API latency</span><strong>${summary.networkLatency} ms</strong></div>
    <p class="results-note">${escapeHtml(message)}</p>
  `;
}

function cleanupGameTimers() {
  if (countdownTimer) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }

  if (targetTimer) {
    window.clearTimeout(targetTimer);
    targetTimer = null;
  }
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function average(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) {
    return 0;
  }

  const avg = average(values);
  const variance = values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function roundToOne(value) {
  return Math.round(value * 10) / 10;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}