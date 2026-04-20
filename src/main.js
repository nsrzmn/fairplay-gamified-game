import './style.css';

const app = document.querySelector('#app');

const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL || '/api');
const PUBLIC_API_FALLBACK_BASE = normalizeApiBase(import.meta.env.VITE_BACKEND_PUBLIC_URL || '');

// Game mode configurations
const GAME_MODES = {
  classic: {
    name: 'Classic',
    description: 'Standard 30-second game with normal target speed.',
    difficulties: {
      easy: { label: 'Easy', duration: 45, minLife: 2000, maxLife: 2500 },
      normal: { label: 'Normal', duration: 30, minLife: 900, maxLife: 1500 },
      hard: { label: 'Hard', duration: 20, minLife: 500, maxLife: 900 },
    },
  },
  time_attack: {
    name: 'Time Attack',
    description: 'Score as many points as you can in 2 minutes. Target speed increases every 10 hits.',
    difficulties: {
      easy: { label: 'Easy', duration: 120, minLife: 2000, maxLife: 2500, scaling: 0.95 },
      normal: { label: 'Normal', duration: 120, minLife: 900, maxLife: 1500, scaling: 0.90 },
      hard: { label: 'Hard', duration: 120, minLife: 500, maxLife: 900, scaling: 0.80 },
    },
  },
  survival: {
    name: 'Survival',
    description: 'Hit targets until you miss. Try to achieve the highest hit count!',
    difficulties: {
      easy: { label: 'Easy', duration: 999, minLife: 2000, maxLife: 2500, scaling: 0.98 },
      normal: { label: 'Normal', duration: 999, minLife: 900, maxLife: 1500, scaling: 0.93 },
      hard: { label: 'Hard', duration: 999, minLife: 500, maxLife: 900, scaling: 0.85 },
    },
  },
  accuracy_challenge: {
    name: 'Accuracy Challenge',
    description: 'Score bonus for high accuracy. Empty clicks are penalized. 60 seconds to prove your precision.',
    difficulties: {
      easy: { label: 'Easy', duration: 60, minLife: 2000, maxLife: 2500 },
      normal: { label: 'Normal', duration: 60, minLife: 900, maxLife: 1500 },
      hard: { label: 'Hard', duration: 60, minLife: 500, maxLife: 900 },
    },
  },
};

const DOT_SCORE = 100;

const state = {
  phase: 'idle',
  playerName: '',
  playerType: 'player', // 'player' or 'imposter'
  gameMode: 'classic',
  difficultyMode: 'normal',
  sessionId: null,
  score: 0,
  hits: 0,
  missedTargets: 0,
  emptyClicks: 0,
  reactionTimes: [],
  startLatencyMs: 0,
  timeLeft: 0,
  spawnAt: 0,
  targetId: 0,
  modeConfig: null,
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

  state.playerName = name;
  renderPlayerTypeSelector();
}

function renderPlayerTypeSelector() {
  cleanupGameTimers();
  state.phase = 'player-type-select';
  app.innerHTML = `
    <main class="player-type-shell">
      <section class="player-type-card">
        <p class="eyebrow">Choose Your Role</p>
        <h1>Player or Imposter?</h1>
        <p class="player-type-subtitle">The dashboard will see all. Can you fool the fairness detector?</p>
        
        <div class="player-type-options">
          <button class="player-type-btn player-btn" id="player-choice" type="button">
            <div class="type-icon">👤</div>
            <h3>Player</h3>
            <p>Play normally and compete fairly on the leaderboard.</p>
          </button>
          
          <button class="player-type-btn imposter-btn" id="imposter-choice" type="button">
            <div class="type-icon">🤖</div>
            <h3>Imposter</h3>
            <p>Let the bot play for you with superhuman speed. Will the dashboard catch you?</p>
          </button>
        </div>
        
        <button class="secondary-button" id="back-to-name" type="button">Change Name</button>
      </section>
    </main>
  `;
  
  const playerBtn = document.querySelector('#player-choice');
  const imposterBtn = document.querySelector('#imposter-choice');
  const backBtn = document.querySelector('#back-to-name');
  
  playerBtn.addEventListener('click', () => {
    state.playerType = 'player';
    renderModeSelector();
  });
  
  imposterBtn.addEventListener('click', () => {
    state.playerType = 'imposter';
    renderModeSelector();
  });
  
  backBtn.addEventListener('click', () => renderIntro());
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

function renderModeSelector() {
  cleanupGameTimers();
  state.phase = 'mode-select';
  
  const modeOptions = Object.entries(GAME_MODES).map(([key, mode]) => `
    <div class="mode-card">
      <input type="radio" id="mode-${key}" name="gameMode" value="${key}" ${key === 'classic' ? 'checked' : ''} />
      <label for="mode-${key}" class="mode-label">
        <h3>${mode.name}</h3>
        <p>${mode.description}</p>
      </label>
    </div>
  `).join('');
  
  const diffOptions = Object.entries(GAME_MODES.classic.difficulties).map(([key, diff]) => `
    <label class="difficulty-option">
      <input type="radio" name="difficulty" value="${key}" ${key === 'normal' ? 'checked' : ''} />
      <span>${diff.label}</span>
    </label>
  `).join('');
  
  app.innerHTML = `
    <main class="mode-selector-shell">
      <section class="mode-selector-card">
        <p class="eyebrow">Game Setup</p>
        <h1>Choose your challenge</h1>
        
        <div class="mode-select-group">
          <p class="field-label">Game Mode</p>
          <div id="mode-options" class="modes-container">
            ${modeOptions}
          </div>
        </div>
        
        <div class="difficulty-select-group">
          <p class="field-label">Difficulty</p>
          <div id="difficulty-options" class="difficulty-container">
            ${diffOptions}
          </div>
        </div>
        
        <div class="mode-actions">
          <button class="secondary-button" type="button" id="back-btn">Back</button>
          <button class="primary-button" type="button" id="play-btn">Play</button>
        </div>
      </section>
    </main>
  `;
  
  const modeRadios = document.querySelectorAll('input[name="gameMode"]');
  const diffRadios = document.querySelectorAll('input[name="difficulty"]');
  const backBtn = document.querySelector('#back-btn');
  const playBtn = document.querySelector('#play-btn');
  const diffContainer = document.querySelector('#difficulty-options');
  
  modeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.gameMode = e.target.value;
      updateDifficultyOptions();
    });
  });
  
  diffRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.difficultyMode = e.target.value;
    });
  });
  
  backBtn.addEventListener('click', () => renderIntro());
  playBtn.addEventListener('click', async () => {
    await startGameSession();
  });
}

function updateDifficultyOptions() {
  const modeConfig = GAME_MODES[state.gameMode];
  const difficulties = Object.entries(modeConfig.difficulties);
  
  const diffContainer = document.querySelector('#difficulty-options');
  diffContainer.innerHTML = difficulties.map(([key, diff]) => `
    <label class="difficulty-option">
      <input type="radio" name="difficulty" value="${key}" ${key === state.difficultyMode ? 'checked' : ''} />
      <span>${diff.label}</span>
    </label>
  `).join('');
  
  const diffRadios = document.querySelectorAll('input[name="difficulty"]');
  diffRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.difficultyMode = e.target.value;
    });
  });
}

async function startGameSession() {
  const playBtn = document.querySelector('#play-btn');
  if (playBtn) playBtn.disabled = true;
  
  try {
    const startedAt = performance.now();
    const session = await api('/sessions', {
      method: 'POST',
      body: JSON.stringify({
        player: state.playerName,
        game_mode: state.gameMode,
        difficulty_mode: state.difficultyMode,
      }),
    });

    state.sessionId = session.id;
    state.startLatencyMs = Math.max(0, Math.round(performance.now() - startedAt));
    startGame();
  } catch (error) {
    if (playBtn) playBtn.disabled = false;
    alert(error.message || 'Could not start the game. Check the API URL and try again.');
  }
}

function startGame() {
  state.phase = 'playing';
  state.score = 0;
  state.hits = 0;
  state.missedTargets = 0;
  state.emptyClicks = 0;
  state.reactionTimes = [];
  state.modeConfig = GAME_MODES[state.gameMode].difficulties[state.difficultyMode];
  state.timeLeft = state.modeConfig.duration;
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
  refs.playAgain.addEventListener('click', () => renderModeSelector());

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
  
  // Apply difficulty-based timing, with scaling for survival mode
  const baseConfig = state.modeConfig;
  let minLife = baseConfig.minLife;
  let maxLife = baseConfig.maxLife;
  
  // For survival mode, increase difficulty every 10 hits
  if (state.gameMode === 'survival' && baseConfig.scaling) {
    const difficulty_factor = Math.pow(baseConfig.scaling, Math.floor(state.hits / 10));
    minLife = Math.round(minLife * difficulty_factor);
    maxLife = Math.round(maxLife * difficulty_factor);
  }
  
  const lifeMs = randomBetween(minLife, maxLife);
  
  // If imposter mode, auto-click with superhuman speed
  if (state.playerType === 'imposter') {
    const imposterReactionMs = randomBetween(30, 80); // Impossibly fast and consistent
    const autoClickTimer = window.setTimeout(() => {
      if (state.phase === 'playing' && state.targetId === activeTargetId) {
        triggerTargetClick(imposterReactionMs);
      }
    }, imposterReactionMs);
    
    // Store timer for cleanup if needed
    if (!window._imposterTimers) window._imposterTimers = [];
    window._imposterTimers.push(autoClickTimer);
  }
  
  targetTimer = window.setTimeout(() => {
    if (state.phase !== 'playing' || state.targetId !== activeTargetId) {
      return;
    }

    // For survival mode, missing ends the game
    if (state.gameMode === 'survival') {
      finishGame();
      return;
    }

    state.missedTargets += 1;
    updateHud('The dot moved before you reached it.');
    spawnTarget();
  }, lifeMs);
}

// Helper function to trigger target click programmatically
function triggerTargetClick(reactionTime) {
  if (state.phase !== 'playing') {
    return;
  }

  state.reactionTimes.push(reactionTime);
  state.hits += 1;
  state.score += DOT_SCORE;

  clearTimeout(targetTimer);
  
  // Visual feedback
  refs.target.classList.add('hit-animation');
  setTimeout(() => refs.target.classList.remove('hit-animation'), 100);
  
  updateHud('Hit!');
  spawnTarget();
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
  showResults(summary, 'Submitting results...', null);

  try {
    await api(`/sessions/${state.sessionId}/metrics`, {
      method: 'POST',
      body: JSON.stringify(summary),
    });

    await api(`/sessions/${state.sessionId}/complete`, {
      method: 'POST',
    });

    // Fetch leaderboard for current mode/difficulty
    let leaderboardData = null;
    try {
      leaderboardData = await api(
        `/leaderboard/global?mode=${state.gameMode}&difficulty=${state.difficultyMode}&limit=5`,
        { method: 'GET' }
      );
    } catch (error) {
      console.warn('Could not fetch leaderboard:', error);
    }

    showResults(summary, 'Results saved to the dashboard.', leaderboardData);
  } catch (error) {
    showResults(summary, `Saved locally, but API submission failed: ${error.message}`, null);
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
  
  let finalScore = state.score;
  
  // Apply game mode-specific scoring
  if (state.gameMode === 'accuracy_challenge') {
    // Base score from hits
    finalScore = state.hits * DOT_SCORE;
    // Penalty for empty clicks
    finalScore -= state.emptyClicks * 10;
    // Bonus for high accuracy
    const accuracyBonus = Math.floor((accuracy / 10) * 25); // 0-25 bonus for 0-100% accuracy
    finalScore += accuracyBonus;
    finalScore = Math.max(0, finalScore); // Ensure non-negative
  }

  return {
    sessionId: state.sessionId,
    score: finalScore,
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

function showResults(summary, message, leaderboardData = null) {
  if (!refs.results || !refs.resultsBody) {
    return;
  }

  const modeDisplay = GAME_MODES[state.gameMode].name;
  const diffDisplay = GAME_MODES[state.gameMode].difficulties[state.difficultyMode].label;
  
  let modeSpecificMetric = '';
  if (state.gameMode === 'survival') {
    modeSpecificMetric = `<div class="metric"><span>Hit Streak</span><strong>${summary.targetsHit}</strong></div>`;
  } else if (state.gameMode === 'accuracy_challenge') {
    modeSpecificMetric = `<div class="metric"><span>Accuracy Bonus</span><strong>+${Math.max(0, Math.floor((summary.accuracy / 10) * 25))}</strong></div>`;
  }
  
  let leaderboardHtml = '';
  if (leaderboardData && leaderboardData.leaderboard) {
    const topScores = leaderboardData.leaderboard.slice(0, 3);
    leaderboardHtml = `
      <div class="leaderboard-section" style="grid-column: 1 / -1; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--line);">
        <p style="margin: 0 0 0.75rem 0; font-size: 0.9rem; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Top Scores This Mode</p>
        ${topScores.map((entry, idx) => `
          <div class="metric" style="padding: 0.5rem 0; ${entry.player_name === state.playerName ? 'background: rgba(99, 242, 209, 0.1); border-radius: 8px; padding: 0.5rem 0.75rem; margin-bottom: 0.5rem;' : ''}">
            <span>#${idx + 1} - ${escapeHtml(entry.player_name)}</span>
            <strong>${entry.score}</strong>
          </div>
        `).join('')}
      </div>
    `;
  }

  refs.results.classList.remove('hidden');
  refs.resultsBody.innerHTML = `
    <div class="metric"><span>Mode</span><strong>${escapeHtml(modeDisplay)} (${escapeHtml(diffDisplay)})</strong></div>
    <div class="metric"><span>Player</span><strong>${escapeHtml(state.playerName)}</strong></div>
    <div class="metric"><span>Score</span><strong>${summary.score}</strong></div>
    <div class="metric"><span>Accuracy</span><strong>${summary.accuracy.toFixed(1)}%</strong></div>
    <div class="metric"><span>Average reaction</span><strong>${summary.reactionTime} ms</strong></div>
    <div class="metric"><span>Hits</span><strong>${summary.targetsHit}</strong></div>
    <div class="metric"><span>Misses</span><strong>${summary.targetsMissed}</strong></div>
    <div class="metric"><span>Empty clicks</span><strong>${summary.emptyClicks}</strong></div>
    ${modeSpecificMetric}
    <div class="metric"><span>API latency</span><strong>${summary.networkLatency} ms</strong></div>
    ${leaderboardHtml}
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
  
  // Clean up imposter auto-click timers
  if (window._imposterTimers && Array.isArray(window._imposterTimers)) {
    window._imposterTimers.forEach(timer => window.clearTimeout(timer));
    window._imposterTimers = [];
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