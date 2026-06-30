// Rebuilt script with training focus, default mapping, toast notifications,
// Mode4 chunking, Mode5 generated word with strict vowel-after-consonant pattern,
// and recall metrics capture.

const rulesGrid = document.getElementById('rules-grid');
const setupStatus = document.getElementById('setup-status');
const dashboardPanel = document.getElementById('dashboard-panel');
const analyticsPanel = document.getElementById('analytics-panel');
const showSetupButton = document.getElementById('show-setup');
const resetRulesButton = document.getElementById('reset-rules');
const exerciseCard = document.getElementById('exercise-card');
const exerciseTitle = document.getElementById('exercise-title');
const exerciseBody = document.getElementById('exercise-body');
const exitExerciseButton = document.getElementById('exit-exercise');
const weaknessesGrid = document.getElementById('weaknesses-grid');
const masterLengthInput = document.getElementById('master-length');
const masterLengthApplyButton = document.getElementById('apply-master-length');
const tiles = document.querySelectorAll('.tile');

const state = {
  mapping: Array(10).fill(''),
  valid: false,
  logs: [],
  modeStats: {
    1: {count: 0, totalLatency: 0, correct: 0},
    2: {count: 0, totalLatency: 0, correct: 0, charTotal: 0},
    3: {count: 0, totalLatency: 0, correct: 0},
    4: {count: 0, totalLatency: 0, correct: 0},
    5: {count: 0, totalLatency: 0, correct: 0, charTotal: 0}
  },
  forge: { recall: 0, quick: 0, attempts: 0 },
  currentExercise: null,
  startTime: null,
  forgeTimeouts: [],
  forgeIntensity: 1,
  masterLength: 4,
  mode1Direction: 'digitToLetter',
  mode1Panel: 'flash',
  mode1DisplayMode: 'number',
  mode1VoiceEnabled: false,
  mode1VoiceMuted: false,
  mode1Bpm: 72,
  mode1FlashDuration: 650,
  mode1DrillTimer: null,
  mode1DrillHideTimer: null,
  mode1DrillRunning: false,
  mode1CurrentPrompt: null,
  mode1AudioContext: null,
  focusedWeakness: null,
  firstVisit: {
    mode5Writing: true,
    mode5Listening: true
  },
  mode3UseDictionary: false,
  mode3Cleanup: null
};

// User-provided default mapping
const defaultMapping = ['D','l','R','m','h','s','p','v','B','q'];
state.mapping = defaultMapping.slice();

const pairPrompts = ['12','34','56','78','90','23','45','67','89','10'];

function createRulesetInputs() {
  if (!rulesGrid) return;
  rulesGrid.innerHTML = '';
  for (let i = 0; i < 10; i += 1) {
    const row = document.createElement('div');
    row.className = 'rule-row rule-row-static';
    row.innerHTML = `
      <label>Digit ${i}</label>
      <div class="mapping-chip">${String(state.mapping[i] || '')}</div>
    `;
    rulesGrid.appendChild(row);
  }
}

function updateMapping(index, value) {
  const letter = value.trim().toLowerCase();
  state.mapping[index] = letter;
  validateSetup();
  if (state.valid) enableDashboard();
}

function updateMasterLength(value) {
  const parsed = Math.max(2, Math.min(8, parseInt(value, 10) || 4));
  state.masterLength = parsed;
  if (masterLengthInput) masterLengthInput.value = parsed;
}

function updateModeStats(mode, entry) {
  const stats = state.modeStats[mode] || {count: 0, totalLatency: 0, correct: 0, charTotal: 0};
  stats.count += 1;
  stats.totalLatency += entry.latency || 0;
  if (entry.correct) stats.correct += 1;
  if (entry.charCount) stats.charTotal = (stats.charTotal || 0) + entry.charCount;
  state.modeStats[mode] = stats;
}

function analyzeWeaknesses() {
  const weaknesses = [];
  
  // Analyze Mode 1: digit-letter pairs
  const mode1Pairs = {};
  state.logs.filter(e => e.mode === '1').forEach(entry => {
    const key = entry.prompt;
    if (!mode1Pairs[key]) mode1Pairs[key] = { correct: 0, total: 0, latencies: [] };
    mode1Pairs[key].total += 1;
    mode1Pairs[key].latencies.push(entry.latency);
    if (entry.correct) mode1Pairs[key].correct += 1;
  });
  
  Object.entries(mode1Pairs).forEach(([digit, stats]) => {
    const letter = state.mapping[Number(digit)];
    const errorRate = 1 - (stats.correct / stats.total);
    const avgLatency = Math.round(stats.latencies.reduce((a,b) => a+b, 0) / stats.total);
    const weakness = errorRate * 0.6 + (avgLatency > 200 ? 0.4 : 0);
    if (errorRate > 0.1 || avgLatency > 200) {
      weaknesses.push({
        mode: 1,
        label: `Mode 1: ${digit} → ${letter}`,
        reason: errorRate > 0.1 ? `${Math.round(errorRate*100)}% errors` : `${avgLatency}ms avg`,
        weakness,
        pair: digit
      });
    }
  });
  
  // Analyze Mode 2: synthesis digit pairs
  const mode4Pairs = {};
  state.logs.filter(e => e.mode === '2' && e.pair).forEach(entry => {
    const key = entry.pair;
    if (!mode4Pairs[key]) mode4Pairs[key] = { correct: 0, total: 0, latencies: [] };
    mode4Pairs[key].total += 1;
    mode4Pairs[key].latencies.push(entry.latency);
    if (entry.correct) mode4Pairs[key].correct += 1;
  });
  
  Object.entries(mode4Pairs).forEach(([pair, stats]) => {
    const errorRate = 1 - (stats.correct / stats.total);
    const avgLatency = Math.round(stats.latencies.reduce((a,b) => a+b, 0) / stats.total);
    const weakness = errorRate * 0.6 + (avgLatency > 200 ? 0.4 : 0);
    if (errorRate > 0.1 || avgLatency > 200) {
      weaknesses.push({
        mode: 2,
        label: `Mode 3: ${pair}`,
        reason: errorRate > 0.1 ? `${Math.round(errorRate*100)}% errors` : `${avgLatency}ms avg`,
        weakness,
        pair
      });
    }
  });
  
  return weaknesses.sort((a, b) => b.weakness - a.weakness);
}

function renderWeaknesses() {
  if (!weaknessesGrid) return;
  const weaknesses = analyzeWeaknesses();
  if (weaknesses.length === 0) {
    weaknessesGrid.innerHTML = '<p style="grid-column: 1/-1; color: var(--muted);">No weaknesses detected yet. Keep training to surface areas for improvement.</p>';
    return;
  }
  weaknessesGrid.innerHTML = '';
  weaknesses.slice(0, 12).forEach(w => {
    const card = document.createElement('div');
    card.className = 'weakness-card';
    card.innerHTML = `<strong>${w.label}</strong><p>${w.reason}</p>`;
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => trainWeakness(w));
    weaknessesGrid.appendChild(card);
  });
}

function applyAnswerFeedback(input, resultEl, correct, message) {
  if (resultEl) {
    resultEl.textContent = message;
    resultEl.className = `mode-result ${correct ? 'correct' : 'incorrect'}`;
  }
  if (input) {
    input.classList.toggle('correct', correct);
    input.classList.toggle('incorrect', !correct);
  }
}

function validateSetup() {
  state.valid = true;
  if (setupStatus) setupStatus.textContent = 'System locked. Training is ready.';
}

function enableDashboard() {
  dashboardPanel.classList.remove('hidden');
  analyticsPanel.classList.remove('hidden');
}

function resetRules() {
  state.mapping = defaultMapping.slice();
  state.valid = true;
  state.logs = [];
  state.forge = { recall: 0, quick: 0, attempts: 0 };
  state.masterLength = 4;
  stopMode1Drill();
  stopForgeAudio();
  exerciseCard.classList.add('hidden');
  createRulesetInputs();
  if (masterLengthInput) masterLengthInput.value = state.masterLength;
  validateSetup();
  enableDashboard();
  renderWeaknesses();
}

function toggleSetup() {
  const setupPanel = document.getElementById('setup-panel');
  if (setupPanel) setupPanel.classList.toggle('hidden');
}

function enterTrainingFocus() {
  document.body.classList.add('training-focus');
}

function exitTrainingFocus() {
  document.body.classList.remove('training-focus');
}

function stopMode1Drill() {
  if (state.mode1DrillTimer) {
    clearInterval(state.mode1DrillTimer);
    state.mode1DrillTimer = null;
  }
  if (state.mode1DrillHideTimer) {
    clearTimeout(state.mode1DrillHideTimer);
    state.mode1DrillHideTimer = null;
  }
  state.mode1DrillRunning = false;
  state.mode1CurrentPrompt = null;
}

function ensureMode1AudioContext() {
  if (state.mode1AudioContext) return state.mode1AudioContext;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  state.mode1AudioContext = new AudioContextCtor();
  return state.mode1AudioContext;
}

function playMetronomeTick() {
  const audioContext = ensureMode1AudioContext();
  if (!audioContext) return;
  if (audioContext.state === 'suspended') audioContext.resume();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = 'square';
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.07);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.08);
}

function speakMode1Prompt(digit) {
  if (!state.mode1VoiceEnabled || state.mode1VoiceMuted || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(digit));
  utterance.rate = 1.05;
  utterance.pitch = 1;
  speechSynthesis.speak(utterance);
}

function getMode1FlashPrompt() {
  const digit = String(Math.floor(Math.random() * 10));
  const letter = String(state.mapping[Number(digit)] || '');
  const mode = state.mode1DisplayMode || 'number';
  if (mode === 'letter') {
    return { digit, letter, display: letter, label: 'Letter' };
  }
  if (mode === 'both') {
    return { digit, letter, display: `${digit} • ${letter}`, label: 'Number + Letter' };
  }
  return { digit, letter, display: digit, label: 'Number' };
}

function renderMode1Flash(prompt, flashCard, modeLabelEl, beatLabelEl) {
  flashCard.textContent = prompt.display;
  flashCard.classList.add('visible');
  if (modeLabelEl) modeLabelEl.textContent = prompt.label;
  if (beatLabelEl) beatLabelEl.textContent = `${state.mode1Bpm} BPM`;
  playMetronomeTick();
  speakMode1Prompt(prompt.digit);
  if (state.mode1DrillHideTimer) clearTimeout(state.mode1DrillHideTimer);
  state.mode1DrillHideTimer = setTimeout(() => {
    flashCard.classList.remove('visible');
    flashCard.textContent = '•';
  }, Math.min(state.mode1FlashDuration, Math.max(180, Math.round((60000 / state.mode1Bpm) * 0.82))));
}

function renderMode1Classic(container) {
  const digit = String(Math.floor(Math.random() * 10));
  const directionPref = state.mode1Direction || 'digitToLetter';
  const round = getMode1Round(directionPref, digit);
  const directionLabel = directionPref === 'random'
    ? `Random (${round.selectedDirection === 'digitToLetter' ? 'Digit -> Letter' : 'Letter -> Digit'})`
    : (directionPref === 'digitToLetter' ? 'Digit -> Letter' : 'Letter -> Digit');

  container.innerHTML = `<p>${round.promptInstruction}</p><div class="rule-row"><label>${round.promptLabel}</label><div><strong>${round.promptValue}</strong></div></div><div class="rule-row"><label>Direction mode</label><div style="display:flex;gap:8px;flex-wrap:wrap;"><button id="set-digit">Digit -> Letter</button><button id="set-letter">Letter -> Digit</button><button id="set-random">Random</button></div></div><div class="rule-row"><label>Current</label><div><strong>${directionLabel}</strong></div></div><label for="response-1">Your answer</label><input id="response-1" autocomplete="off" /><div id="mode-result" class="mode-result"></div><button id="submit-1">Submit</button>`;

  startTimer();
  attachSubmitOnEnter(container, 'submit-1');
  const input = document.getElementById('response-1');
  const resultEl = document.getElementById('mode-result');
  input.focus();

  document.getElementById('set-digit').addEventListener('click', () => {
    state.mode1Direction = 'digitToLetter';
    renderMode1();
  });
  document.getElementById('set-letter').addEventListener('click', () => {
    state.mode1Direction = 'letterToDigit';
    renderMode1();
  });
  document.getElementById('set-random').addEventListener('click', () => {
    state.mode1Direction = 'random';
    renderMode1();
  });

  document.getElementById('submit-1').addEventListener('click', () => {
    const response = input.value.trim().toLowerCase();
    const latency = Math.round(performance.now() - state.startTime);
    const correct = response === String(round.answer).toLowerCase();
    logInteraction({
      mode: '1',
      prompt: round.selectedDirection === 'digitToLetter' ? digit : round.promptValue,
      response,
      correct,
      latency,
      direction: round.selectedDirection
    });
    applyAnswerFeedback(input, resultEl, correct, correct ? 'Correct.' : `Incorrect. Expected ${round.answer}`);
    notify(correct ? 'Correct.' : `Incorrect. Expected ${round.answer}`, 700, () => {
      if (correct) renderMode1();
      else { input.focus(); input.select(); }
    });
  });
}

function renderMode1FlashPanel(container) {
  container.innerHTML = `<p>Flash your fixed system at a steady tempo. Choose whether to show the digit, the consonant, or both, and optionally hear the number spoken aloud.</p><div class="flash-panel"><div class="flash-display-wrap"><div id="mode1-flash-card" class="flash-card">•</div><div class="flash-meta"><span id="mode1-display-label">${state.mode1DisplayMode === 'both' ? 'Number + Letter' : state.mode1DisplayMode === 'letter' ? 'Letter' : 'Number'}</span><span id="mode1-beat-label">${state.mode1Bpm} BPM</span></div></div><div class="flash-controls-grid"><label class="flash-control"><span>Show</span><select id="mode1-display-mode"><option value="number" ${state.mode1DisplayMode === 'number' ? 'selected' : ''}>Number</option><option value="letter" ${state.mode1DisplayMode === 'letter' ? 'selected' : ''}>Letter</option><option value="both" ${state.mode1DisplayMode === 'both' ? 'selected' : ''}>Both</option></select></label><label class="flash-control"><span>Metronome BPM</span><input id="mode1-bpm" type="range" min="40" max="180" step="1" value="${state.mode1Bpm}" /></label><label class="flash-control"><span>Flash length</span><input id="mode1-flash-duration" type="range" min="180" max="1200" step="10" value="${state.mode1FlashDuration}" /></label><label class="flash-toggle"><input id="mode1-voice" type="checkbox" ${state.mode1VoiceEnabled ? 'checked' : ''} /> Speak the number</label></div><div class="scrabble-meta"><span id="mode1-bpm-readout">${state.mode1Bpm} BPM</span><span id="mode1-duration-readout">${state.mode1FlashDuration} ms flash</span></div><div class="flash-actions"><button id="mode1-start">Start drill</button><button id="mode1-stop">Stop drill</button><button id="mode1-next">Flash once</button></div></div>`;

  const flashCard = document.getElementById('mode1-flash-card');
  const displaySelect = document.getElementById('mode1-display-mode');
  const bpmInput = document.getElementById('mode1-bpm');
  const flashDurationInput = document.getElementById('mode1-flash-duration');
  const voiceToggle = document.getElementById('mode1-voice');
  const modeLabelEl = document.getElementById('mode1-display-label');
  const beatLabelEl = document.getElementById('mode1-beat-label');
  const bpmReadout = document.getElementById('mode1-bpm-readout');
  const durationReadout = document.getElementById('mode1-duration-readout');

  const updateReadouts = () => {
    bpmReadout.textContent = `${state.mode1Bpm} BPM`;
    durationReadout.textContent = `${state.mode1FlashDuration} ms flash`;
    beatLabelEl.textContent = `${state.mode1Bpm} BPM`;
  };
  const flashOnce = () => {
    const prompt = getMode1FlashPrompt();
    state.mode1CurrentPrompt = prompt;
    renderMode1Flash(prompt, flashCard, modeLabelEl, beatLabelEl);
    logInteraction({
      mode: '1',
      prompt: prompt.digit,
      response: prompt.display,
      correct: true,
      latency: Math.round(60000 / state.mode1Bpm),
      direction: state.mode1DisplayMode
    });
  };
  const startDrill = () => {
    stopMode1Drill();
    state.mode1DrillRunning = true;
    flashOnce();
    state.mode1DrillTimer = setInterval(flashOnce, Math.round(60000 / state.mode1Bpm));
  };

  displaySelect.addEventListener('change', () => {
    state.mode1DisplayMode = displaySelect.value;
    if (state.mode1CurrentPrompt) {
      state.mode1CurrentPrompt = getMode1FlashPrompt();
      renderMode1Flash(state.mode1CurrentPrompt, flashCard, modeLabelEl, beatLabelEl);
    }
  });
  bpmInput.addEventListener('input', () => {
    state.mode1Bpm = Math.max(40, Math.min(180, Number(bpmInput.value) || 72));
    updateReadouts();
    if (state.mode1DrillRunning) startDrill();
  });
  flashDurationInput.addEventListener('input', () => {
    state.mode1FlashDuration = Math.max(180, Math.min(1200, Number(flashDurationInput.value) || 650));
    updateReadouts();
  });
  voiceToggle.addEventListener('change', () => {
    state.mode1VoiceEnabled = voiceToggle.checked;
    if (!state.mode1VoiceEnabled && 'speechSynthesis' in window) speechSynthesis.cancel();
  });
  document.getElementById('mode1-start').addEventListener('click', startDrill);
  document.getElementById('mode1-stop').addEventListener('click', () => {
    stopMode1Drill();
    flashCard.classList.remove('visible');
    flashCard.textContent = '•';
  });
  document.getElementById('mode1-next').addEventListener('click', () => {
    stopMode1Drill();
    flashOnce();
  });
  updateReadouts();
}

function notify(message, ms = 700, onClose) {
  let t = document.getElementById('app-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'app-toast';
    t.style.position = 'fixed';
    t.style.top = '12px';
    t.style.left = '50%';
    t.style.transform = 'translateX(-50%)';
    t.style.background = 'rgba(10,16,22,0.95)';
    t.style.color = '#fff';
    t.style.padding = '10px 14px';
    t.style.borderRadius = '10px';
    t.style.zIndex = 9999;
    document.body.appendChild(t);
  }
  t.textContent = message;
  t.style.opacity = '1';
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => {
    t.style.opacity = '0';
    if (onClose) onClose();
  }, ms);
}

function startTimer() {
  state.startTime = performance.now();
}

function logInteraction(entry) {
  state.logs.push(entry);
  if (entry.mode === '5') {
    state.forge.attempts += 1;
    state.forge.recall += entry.correct ? 1 : 0;
  }
  if (entry.mode === '4') state.forge.quick += entry.correct ? 1 : 0;
  updateModeStats(entry.mode, entry);
  renderWeaknesses();
}

function selectWeaknessByProbability(weaknesses, mode) {
  const filtered = weaknesses.filter(w => w.mode === mode);
  if (filtered.length === 0) return null;
  const maxWeakness = Math.max(...filtered.map(w => w.weakness));
  const probabilities = filtered.map(w => (w.weakness / maxWeakness) ** 1.5);
  const total = probabilities.reduce((a, b) => a + b, 0);
  let random = Math.random() * total;
  for (let i = 0; i < filtered.length; i++) {
    random -= probabilities[i];
    if (random <= 0) return filtered[i];
  }
  return filtered[filtered.length - 1];
}

function trainWeakness(weakness) {
  state.focusedWeakness = weakness;
  if (weakness.mode === 1) {
    showFocusedMode1Training();
  } else if (weakness.mode === 2) {
    showFocusedMode4Training();
  }
}

function showFocusedMode1Training() {
  state.currentExercise = 'focused-1';
  exerciseCard.classList.remove('hidden');
  exerciseBody.innerHTML = '';
  enterTrainingFocus();
  renderFocusedMode1();
}

function renderFocusedMode1() {
  const weaknesses = analyzeWeaknesses();
  const selected = selectWeaknessByProbability(weaknesses, 1);
  if (!selected) {
    exerciseTitle.textContent = 'Mode 1 — No weaknesses';
    exerciseBody.innerHTML = '<p>No Mode 1 weaknesses to train. Great job!</p>';
    return;
  }
  const digit = selected.pair;
  const letter = state.mapping[Number(digit)];
  exerciseTitle.textContent = `Mode 1 — Weakness Training (${digit} → ${letter})`;
  const promptInstruction = 'Translate this digit into your mapped consonant.';
  exerciseBody.innerHTML = `<p>${promptInstruction}</p><div class="rule-row"><label>Digit</label><div><strong>${digit}</strong></div></div><label for="response-1">Your answer</label><input id="response-1" autocomplete="off" /><div id="mode-result" class="mode-result"></div><button id="submit-focused">Submit</button>`;
  startTimer();
  attachSubmitOnEnter(exerciseBody, 'submit-focused');
  const input = document.getElementById('response-1');
  const resultEl = document.getElementById('mode-result');
  input.focus();
  document.getElementById('submit-focused').addEventListener('click', () => {
    const response = input.value.trim().toLowerCase();
    const latency = Math.round(performance.now() - state.startTime);
    const correct = response === letter.toLowerCase();
    logInteraction({mode: '1', prompt: digit, response, correct, latency, direction: 'digitToLetter'});
    applyAnswerFeedback(input, resultEl, correct, correct ? 'Correct.' : `Incorrect. Expected ${letter}`);
    notify(correct ? 'Correct.' : `Incorrect. Expected ${letter}`, 700, () => {
      if (correct) renderFocusedMode1();
      else { input.focus(); input.select(); }
    });
  });
}

function showFocusedMode4Training() {
  state.currentExercise = 'focused-4';
  exerciseCard.classList.remove('hidden');
  exerciseBody.innerHTML = '';
  enterTrainingFocus();
  renderFocusedMode4();
}

function renderFocusedMode4() {
  const weaknesses = analyzeWeaknesses();
  const selected = selectWeaknessByProbability(weaknesses, 2);
  if (!selected) {
    exerciseTitle.textContent = 'Mode 3 — No weaknesses';
    exerciseBody.innerHTML = '<p>No Mode 3 weaknesses to train. Great job!</p>';
    return;
  }
  const pair = selected.pair;
  const mapped = pair.split('').map(d => state.mapping[Number(d)] || '?').join('');
  exerciseTitle.textContent = `Mode 3 — Weakness Training (${pair})`;
  exerciseBody.innerHTML = `<p>Translate this pair of digits into your mapped consonants.</p><div class="rule-row"><label>Pair</label><div><strong>${pair}</strong></div></div><label for="response-focused-4">Your answer</label><input id="response-focused-4" autocomplete="off" /><div id="mode-result" class="mode-result"></div><button id="submit-focused-4">Submit</button>`;
  startTimer();
  attachSubmitOnEnter(exerciseBody, 'submit-focused-4');
  const input = document.getElementById('response-focused-4');
  const resultEl = document.getElementById('mode-result');
  input.focus();
  document.getElementById('submit-focused-4').addEventListener('click', () => {
    const response = input.value.trim().toLowerCase();
    const latency = Math.round(performance.now() - state.startTime);
    const correct = response === mapped.toLowerCase();
    logInteraction({mode: '2', prompt: mapped, response, correct, latency, pair});
    applyAnswerFeedback(input, resultEl, correct, correct ? 'Correct.' : `Incorrect. Expected ${mapped}`);
    notify(correct ? 'Correct.' : `Incorrect. Expected ${mapped}`, 700, () => {
      if (correct) renderFocusedMode4();
      else { input.focus(); input.select(); }
    });
  });
}

function normalizeText(text){ return String(text).toLowerCase().replace(/[^a-z]/g,''); }

function isSubsequence(pattern,text){ const normalized=normalizeText(text); let index=0; for(const char of normalized){ if(pattern[index]===char) index+=1; if(index===pattern.length) return true;} return false; }

function buildWordFromConsonants(consonants){ const vowels=['a','e','o']; if(!consonants.length) return 'tone'; let text=vowels[Math.floor(Math.random()*vowels.length)]; consonants.forEach((c)=>{ text+=c; text+=vowels[Math.floor(Math.random()*vowels.length)]; }); return text; }

function buildWordFromConsonantsStrict(consonants){ const vowels=['a','e','i','o','u']; if(!consonants.length) return 'tone'; let text=''; consonants.forEach((c)=>{ text+=c; text+=vowels[Math.floor(Math.random()*vowels.length)]; }); return text; }

function buildHardSkeletonWord(consonants){ const vowels=['a','e','i','o','u']; if(!consonants.length) return 'tone'; let word=''; consonants.forEach((c,idx)=>{ word+=c; if(idx<consonants.length-1){ if(Math.random()<0.4) word+=vowels[Math.floor(Math.random()*vowels.length)]; word+=vowels[Math.floor(Math.random()*vowels.length)]; if(Math.random()<0.3) word+=vowels[Math.floor(Math.random()*vowels.length)]; } }); return word; }

function parseChunkPattern(pattern){ if(!pattern) return [3]; try{ const parts=String(pattern).split(/[^0-9]+/).filter(Boolean).map(n=>Math.max(1,parseInt(n,10))); return parts.length?parts:[3]; }catch(e){ return [3]; } }

function generateDigitsFromPattern(patternArray){ const total=patternArray.reduce((s,n)=>s+n,0); let digits=''; for(let i=0;i<total;i++) digits+=String(Math.floor(Math.random()*10)); return digits; }

function formatDigitsWithPattern(digits,patternArray){ const groups=[]; let pos=0; for(const len of patternArray){ groups.push(digits.slice(pos,pos+len)); pos+=len;} return groups.join('-'); }

function attachSubmitOnEnter(container, buttonId){ container.addEventListener('keydown',(event)=>{ if(event.key==='Enter' && !event.shiftKey){ const target=event.target; if(target.tagName==='INPUT' || target.tagName==='TEXTAREA'){ event.preventDefault(); const button=document.getElementById(buttonId); if(button) button.click(); } } }); }

function showExercise(mode){ stopMode1Drill(); if('speechSynthesis' in window) speechSynthesis.cancel(); state.currentExercise=mode; exerciseCard.classList.remove('hidden'); exerciseBody.innerHTML=''; exerciseTitle.textContent=`Mode ${mode}`; enterTrainingFocus(); if(mode==='1') renderMode1(); if(mode==='2') renderMode2(); if(mode==='3') renderMode3(); if(mode==='4') renderMode4(); if(mode==='5') renderMode5(); }

function exitExercise(){ stopMode1Drill(); if('speechSynthesis' in window) speechSynthesis.cancel(); if (state.mode3Cleanup) { state.mode3Cleanup(); state.mode3Cleanup = null; } stopForgeAudio(); exerciseCard.classList.add('hidden'); exitTrainingFocus(); }

exitExerciseButton.addEventListener('click', ()=> exitExercise());

function renderMode1(){ const digit=String(Math.floor(Math.random()*10)); const direction=state.mode1Direction; const letter=state.mapping[Number(digit)]; const promptLabel = direction === 'digitToLetter' ? 'Digit' : 'Consonant'; const promptValue = direction === 'digitToLetter' ? digit : letter; const answer = direction === 'digitToLetter' ? letter : digit; const promptInstruction = direction === 'digitToLetter' ? 'Translate this digit into your mapped consonant.' : 'Translate this consonant back to its digit.'; exerciseTitle.textContent='Mode 1 — Reflexes'; exerciseBody.innerHTML=`<p>${promptInstruction}</p><div class="rule-row"><label>${promptLabel}</label><div><strong>${promptValue}</strong></div></div><div class="rule-row"><label>Direction</label><button id="toggle-direction">${direction === 'digitToLetter' ? 'Switch to Letter → Digit' : 'Switch to Digit → Letter'}</button></div><label for="response-1">Your answer</label><input id="response-1" autocomplete="off" /><div id="mode-result" class="mode-result"></div><button id="submit-1">Submit</button>`; startTimer(); attachSubmitOnEnter(exerciseBody,'submit-1'); const input=document.getElementById('response-1'); const resultEl=document.getElementById('mode-result'); input.focus(); document.getElementById('toggle-direction').addEventListener('click',()=>{ state.mode1Direction = state.mode1Direction === 'digitToLetter' ? 'letterToDigit' : 'digitToLetter'; renderMode1(); }); document.getElementById('submit-1').addEventListener('click',()=>{ const response=input.value.trim().toLowerCase(); const latency=Math.round(performance.now()-state.startTime); const correct=response===String(answer).toLowerCase(); logInteraction({mode:'1',prompt:promptValue,response,correct,latency,direction}); applyAnswerFeedback(input,resultEl,correct,correct?'Correct.':`Incorrect. Expected ${(answer||'N/A')}`); notify(correct?'Correct.':'Incorrect. Expected '+(answer||'N/A'),700,()=>{ if(correct) renderMode1(); else{ input.focus(); input.select(); }}); }); }

function renderMode2(){ const digits=Array.from({length:state.masterLength},()=>Math.floor(Math.random()*10)).join(''); const consonants=digits.split('').map(d=>state.mapping[Number(d)]).filter(Boolean); const word=buildHardSkeletonWord(consonants); const expected=consonants.join('').toLowerCase(); exerciseTitle.textContent='Mode 2 — Skeleton Extract'; exerciseBody.innerHTML=`<p>Extract the consonant skeleton from this harder word. The word uses ${word.length} characters and may include consonant clusters.</p><div class="rule-row"><label>Word</label><div><strong>${word}</strong></div></div><label for="response-2">Consonant skeleton</label><input id="response-2" autocomplete="off" /><div id="mode-result" class="mode-result"></div><button id="submit-2">Submit</button>`; startTimer(); attachSubmitOnEnter(exerciseBody,'submit-2'); const input=document.getElementById('response-2'); const resultEl=document.getElementById('mode-result'); input.focus(); document.getElementById('submit-2').addEventListener('click',()=>{ const response=input.value.trim().toLowerCase(); const latency=Math.round(performance.now()-state.startTime); const extracted=response.split('').filter(c=>state.mapping.includes(c.toLowerCase())).join(''); const correct=extracted===expected; logInteraction({mode:'2',prompt:word,response:response,correct,latency,details:[],charCount:word.length}); applyAnswerFeedback(input,resultEl,correct,correct?`Good. ${word.length} chars processed.`:`Incorrect. Expected ${expected}`); notify(correct?`Good. ${word.length} chars processed.`:`Expected ${expected}`,700,()=>{ if(correct) renderMode2(); else{ input.focus(); input.select(); }}); }); }

function renderMode3(){ const digits=Array.from({length:state.masterLength},()=>Math.floor(Math.random()*10)).join(''); const mapped=digits.split('').map(d=>state.mapping[Number(d)]).join(''); exerciseTitle.textContent='Mode 3 — Word Generator'; exerciseBody.innerHTML=`<p>Create a word containing this consonant string in order: <strong>${mapped}</strong></p><label for="response-3">Generated word</label><input id="response-3" autocomplete="off" /><div id="mode-result" class="mode-result"></div><button id="submit-3">Submit</button>`; startTimer(); attachSubmitOnEnter(exerciseBody,'submit-3'); const input=document.getElementById('response-3'); const resultEl=document.getElementById('mode-result'); input.focus(); document.getElementById('submit-3').addEventListener('click',()=>{ const response=input.value.trim().toLowerCase(); const latency=Math.round(performance.now()-state.startTime); const normalized=normalizeText(response); const hasVowel=/[aeiou]/.test(normalized); const correct = mapped && isSubsequence(mapped.toLowerCase(),normalized) && normalized.length>mapped.toLowerCase().length && hasVowel; logInteraction({mode:'3',prompt:mapped,response:normalized,correct,latency,charCount:normalized.length}); applyAnswerFeedback(input,resultEl,correct,correct?'Great. The consonants are present in order.':`Incorrect. Try a longer word containing ${mapped}`); notify(correct?'Great. The consonants are present in order.':'Try a longer word containing the consonants for '+mapped,700,()=>{ if(correct) renderMode3(); else{ input.focus(); input.select(); }}); }); }

function renderMode4(){ exerciseTitle.textContent='Mode 4 — Synthesis'; exerciseBody.innerHTML=`<p>Choose a chunk pattern (e.g. 2-2-4) to control grouping, then submit.</p><div class="rule-row"><label for="chunk-pattern">Chunk pattern</label><div><input id="chunk-pattern" value="${state.masterLength}" /></div></div><div class="rule-row"><label>Sequence</label><div><strong id="mode4-sequence">...</strong></div></div><label for="response-4">Your answer</label><input id="response-4" autocomplete="off" /><div id="mode-result" class="mode-result"></div><div style="margin-top:10px;display:flex;gap:8px;"><button id="regen-4">Regenerate</button><button id="submit-4">Submit</button></div>`; let currentDigits=''; let currentMapped=''; function regenerateMode4(){ const patternStr=document.getElementById('chunk-pattern').value.trim() || String(state.masterLength); const pattern=parseChunkPattern(patternStr); currentDigits=generateDigitsFromPattern(pattern); currentMapped=currentDigits.split('').map(d=>state.mapping[Number(d)]||'?').join(''); document.getElementById('mode4-sequence').textContent=formatDigitsWithPattern(currentDigits,pattern); } regenerateMode4(); startTimer(); attachSubmitOnEnter(exerciseBody,'submit-4'); document.getElementById('regen-4').addEventListener('click',()=>regenerateMode4()); const input4=document.getElementById('response-4'); const resultEl=document.getElementById('mode-result'); input4.focus(); document.getElementById('submit-4').addEventListener('click',()=>{ const response=input4.value.trim().toLowerCase(); const latency=Math.round(performance.now()-state.startTime); const normalized=normalizeText(response); const isDigits=/^\d+$/.test(normalized); let correct; if(isDigits){ correct=normalized===currentDigits; } else { correct=normalized===normalizeText(currentMapped); } logInteraction({mode:'4',prompt:currentMapped,response:normalized,correct,latency,pair:currentDigits.slice(0,2),details:[]}); applyAnswerFeedback(input4,resultEl,correct,correct?'Correct.':`Incorrect. Expected ${currentMapped}`); notify(correct?'Correct.':`Incorrect. Expected ${currentMapped}`,700,()=>{ if(correct) renderMode4(); else{ input4.focus(); input4.select(); } }); }); }

// Mode5: Single-word forge with story writing and listening practice
function renderMode5(){ const len = Math.max(1, Math.min(8, state.masterLength || 4)); if (!state.currentForge || !state.currentForge.digits){ const digits = Array.from({length: len}, ()=>Math.floor(Math.random()*10)).join(''); const consonants = digits.split('').map((d)=>state.mapping[Number(d)]).filter(Boolean).join(''); state.currentForge = { digits, consonants, encode:'', memory:'', intensity: state.forgeIntensity || 1 }; } else { if (state.currentForge.digits.length !== len){ const digits = Array.from({length: len}, ()=>Math.floor(Math.random()*10)).join(''); const consonants = digits.split('').map((d)=>state.mapping[Number(d)]).filter(Boolean).join(''); state.currentForge.digits = digits; state.currentForge.consonants = consonants; state.currentForge.encode = ''; state.currentForge.memory = ''; } state.currentForge.intensity = state.forgeIntensity || state.currentForge.intensity || 1; } const { digits, consonants, encode = '', memory = '', intensity } = state.currentForge; exerciseTitle.textContent='Mode 5 — Visualization Forge'; const tipsDiv = state.firstVisit.mode5Writing ? '<div class="forge-tips"><strong>Encoding technique: SOGAMA</strong><ul><li><strong>SO</strong> — Sensory Overload: Exaggerate all five senses</li><li><strong>GA</strong> — Grotesque Absurdity: Make it wild and impossible</li><li><strong>MA</strong> — Movable Attributes: Animate and transform it</li></ul></div>' : ''; exerciseBody.innerHTML=`<p class="forge-instruction">Step 1: Write one encoding word and a short story. Then use the listening mode to rehearse it until you reach vividness 3/3.</p><div class="blueprint-grid"><div class="blueprint-item"><label>Target word</label><div><strong id="forge-word">${consonants || 'mapping incomplete'}</strong></div></div><div class="blueprint-item"><label for="forge-encode">Encoding word or phrase</label><input id="forge-encode" autocomplete="off" value="${encode}" /></div><div class="blueprint-item"><label for="forge-memory">Memory story</label><textarea id="forge-memory" rows="4">${memory}</textarea></div><div class="forge-status"><span>Vividness target: <strong>3/3</strong></span></div></div><div class="forge-controls"><button id="forge-listen">Start listening</button><button id="forge-regenerate">New target</button></div>${tipsDiv}`; state.firstVisit.mode5Writing = false; startTimer(); attachSubmitOnEnter(exerciseBody,'forge-listen'); document.getElementById('forge-listen').addEventListener('click',()=>{ const encode= document.getElementById('forge-encode').value.trim(); const memory= document.getElementById('forge-memory').value.trim(); if(!encode || !memory){ notify('Enter an encoding word and a short memory story.',900); return; } state.currentForge.encode = encode; state.currentForge.memory = memory; state.forgeIntensity = state.currentForge.intensity; renderForgeListenStage(); }); document.getElementById('forge-regenerate').addEventListener('click',()=>{ state.forgeIntensity = 1; state.currentForge = null; renderMode5(); }); }

function renderForgeListenStage(){ const { digits, consonants, encode, memory, intensity } = state.currentForge; exerciseTitle.textContent='Mode 5 — Listen & deepen'; const tipsDiv = state.firstVisit.mode5Listening ? '<div class="forge-tips"><strong>Memory technique: Build vividness gradually</strong><ul><li><strong>Level 1:</strong> See the basic scene structure</li><li><strong>Level 2:</strong> Add sensory details (sounds, smells, textures)</li><li><strong>Level 3:</strong> Feel like you\'re inside the scene</li></ul></div>' : ''; exerciseBody.innerHTML=`<p class="forge-instruction">Step 2: Close your eyes and listen. Edit your story anytime. Use the slider to rank vividness, then mark complete.</p><div class="blueprint-grid"><div class="blueprint-item"><label>Target word</label><div><strong>${consonants || 'mapping incomplete'}</strong></div></div><div class="blueprint-item"><label>Encoding phrase</label><div>${encode || '—'}</div></div><div class="blueprint-item"><label for="forge-memory-edit">Memory story</label><div style="display:flex;gap:12px;align-items:flex-start;"><textarea id="forge-memory-edit" rows="4" style="flex:1;">${memory || ''}</textarea><button id="update-story" style="height:60px;white-space:nowrap;">Update</button></div></div><div class="forge-status"><label for="forge-vividness">Rank vividness</label><div class="vividness-row"><input id="forge-vividness" type="range" min="1" max="3" step="1" value="${intensity}" /><span id="vividness-label">${intensity}/3</span></div></div></div><div class="forge-controls"><button id="forge-play">Play visualization</button><button id="forge-repeat">Repeat same level</button><button id="forge-complete">Mark complete</button><button id="forge-back">Back to writing</button></div>${tipsDiv}`; state.firstVisit.mode5Listening = false; attachSubmitOnEnter(exerciseBody,'forge-play'); document.getElementById('forge-play').addEventListener('click',()=> playForgeAudio({digits,consonants,encode,memory:state.currentForge.memory,intensity})); document.getElementById('forge-repeat').addEventListener('click',()=> playForgeAudio({digits,consonants,encode,memory:state.currentForge.memory,intensity})); document.getElementById('update-story').addEventListener('click',()=>{ const updatedMemory=document.getElementById('forge-memory-edit').value.trim(); if(!updatedMemory){ notify('Story cannot be empty.',800); return; } state.currentForge.memory=updatedMemory; notify('Story updated.',700); }); const vividnessInput=document.getElementById('forge-vividness'); const vividnessLabel=document.getElementById('vividness-label'); const updateVividness=(value)=>{ const level=Math.max(1,Math.min(3,Number(value))); state.forgeIntensity=level; state.currentForge.intensity=level; if(vividnessLabel) vividnessLabel.textContent=`${level}/3`; }; if(vividnessInput){ vividnessInput.addEventListener('input',(e)=>updateVividness(e.target.value)); vividnessInput.addEventListener('change',(e)=>{ updateVividness(e.target.value); }); } document.getElementById('forge-complete').addEventListener('click',()=>{ const latency=Math.round(performance.now()-state.startTime); logInteraction({mode:'5',prompt:`forge complete ${digits}`,response:'max vividness',correct:true,latency,charCount:(state.currentForge.memory||'').length,wordCount:(state.currentForge.memory||'').split(/\s+/).filter(Boolean).length}); notify('Visualization complete. Good work.',1200); renderMode5(); }); document.getElementById('forge-back').addEventListener('click',renderMode5); }

function playForgeAudio({digits,consonants,encode,memory,vividness}){ if(!('speechSynthesis' in window)){ notify('Text-to-speech not available in this browser.',1200); return; } stopForgeAudio(); const sequence=[ {text:'Listen to the phrase and the story.',delay:0}, {text:`Encoding phrase: ${encode}.`,delay:1200}, {text:`Memory story: ${memory}.`,delay:2600}, ...(vividness >= 2 ? [{text:'Listen again and make the scene more vivid.',delay:5200}] : []), ...(vividness >= 3 ? [{text:'Listen again and make it feel as real as possible.',delay:7600}] : []) ]; state.forgeTimeouts=[]; sequence.forEach(entry=>{ const timeout=setTimeout(()=>{ const u=new SpeechSynthesisUtterance(entry.text); u.rate=0.95; speechSynthesis.speak(u); },entry.delay); state.forgeTimeouts.push(timeout); }); }

function stopForgeAudio(){ if(state.forgeTimeouts){ state.forgeTimeouts.forEach(t=>clearTimeout(t)); state.forgeTimeouts=[]; } if('speechSynthesis' in window) speechSynthesis.cancel(); }

function showForgeRecallPrompt({digits,consonants}){ exerciseBody.innerHTML=`<p>Type your recall of the generated word or description. Press Enter to submit.</p><textarea id="forge-recall" rows="4"></textarea><div style="display:flex;gap:8px;margin-top:8px;"><button id="submit-recall">Submit</button><button id="skip-recall">Skip</button></div>`; const ta=document.getElementById('forge-recall'); ta.focus(); attachSubmitOnEnter(exerciseBody,'submit-recall'); startTimer(); document.getElementById('submit-recall').addEventListener('click',()=>{ const response=ta.value.trim(); const latency=Math.round(performance.now()-state.startTime); const charCount=response.length; const wordCount=response.split(/\s+/).filter(Boolean).length; const correct = response.length>0; logInteraction({mode:'5',prompt:`recall ${digits}`,response,correct,latency,charCount,wordCount}); notify(`Recorded — ${wordCount} words, ${charCount} chars`,900,()=>{ renderMode5(); }); }); document.getElementById('skip-recall').addEventListener('click',()=>{ renderMode5(); }); }

function getMode1Round(directionPref, digit) {
  const selectedDirection = directionPref === 'random'
    ? (Math.random() < 0.5 ? 'digitToLetter' : 'letterToDigit')
    : directionPref;
  const letter = state.mapping[Number(digit)] || '?';
  if (selectedDirection === 'letterToDigit') {
    return {
      selectedDirection,
      promptLabel: 'Consonant',
      promptValue: letter,
      answer: digit,
      promptInstruction: 'Translate this consonant back to its digit.'
    };
  }
  return {
    selectedDirection,
    promptLabel: 'Digit',
    promptValue: digit,
    answer: letter,
    promptInstruction: 'Translate this digit into your mapped consonant.'
  };
}

const SCRABBLE_TILE_DISTRIBUTION = {
  a: 9, b: 2, c: 2, d: 4, e: 12, f: 2, g: 3, h: 2, i: 9, j: 1, k: 1, l: 4, m: 2,
  n: 6, o: 8, p: 2, q: 1, r: 6, s: 4, t: 6, u: 4, v: 2, w: 2, x: 1, y: 2, z: 1
};

const SCRABBLE_LETTER_VALUES = {
  a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5, l: 1, m: 3,
  n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4, w: 4, x: 8, y: 4, z: 10
};

const FALLBACK_DICTIONARY_WORDS = new Set([
  'able','about','above','ache','acid','acorn','actor','adapt','after','again','agent','agree','ahead','alarm','album','alert',
  'alpha','also','angel','angle','apple','april','arena','argue','arise','array','arrow','aside','asset','atlas','audio','avoid',
  'badge','baker','basic','beach','beard','begin','being','belly','below','bench','berry','birth','black','blade','blank','block',
  'bloom','board','boost','brain','brand','brave','bread','brick','bring','broad','brown','build','cabin','cable','camel','candy',
  'carry','catch','cause','chain','chair','chalk','charm','chase','cheap','check','chest','chief','child','choir','civic','class',
  'clean','clear','climb','clock','close','cloud','coach','coast','color','count','cover','craft','cream','crisp','crown','dance',
  'decide','delta','dream','dress','drink','drive','eager','early','earth','eight','enjoy','entry','equal','event','every','exact',
  'faith','false','fancy','field','final','first','flame','floor','focus','force','frame','fresh','front','giant','globe','grace',
  'grain','grand','graph','grass','great','green','group','guard','guess','guide','habit','happy','heart','honey','horse','house',
  'human','ideal','image','input','issue','joint','judge','juice','known','label','laser','later','laugh','layer','learn','light',
  'limit','liver','local','logic','lucky','magic','major','maker','march','match','maybe','metal','model','money','month','motor',
  'music','never','night','noise','novel','nurse','ocean','offer','olive','onion','orbit','order','other','panel','paper','party',
  'peace','phase','phone','pilot','pitch','plain','plane','plant','plate','point','pound','power','press','price','pride','prime',
  'print','proof','queen','quick','quiet','radio','raise','range','ratio','reach','ready','right','river','rough','round','route',
  'scale','scene','scope','score','sense','serve','seven','share','shift','shine','short','sight','since','skill','sleep','slice',
  'small','smart','smile','solid','solve','sound','south','space','spare','speak','spend','spice','spine','sport','spray','stack',
  'staff','stage','stair','start','state','steel','stick','still','stone','store','storm','story','strip','study','style','sugar',
  'table','taste','teach','their','theme','there','thick','thing','think','those','three','throw','tight','today','topic','total',
  'touch','tower','track','trade','train','trend','trial','trick','trust','truth','under','union','unity','upper','urban','value',
  'video','visit','vital','voice','waste','watch','water','wheel','where','which','while','white','whole','woman','world','write','young'
]);

function weightedRandomLetter(letters) {
  const pool = [];
  letters.forEach((ch) => {
    const count = SCRABBLE_TILE_DISTRIBUTION[ch] || 1;
    for (let i = 0; i < count; i += 1) pool.push(ch);
  });
  return pool[Math.floor(Math.random() * pool.length)] || letters[0] || 'a';
}

function calculateScrabbleScore(word) {
  return word.split('').reduce((sum, ch) => sum + (SCRABBLE_LETTER_VALUES[ch] || 0), 0);
}

async function validateWordAgainstDictionary(word) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
    if (res.ok) return { valid: true, source: 'api' };
    return { valid: FALLBACK_DICTIONARY_WORDS.has(word), source: 'fallback' };
  } catch (_e) {
    return { valid: FALLBACK_DICTIONARY_WORDS.has(word), source: 'fallback' };
  }
}

function buildScrabbleRack() {
  const vowels = ['a', 'e', 'i', 'o', 'u'];
  const consonants = Array.from(new Set(state.mapping.map(c => String(c || '').toLowerCase()).filter(Boolean)));
  const rackSize = 7;
  const rack = [];

  const guaranteedConsonants = Math.min(3, consonants.length);
  const shuffledConsonants = consonants.slice().sort(() => Math.random() - 0.5);
  rack.push(...shuffledConsonants.slice(0, guaranteedConsonants));

  while (rack.length < rackSize) {
    rack.push(weightedRandomLetter(Object.keys(SCRABBLE_TILE_DISTRIBUTION)));
  }

  let vowelCount = rack.filter(ch => vowels.includes(ch)).length;
  while (vowelCount < 2) {
    const replaceIdx = rack.findIndex(ch => !vowels.includes(ch));
    if (replaceIdx < 0) break;
    rack[replaceIdx] = weightedRandomLetter(vowels);
    vowelCount = rack.filter(ch => vowels.includes(ch)).length;
  }

  rack.sort(() => Math.random() - 0.5);
  const counts = {};
  rack.forEach(ch => { counts[ch] = (counts[ch] || 0) + 1; });
  return { rack, counts, mappedConsonants: consonants, rackSize };
}

function isWordBuildable(word, rackCounts) {
  const counts = { ...rackCounts };
  for (const ch of word) {
    if (!counts[ch]) return false;
    counts[ch] -= 1;
  }
  return true;
}

function createEmptyBoard(size = 15) {
  return Array.from({ length: size }, () => Array(size).fill(''));
}

function getPremiumMap() {
  const map = new Map();
  const put = (key, value) => map.set(key, value);
  const tw = [
    [0, 0], [0, 7], [0, 14],
    [7, 0], [7, 14],
    [14, 0], [14, 7], [14, 14]
  ];
  const dw = [
    [1, 1], [2, 2], [3, 3], [4, 4],
    [10, 10], [11, 11], [12, 12], [13, 13],
    [1, 13], [2, 12], [3, 11], [4, 10],
    [10, 4], [11, 3], [12, 2], [13, 1],
    [7, 7]
  ];
  const tl = [
    [1, 5], [1, 9], [5, 1], [5, 5], [5, 9], [5, 13],
    [9, 1], [9, 5], [9, 9], [9, 13], [13, 5], [13, 9]
  ];
  const dl = [
    [0, 3], [0, 11], [2, 6], [2, 8], [3, 0], [3, 7], [3, 14],
    [6, 2], [6, 6], [6, 8], [6, 12], [7, 3], [7, 11],
    [8, 2], [8, 6], [8, 8], [8, 12], [11, 0], [11, 7], [11, 14],
    [12, 6], [12, 8], [14, 3], [14, 11]
  ];
  tw.forEach(([r, c]) => put(`${r},${c}`, 'tw'));
  dw.forEach(([r, c]) => put(`${r},${c}`, 'dw'));
  tl.forEach(([r, c]) => put(`${r},${c}`, 'tl'));
  dl.forEach(([r, c]) => put(`${r},${c}`, 'dl'));
  return map;
}

function premiumLabel(code) {
  if (code === 'tw') return 'TW';
  if (code === 'dw') return 'DW';
  if (code === 'tl') return 'TL';
  if (code === 'dl') return 'DL';
  return '';
}

function canPlaceWord(board, word, row, col, direction) {
  const dr = direction === 'v' ? 1 : 0;
  const dc = direction === 'h' ? 1 : 0;
  let overlap = 0;
  const placements = [];

  for (let i = 0; i < word.length; i += 1) {
    const r = row + (dr * i);
    const c = col + (dc * i);
    if (r < 0 || c < 0 || r >= board.length || c >= board.length) return null;
    const existing = board[r][c];
    if (existing && existing !== word[i]) return null;
    if (existing === word[i]) overlap += 1;
    placements.push({ r, c, existing, letter: word[i] });
  }

  return { overlap, placements };
}

function scorePlacement(word, placements, premiumMap) {
  let subtotal = 0;
  let wordMultiplier = 1;
  let newlyPlacedCount = 0;

  placements.forEach((p) => {
    const letterValue = SCRABBLE_LETTER_VALUES[p.letter] || 0;
    if (p.existing) {
      subtotal += letterValue;
      return;
    }
    newlyPlacedCount += 1;
    const premium = premiumMap.get(`${p.r},${p.c}`);
    if (premium === 'dl') subtotal += letterValue * 2;
    else if (premium === 'tl') subtotal += letterValue * 3;
    else subtotal += letterValue;

    if (premium === 'dw') wordMultiplier *= 2;
    if (premium === 'tw') wordMultiplier *= 3;
  });

  let total = subtotal * wordMultiplier;
  if (newlyPlacedCount === 7) total += 50;
  return { total, newlyPlacedCount };
}

function placeWordOnBoard(board, word, premiumMap, placementsLog) {
  const center = 7;

  if (placementsLog.length === 0) {
    const startCol = Math.max(0, Math.min(15 - word.length, center - Math.floor(word.length / 2)));
    const firstTry = canPlaceWord(board, word, center, startCol, 'h');
    if (!firstTry) return null;
    firstTry.placements.forEach((p) => { board[p.r][p.c] = p.letter; });
    const score = scorePlacement(word, firstTry.placements, premiumMap);
    return { ...score, direction: 'h', row: center, col: startCol };
  }

  const candidates = [];
  for (let r = 0; r < 15; r += 1) {
    for (let c = 0; c < 15; c += 1) {
      for (let i = 0; i < word.length; i += 1) {
        if (board[r][c] !== word[i]) continue;
        const hCol = c - i;
        const h = canPlaceWord(board, word, r, hCol, 'h');
        if (h && h.overlap > 0) candidates.push({ row: r, col: hCol, direction: 'h', details: h });
        const vRow = r - i;
        const v = canPlaceWord(board, word, vRow, c, 'v');
        if (v && v.overlap > 0) candidates.push({ row: vRow, col: c, direction: 'v', details: v });
      }
    }
  }

  const ordered = candidates.sort((a, b) => b.details.overlap - a.details.overlap);
  if (!ordered.length) {
    for (let r = 0; r < 15; r += 1) {
      for (let c = 0; c <= 15 - word.length; c += 1) {
        const h = canPlaceWord(board, word, r, c, 'h');
        if (h) {
          h.placements.forEach((p) => { board[p.r][p.c] = p.letter; });
          const score = scorePlacement(word, h.placements, premiumMap);
          return { ...score, direction: 'h', row: r, col: c };
        }
      }
    }
    return null;
  }

  const best = ordered[0];
  best.details.placements.forEach((p) => { board[p.r][p.c] = p.letter; });
  const score = scorePlacement(word, best.details.placements, premiumMap);
  return { ...score, direction: best.direction, row: best.row, col: best.col };
}

function renderScrabbleBoard(board, premiumMap) {
  const cells = [];
  for (let r = 0; r < 15; r += 1) {
    for (let c = 0; c < 15; c += 1) {
      const key = `${r},${c}`;
      const premium = premiumMap.get(key) || '';
      const letter = board[r][c];
      if (letter) {
        const value = SCRABBLE_LETTER_VALUES[letter] || 0;
        cells.push(`<div class="scrabble-cell filled"><span class="tile-letter">${letter.toUpperCase()}</span><span class="tile-value">${value}</span></div>`);
      } else {
        const premiumClass = premium ? ` premium-${premium}` : '';
        const label = premium ? `<span class="premium-label">${premiumLabel(premium)}</span>` : (r === 7 && c === 7 ? '<span class="premium-label center-star">★</span>' : '');
        cells.push(`<div class="scrabble-cell${premiumClass}">${label}</div>`);
      }
    }
  }
  return `<div class="scrabble-board">${cells.join('')}</div>`;
}

const BOGGLE_DICE = [
  'AAEEGN', 'ABBJOO', 'ACHOPS', 'AFFKPS',
  'AOOTTW', 'CIMOTU', 'DEILRX', 'DELRVY',
  'DISTTY', 'EEGHNW', 'EEINSU', 'EHRTVW',
  'EIOSST', 'ELRTTY', 'HIMNQU', 'HLNNRZ'
];

function shuffleArray(values) {
  const arr = values.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function rollBoggleBoard() {
  const vowels = ['A', 'E', 'I', 'O', 'U'];
  const consonants = defaultMapping.map((letter) => String(letter || '').toUpperCase()).filter(Boolean);
  const letters = [];

  for (let i = 0; i < 6; i += 1) {
    letters.push(vowels[Math.floor(Math.random() * vowels.length)]);
  }
  for (let i = letters.length; i < 16; i += 1) {
    letters.push(consonants[Math.floor(Math.random() * consonants.length)]);
  }

  const shuffled = shuffleArray(letters);
  const board = [];
  for (let i = 0; i < 4; i += 1) {
    board.push(shuffled.slice(i * 4, (i + 1) * 4));
  }
  return board;
}

function renderBoggleBoard(board, highlightedPath = []) {
  const highlighted = new Set(highlightedPath.map((pos) => `${pos.r},${pos.c}`));
  const cells = [];
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      const key = `${r},${c}`;
      const activeClass = highlighted.has(key) ? ' active' : '';
      const value = board[r][c];
      cells.push(`<div class="boggle-cell${activeClass}" data-row="${r}" data-col="${c}" draggable="false">${value}</div>`);
    }
  }
  return `<div class="boggle-board">${cells.join('')}</div>`;
}

function getBoggleScore(wordLength) {
  if (wordLength < 3) return 0;
  if (wordLength <= 4) return 1;
  if (wordLength === 5) return 2;
  if (wordLength === 6) return 3;
  if (wordLength === 7) return 5;
  return 11;
}

function findBogglePath(board, rawWord) {
  const word = rawWord.toUpperCase();
  if (word.length < 3) return null;

  const rows = 4;
  const cols = 4;
  const directions = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1]
  ];

  const matchesAt = (cellLetter, targetWord, idx) => (targetWord[idx] === cellLetter ? 1 : 0);

  const dfs = (r, c, index, visited, path) => {
    const key = `${r},${c}`;
    if (visited.has(key)) return null;

    const consume = matchesAt(board[r][c], word, index);
    if (!consume) return null;

    const nextIndex = index + consume;
    const nextPath = [...path, { r, c }];
    if (nextIndex >= word.length) return nextPath;

    const nextVisited = new Set(visited);
    nextVisited.add(key);

    for (const [dr, dc] of directions) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      const result = dfs(nr, nc, nextIndex, nextVisited, nextPath);
      if (result) return result;
    }
    return null;
  };

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const path = dfs(r, c, 0, new Set(), []);
      if (path) return path;
    }
  }
  return null;
}

function showExercise(mode){
  state.currentExercise = mode;
  exerciseCard.classList.remove('hidden');
  exerciseBody.innerHTML = '';
  exerciseTitle.textContent = `Mode ${mode}`;
  enterTrainingFocus();
  if (mode === '1') renderMode1();
  if (mode === 'flash') renderModeFlash();
  if (mode === '2') renderMode2();
  if (mode === '3') renderMode3();
  if (mode === '4') renderMode4();
  if (mode === '5') renderMode5();
}

function renderMode1(){
  stopMode1Drill();
  exerciseTitle.textContent = 'Mode 1 — Reflexes';
  exerciseBody.innerHTML = '<div id="mode1-panel-body"></div>';
  renderMode1Classic(document.getElementById('mode1-panel-body'));
}

function renderModeFlash(){
  stopMode1Drill();
  exerciseTitle.textContent = 'Mode 2 — Flash Drill';
  exerciseBody.innerHTML = '<div id="mode1-panel-body"></div>';
  renderMode1FlashPanel(document.getElementById('mode1-panel-body'));
}

function renderMode2(){
  exerciseTitle.textContent = 'Mode 3 — Synthesis';
  exerciseBody.innerHTML = `<p>Choose a chunk pattern (for example 2-2-4), then synthesize the sequence fast.</p><div class="rule-row"><label for="chunk-pattern">Chunk pattern</label><div><input id="chunk-pattern" value="${state.masterLength}" /></div></div><div class="rule-row"><label>Digits</label><div><strong id="mode2-sequence">...</strong></div></div><label for="response-2">Your answer (digits or mapped consonants)</label><input id="response-2" autocomplete="off" /><div id="mode-result" class="mode-result"></div><div style="margin-top:10px;display:flex;gap:8px;"><button id="regen-2">Regenerate</button><button id="submit-2">Submit</button></div>`;

  let currentDigits = '';
  let currentMapped = '';
  function regenerateMode2() {
    const patternStr = document.getElementById('chunk-pattern').value.trim() || String(state.masterLength);
    const pattern = parseChunkPattern(patternStr);
    currentDigits = generateDigitsFromPattern(pattern);
    currentMapped = currentDigits.split('').map(d => state.mapping[Number(d)] || '?').join('');
    document.getElementById('mode2-sequence').textContent = formatDigitsWithPattern(currentDigits, pattern);
  }

  regenerateMode2();
  startTimer();
  attachSubmitOnEnter(exerciseBody, 'submit-2');
  document.getElementById('regen-2').addEventListener('click', regenerateMode2);
  const input = document.getElementById('response-2');
  const resultEl = document.getElementById('mode-result');
  input.focus();
  document.getElementById('submit-2').addEventListener('click', () => {
    const response = input.value.trim().toLowerCase();
    const latency = Math.round(performance.now() - state.startTime);
    const lettersOnly = /^[a-z]+$/.test(response);
    const digitsOnly = /^\d+$/.test(response);
    const normalizedLetters = normalizeText(response);
    let correct = false;
    if (digitsOnly) correct = response === currentDigits;
    if (lettersOnly) correct = normalizedLetters === normalizeText(currentMapped);

    logInteraction({mode: '2', prompt: currentMapped, response, correct, latency, pair: currentDigits.slice(0, 2), details: []});
    applyAnswerFeedback(input, resultEl, correct, correct ? 'Correct.' : `Incorrect. Expected ${currentDigits} or ${currentMapped}`);
    notify(correct ? 'Correct.' : `Incorrect. Expected ${currentDigits} or ${currentMapped}`, 700, () => {
      if (correct) renderMode2();
      else { input.focus(); input.select(); }
    });
  });
}

function renderMode3(){
  if (state.mode3Cleanup) {
    state.mode3Cleanup();
    state.mode3Cleanup = null;
  }

  const board = rollBoggleBoard();
  const foundWords = new Set();
  const scoredWords = [];
  let totalScore = 0;

  exerciseTitle.textContent = 'Mode 4 — Boggle Sprint';
  exerciseBody.innerHTML = `<p>Type words you spot on the board. Your found-word list and score will build up for this grid.</p>${renderBoggleBoard(board)}<div class="scrabble-meta"><span><strong>Total score:</strong> <span id="scrabble-score">0</span></span><label class="scrabble-dict-toggle"><input id="scrabble-dict" type="checkbox" ${state.mode3UseDictionary ? 'checked' : ''} /> Validate with dictionary</label></div><label for="response-3">Word</label><input id="response-3" autocomplete="off" /><div id="mode-result" class="mode-result"></div><div id="scrabble-used" class="scrabble-used">No words found yet.</div><div style="margin-top:10px;display:flex;gap:8px;"><button id="regen-3">New grid</button><button id="submit-3">Submit word</button></div>`;

  startTimer();
  const resultEl = document.getElementById('mode-result');
  const scoreEl = document.getElementById('scrabble-score');
  const usedEl = document.getElementById('scrabble-used');
  const dictToggle = document.getElementById('scrabble-dict');
  const refreshFoundWords = () => {
    if (!scoredWords.length) {
      usedEl.textContent = 'No words found yet.';
      return;
    }
    usedEl.textContent = `Found: ${scoredWords.map(w => `${w.word.toUpperCase()} (+${w.score})`).join(' | ')}`;
  };
  const submitWord = async () => {
    const input = document.getElementById('response-3');
    const response = normalizeText(input.value.trim());
    const latency = Math.round(performance.now() - state.startTime);
    const dictEnabled = !!state.mode3UseDictionary;

    if (response.length < 3) {
      applyAnswerFeedback(null, resultEl, false, 'Too short. Boggle words need at least 3 letters.');
      notify('Too short. Boggle words need at least 3 letters.', 850);
      input.focus();
      input.select();
      return;
    }

    if (foundWords.has(response)) {
      applyAnswerFeedback(null, resultEl, false, 'Already found. Try another word.');
      notify('Already found that word on this grid.', 850);
      input.focus();
      input.select();
      return;
    }

    const path = findBogglePath(board, response);
    if (!path) {
      applyAnswerFeedback(input, resultEl, false, 'Not on the board path.');
      notify('That word is not traceable on this board.', 850);
      input.focus();
      input.select();
      return;
    }

    let dictionaryOk = true;
    if (dictEnabled && path) {
      const dictCheck = await validateWordAgainstDictionary(response);
      dictionaryOk = dictCheck.valid;
    }

    const correct = !!path && dictionaryOk;
    const wordScore = correct ? getBoggleScore(response.length) : 0;
    if (correct) {
      totalScore += wordScore;
      scoreEl.textContent = String(totalScore);
      foundWords.add(response);
      scoredWords.push({ word: response, score: wordScore });
      refreshFoundWords();
    }

    logInteraction({mode: '3', prompt: board.flat().join(''), response, correct, latency, charCount: response.length});
    const errorMessage = dictEnabled && !dictionaryOk
      ? 'Not found in dictionary check.'
      : 'That word is not traceable on this board.';
    const successMessage = `Found ${response.toUpperCase()} (+${wordScore}).`;

    applyAnswerFeedback(input, resultEl, correct, correct ? successMessage : errorMessage);
    notify(correct ? successMessage : errorMessage, 900);
    if (correct) input.value = '';
    input.focus();
    input.select();
    startTimer();
  };

  dictToggle.addEventListener('change', () => {
    state.mode3UseDictionary = dictToggle.checked;
  });

  attachSubmitOnEnter(exerciseBody, 'submit-3');
  const input = document.getElementById('response-3');
  input.focus();
  document.getElementById('submit-3').addEventListener('click', submitWord);
  document.getElementById('regen-3').addEventListener('click', () => renderMode3());
  state.mode3Cleanup = null;
}

function renderMode4(){
  const digits = Array.from({length:state.masterLength},()=>Math.floor(Math.random()*10)).join('');
  const mapped = digits.split('').map(d=>state.mapping[Number(d)]).join('');
  exerciseTitle.textContent = 'Mode 5 — Word Generator';
  exerciseBody.innerHTML = `<p>Create a word containing this consonant string in order: <strong>${mapped}</strong></p><label for="response-4">Generated word</label><input id="response-4" autocomplete="off" /><div id="mode-result" class="mode-result"></div><button id="submit-4">Submit</button>`;
  startTimer();
  attachSubmitOnEnter(exerciseBody,'submit-4');
  const input = document.getElementById('response-4');
  const resultEl = document.getElementById('mode-result');
  input.focus();
  document.getElementById('submit-4').addEventListener('click',()=>{
    const response = input.value.trim().toLowerCase();
    const latency = Math.round(performance.now()-state.startTime);
    const normalized = normalizeText(response);
    const hasVowel = /[aeiou]/.test(normalized);
    const correct = mapped && isSubsequence(mapped.toLowerCase(), normalized) && normalized.length > mapped.toLowerCase().length && hasVowel;
    logInteraction({mode:'4',prompt:mapped,response:normalized,correct,latency,charCount:normalized.length});
    applyAnswerFeedback(input,resultEl,correct,correct?'Great. The consonants are present in order.':`Incorrect. Try a longer word containing ${mapped}`);
    notify(correct?'Great. The consonants are present in order.':'Try a longer word containing the consonants for '+mapped,700,()=>{ if(correct) renderMode4(); else{ input.focus(); input.select(); }});
  });
}

if (showSetupButton) showSetupButton.addEventListener('click',toggleSetup);
resetRulesButton.addEventListener('click',resetRules);
tiles.forEach(tile=>tile.addEventListener('click',()=>{ showExercise(tile.dataset.mode); }));

createRulesetInputs();
validateSetup();
enableDashboard();
if (masterLengthInput) {
  masterLengthInput.value = state.masterLength;
  masterLengthInput.addEventListener('change', (event) => updateMasterLength(event.target.value));
}
if (masterLengthApplyButton) {
  masterLengthApplyButton.addEventListener('click', () => {
    if (masterLengthInput) {
      updateMasterLength(masterLengthInput.value);
      notify(`Master sequence length set to ${state.masterLength}`, 900);
    }
  });
}
renderWeaknesses();
