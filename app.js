import { TUNINGS, noteName, frequencyFor, midiFor, closestString, detectPitch } from './pitch.js';
import { TuningConfirmation } from './confirmation.js';
import { KeepAwake } from './keep-awake.js';

const $ = id => document.getElementById(id);
let saved = {};
try { saved = JSON.parse(localStorage.getItem('attune-settings') || '{}') || {}; } catch {}
let tuning = TUNINGS[saved.tuning] ? saved.tuning : 'standard';
let a4 = Number.isFinite(saved.a4) && saved.a4 >= 420 && saved.a4 <= 460 ? saved.a4 : 440;
let confirmationSound = saved.confirmationSound !== false;
const tolerances = [2, 5, 10, 15, 20];
let tolerance = tolerances.includes(saved.tolerance) ? saved.tolerance : 5;
let keepScreenAwake = saved.keepScreenAwake !== false;
const confirmation = new TuningConfirmation(tolerance);
const wakeMessages = {
  unsupported: 'Screen wake lock is unavailable in this browser.',
  idle: 'Stays on while tuning or playing a reference tone.',
  paused: 'Screen wake lock pauses while the app is hidden.',
  pending: 'Keeping your screen awake…',
  active: 'Screen stays awake while you tune.',
  unavailable: 'Screen lock was not granted or was released. Try toggling this on again.'
};
const awake = new KeepAwake({wakeLock: navigator.wakeLock, document, onChange: state => {
  $('wakeStatus').textContent = wakeMessages[state];
}});
const chimeVoices = new Set();
let listenAfter = 0;
let selected = 0, mode = 'guitar', running = false, starting = false;
let context, stream, source, analyser, frame, tone, toneGain, toneTimeout;
let toneRequest = 0;
let samples, scratch, lastSample = 0, lastPitch = 0, history = [], chromaticNote = 40;
const subs = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
const currentMidi = () => mode === 'chromatic' ? chromaticNote : TUNINGS[tuning].notes[selected];
const labelFor = midi => { const n = noteName(midi); return `${n.name}${subs[n.octave] || n.octave}`; };
function persist() { try { localStorage.setItem('attune-settings', JSON.stringify({ tuning, a4, confirmationSound, tolerance, keepScreenAwake })); } catch {} }
function resetHistory() { history = []; lastPitch = 0; confirmation.interrupt(); }
function drawStrings() {
  $('strings').replaceChildren();
  TUNINGS[tuning].notes.forEach((midi, index) => {
    const n = noteName(midi), button = document.createElement('button');
    button.className = `string-button${selected === index ? ' selected' : ''}`;
    button.setAttribute('aria-label', `String ${6 - index}, ${n.name}${n.octave}`);
    button.setAttribute('aria-pressed', String(selected === index));
    button.innerHTML = `<span class="string-number">${6 - index}</span><span class="string-note">${n.name}<sub>${n.octave}</sub></span>`;
    button.addEventListener('click', () => {
      selected = index;
      if (mode === 'guitar') $('autoDetect').checked = false;
      else chromaticNote = midi;
      resetHistory(); drawStrings(); showIdle();
      if (tone) playTone();
    });
    $('strings').append(button);
  });
  $('strings').classList.toggle('chromatic', mode === 'chromatic');
  updateToneLabel();
}
function setNote(midi) { const n = noteName(midi); $('noteLetter').textContent = n.name; $('noteOctave').textContent = n.octave; }
function updateToneLabel() { $('playLabel').textContent = `${tone ? 'Stop' : 'Play'} ${labelFor(currentMidi())}`; }
function showIdle() {
  setNote(currentMidi());
  $('frequencyValue').textContent = frequencyFor(currentMidi(), a4).toFixed(2);
  $('frequencyLabel').textContent = 'target frequency';
  $('pitchMessage').textContent = tone ? 'LISTEN & MATCH' : running ? 'PLUCK A STRING' : 'LET’S GET IN TUNE';
  $('reading').textContent = tone ? 'Match your string to the reference tone' : running ? 'Listening for your guitar…' : 'Ready when you are';
  $('reading').classList.remove('in-tune');
  $('meterNeedle').style.left = '50%'; $('meterNeedle').style.opacity = '.4';
}
function updateTuning() {
  $('tuningNotes').replaceChildren(...TUNINGS[tuning].notes.map(midi => { const span = document.createElement('span'); span.textContent = noteName(midi).name; return span; }));
  drawStrings(); showIdle();
}
for (const [key, value] of Object.entries(TUNINGS)) { const option = document.createElement('option'); option.value = key; option.textContent = value.name; $('tuningSelect').append(option); }
$('tuningSelect').value = tuning;
$('calibration').value = a4;
$('confirmationSound').checked = confirmationSound;
$('keepScreenAwake').checked = keepScreenAwake;
$('keepScreenAwake').disabled = !navigator.wakeLock?.request;
$('keepScreenAwake').addEventListener('change', () => {
  keepScreenAwake = $('keepScreenAwake').checked; persist(); setStatus();
});
function updateTolerance() {
  $('tolerance').value = tolerance;
  const zone = document.querySelector('.tune-zone');
  zone.style.left = (50 - tolerance) + '%';
  zone.style.width = (2 * tolerance) + '%';
  $('helpTolerance').textContent = '±' + tolerance + ' cents';
}
$('tolerance').addEventListener('change', () => {
  tolerance = Number($('tolerance').value);
  confirmation.setTolerance(tolerance); resetHistory(); stopChime(); persist();
  updateTolerance(); showIdle();
});
updateTolerance();
$('confirmationSound').addEventListener('change', () => {
  confirmationSound = $('confirmationSound').checked; persist(); confirmation.reset();
  if (!confirmationSound) stopChime();
});
for (let i = 0; i <= 40; i++) { const tick = document.createElement('i'); tick.className = i === 20 ? 'center' : i % 5 === 0 ? 'major' : ''; $('meterTicks').append(tick); }
$('tuningSelect').addEventListener('change', () => { tuning = $('tuningSelect').value; selected = 0; confirmation.reset(); resetHistory(); persist(); updateTuning(); if (tone) playTone(); });
function setCalibration(value) { confirmation.reset(); a4 = Math.max(420, Math.min(460, Math.round(Number(value) || 440))); $('calibration').value = a4; persist(); resetHistory(); showIdle(); if (tone) playTone(); }
$('calibration').addEventListener('change', e => setCalibration(e.target.value));
$('pitchDown').addEventListener('click', () => setCalibration(a4 - 1));
$('pitchUp').addEventListener('click', () => setCalibration(a4 + 1));
$('autoDetect').addEventListener('change', () => { resetHistory(); showIdle(); });
function setMode(nextMode) {
  confirmation.reset(); mode = nextMode; chromaticNote = TUNINGS[tuning].notes[selected]; resetHistory();
  for (const id of ['guitar', 'chromatic']) { $(`${id}Mode`).classList.toggle('active', mode === id); $(`${id}Mode`).setAttribute('aria-pressed', String(mode === id)); }
  $('tuningSelect').disabled = mode === 'chromatic';
  $('autoDetect').disabled = mode === 'chromatic';
  $('stringHelp').textContent = mode === 'chromatic' ? 'Detects any note. Select a string for a reference tone.' : 'Pluck a string, or select one to tune it individually.';
  drawStrings(); showIdle(); if (tone) playTone();
}
$('guitarMode').addEventListener('click', () => setMode('guitar'));
$('chromaticMode').addEventListener('click', () => setMode('chromatic'));

async function getContext() {
  if (!context || context.state === 'closed') { const AudioContext = window.AudioContext || window.webkitAudioContext; if (!AudioContext) throw new Error('Audio is not supported in this browser. Try a current version of Chrome, Firefox, or Safari.'); context = new AudioContext(); }
  if (context.state === 'suspended') await context.resume();
  return context;
}
async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
    const previous = $('micSelect').value;
    $('micSelect').replaceChildren(new Option('Default microphone', ''));
    devices.filter(d => d.deviceId && d.deviceId !== 'default').forEach((d, i) => $('micSelect').append(new Option(d.label || `Microphone ${i + 1}`, d.deviceId)));
    if ([...$('micSelect').options].some(o => o.value === previous)) $('micSelect').value = previous;
    if (devices.some(d => d.label)) $('deviceHint').textContent = 'Choose the input closest to your guitar.';
  } catch { $('deviceHint').textContent = 'Start tuning to access your microphones.'; }
}
function setStatus() {
  void awake.setWanted(keepScreenAwake && (running || Boolean(tone)));
  $('startButton').classList.toggle('running', running);
  $('startButton').querySelector('span').textContent = starting ? 'Connecting…' : running ? 'Stop tuning' : 'Start tuning';
  $('startButton').disabled = starting;
  $('micSelect').disabled = starting;
  $('liveStatus').classList.toggle('listening', running && !tone);
  $('liveStatus').querySelector('span').textContent = running ? tone ? 'TONE PLAYING' : 'LISTENING' : 'MIC OFF';
}
function stopListening() {
  running = false; cancelAnimationFrame(frame); stopChime(); confirmation.reset();
  if (stream) { for (const track of stream.getTracks()) { track.onended = null; track.stop(); } stream = null; }
  source?.disconnect(); source = null; analyser = null;
  resetHistory(); setStatus(); showIdle();
  $('micHint').textContent = 'Microphone off. Start again whenever you’re ready.';
}
function reportError(error) {
  const messages = {
    NotAllowedError: 'Microphone access was denied. Allow it in your browser’s site settings, then try again.',
    NotFoundError: 'No microphone found. Connect one, then try again.',
    NotReadableError: 'Your microphone is unavailable. Close other apps using it, then try again.',
    OverconstrainedError: 'That microphone is no longer available. Choose another input.',
    SecurityError: 'Microphone access requires HTTPS or localhost.'
  };
  $('micHint').textContent = messages[error.name] || error.message || 'Could not start audio. Please try again.';
  $('micHint').classList.add('error');
}
async function startListening() {
  if (starting) return;
  starting = true; $('micHint').classList.remove('error'); setStatus();
  try {
    if (!window.isSecureContext) throw new Error('Open this app over HTTPS or localhost to use your microphone.');
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is unavailable in this browser.');
    const ctx = await getContext();
    const deviceId = $('micSelect').value;
    const nextStream = await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    stream = nextStream;
    analyser = ctx.createAnalyser(); analyser.fftSize = 4096;
    source = ctx.createMediaStreamSource(stream); source.connect(analyser);
    samples = new Float32Array(analyser.fftSize); scratch = new Float32Array(analyser.fftSize / 2);
    for (const track of stream.getTracks()) track.onended = () => { stopListening(); $('micHint').textContent = 'Microphone disconnected. Choose an input and start again.'; };
    running = true; resetHistory(); lastSample = 0;
    $('micHint').textContent = 'Pluck one string at a time. We’ll take it from here.';
    showIdle(); frame = requestAnimationFrame(listen); await refreshDevices();
  } catch (error) { stopListening(); reportError(error); }
  finally { starting = false; setStatus(); }
}
function listen(timestamp) {
  if (!running) return;
  frame = requestAnimationFrame(listen);
  if (tone || timestamp < listenAfter || timestamp - lastSample < 65) return;
  lastSample = timestamp;
  analyser.getFloatTimeDomainData(samples);
  const frequency = detectPitch(samples, context.sampleRate, scratch);
  if (!frequency) { confirmation.interrupt(); if (timestamp - lastPitch > 1200) { history = []; showIdle(); } return; }
  lastPitch = timestamp;
  // Median smoothing removes short transient jumps without making the meter sluggish.
  if (history.length && Math.abs(12 * Math.log2(frequency / history[history.length - 1])) > .8) history = [];
  history.push(frequency); if (history.length > 5) history.shift();
  const sorted = [...history].sort((a, b) => a - b), stable = sorted[Math.floor(sorted.length / 2)];
  if (mode === 'chromatic') { chromaticNote = Math.round(midiFor(stable, a4)); updateToneLabel(); }
  else if ($('autoDetect').checked) { const next = closestString(stable, TUNINGS[tuning].notes, a4); if (selected !== next) { selected = next; drawStrings(); } }
  const midi = currentMidi(), cents = 1200 * Math.log2(stable / frequencyFor(midi, a4));
  const inTune = Math.abs(cents) <= tolerance;
  setNote(midi);
  $('frequencyValue').textContent = stable.toFixed(2); $('frequencyLabel').textContent = 'detected frequency';
  $('pitchMessage').textContent = inTune ? 'RIGHT ON. SOUNDS GOOD.' : cents < 0 ? 'A LITTLE HIGHER' : 'A LITTLE LOWER';
  $('reading').textContent = inTune ? `In tune · ±${tolerance} cents` : `${cents > 0 ? '+' : '−'}${Math.abs(Math.round(cents))} cents · ${cents < 0 ? 'Tune up ↑' : 'Tune down ↓'}`;
  $('reading').classList.toggle('in-tune', inTune);
  $('meterNeedle').style.left = `${50 + Math.max(-50, Math.min(50, cents))}%`;
  $('meterNeedle').style.opacity = '1';
  if (confirmationSound && confirmation.update(midi, cents, timestamp)) playChime();
}
$('startButton').addEventListener('click', () => running ? stopListening() : startListening());
$('micSelect').addEventListener('change', async () => { if (running) { stopListening(); await startListening(); } });
navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);

function stopChime() {
  for (const voice of chimeVoices) {
    const now = context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, .005);
    voice.oscillator.stop(now + .025);
  }
}
function playChime() {
  if (!context || context.state !== 'running' || tone) return;
  const now = context.currentTime;
  // Let the chime and its room echo clear before reading the microphone again.
  listenAfter = performance.now() + 650;
  history = []; confirmation.interrupt();
  for (const [offset, frequency] of [[0, 880], [.13, 1174.66]]) {
    const oscillator = context.createOscillator(), gain = context.createGain();
    const start = now + offset;
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(.065, start + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, start + .18);
    gain.gain.linearRampToValueAtTime(0, start + .2);
    oscillator.connect(gain); gain.connect(context.destination);
    const voice = { oscillator, gain }; chimeVoices.add(voice);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); chimeVoices.delete(voice); };
    oscillator.start(start); oscillator.stop(start + .21);
  }
}

function stopTone() {
  toneRequest++;
  clearTimeout(toneTimeout);
  if (tone) { const oldTone = tone, oldGain = toneGain; const now = context.currentTime; oldGain.gain.cancelScheduledValues(now); oldGain.gain.setTargetAtTime(0, now, .015); oldTone.stop(now + .08); oldTone.onended = () => { oldTone.disconnect(); oldGain.disconnect(); }; tone = null; toneGain = null; }
  $('playSymbol').textContent = '▶'; updateToneLabel(); setStatus(); resetHistory(); showIdle();
}
async function playTone() {
  stopChime();
  stopTone();
  const request = toneRequest;
  try {
    const ctx = await getContext();
    if (request !== toneRequest) return;
    tone = ctx.createOscillator(); toneGain = ctx.createGain();
    tone.type = 'triangle'; tone.frequency.value = frequencyFor(currentMidi(), a4);
    toneGain.gain.setValueAtTime(0, ctx.currentTime); toneGain.gain.linearRampToValueAtTime(Number($('volume').value) / 100 * .3, ctx.currentTime + .04);
    tone.connect(toneGain); toneGain.connect(ctx.destination); tone.start();
    $('playSymbol').textContent = '■'; updateToneLabel(); setStatus(); showIdle();
    toneTimeout = setTimeout(stopTone, 8000);
  } catch (error) { reportError(error); }
}
$('playTone').addEventListener('click', () => tone ? stopTone() : playTone());
$('volume').addEventListener('input', () => { if (toneGain) toneGain.gain.setTargetAtTime(Number($('volume').value) / 100 * .3, context.currentTime, .02); });
$('helpButton').addEventListener('click', () => $('helpDialog').showModal());
$('closeHelp').addEventListener('click', () => $('helpDialog').close());
$('helpDialog').addEventListener('click', e => { if (e.target === $('helpDialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
window.addEventListener('pagehide', () => { stopTone(); stopListening(); context?.close(); });
updateTuning(); refreshDevices(); setStatus();
