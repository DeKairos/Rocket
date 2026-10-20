'use strict';

const $ = (id) => document.getElementById(id);
const names = { trained: 'Trained pilot', best: 'Best checkpoint', random: 'Pure chaos' };
const actions = ['COAST / ENGINES IDLE', 'LEFT SIDE ENGINE', 'MAIN ENGINE FIRING', 'RIGHT SIDE ENGINE'];
const outcomes = { landed: 'LANDED', crashed: 'CRASHED', timeout: 'TIME LIMIT', out_of_bounds: 'OUT OF BOUNDS' };
const state = { policy: 'trained', mode: 'solo', flights: [], step: 0, playing: false,
  speed: 1, busy: false, status: null, logged: false, history: [], lastTime: 0, maxSteps: 0 };
const canvas = $('flight-canvas');
const ctx = canvas.getContext('2d');
let width = 0, height = 0;

function resize() {
  const bounds = $('space-view').getBoundingClientRect();
  width = bounds.width; height = bounds.height;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
new ResizeObserver(resize).observe($('space-view'));

function randomAt(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function path(points, close = false) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  if (close) ctx.closePath();
}
function line(x1, y1, x2, y2, color, dash = []) {
  ctx.beginPath(); ctx.strokeStyle = color; ctx.setLineDash(dash);
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
}

function drawBackground(w, h, seed = 100) {
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, '#101a22'); gradient.addColorStop(.63, '#14232a'); gradient.addColorStop(1, '#1c2c2d');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * .65, h * .7, 0, w * .65, h * .7, w * .6);
  glow.addColorStop(0, '#54745d13'); glow.addColorStop(1, '#54745d00');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 100; i++) {
    const x = randomAt(i + seed * .001) * w, y = randomAt(i + 200) * h * .85;
    const bright = randomAt(i + 400);
    ctx.fillStyle = `rgba(190,210,203,${.12 + bright * .4})`;
    ctx.fillRect(x, y, bright > .95 ? 1.7 : .8, bright > .95 ? 1.7 : .8);
    if (bright > .985) {
      line(x - 3, y + .5, x + 4, y + .5, '#bfd6c522');
      line(x + .5, y - 3, x + .5, y + 4, '#bfd6c522');
    }
  }
  ctx.lineWidth = .5;
  for (let x = 20; x < w; x += 40) line(x, 0, x, h, '#9ab3a304');
  for (let y = 20; y < h; y += 40) line(0, y, w, y, '#9ab3a304');
  // A distant, stylized planet is scenery only; all flight geometry comes from Box2D.
  const px = w * .82, py = h * .22, pr = Math.min(w, h) * .065;
  const planet = ctx.createRadialGradient(px - pr * .3, py - pr * .4, 0, px, py, pr);
  planet.addColorStop(0, '#8b9c8340'); planet.addColorStop(.8, '#74896e2a'); planet.addColorStop(1, '#586f6120');
  ctx.fillStyle = planet; ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(px, py); ctx.rotate(-.5); ctx.strokeStyle = '#83967920';
  ctx.beginPath(); ctx.ellipse(0, 0, pr * 1.6, pr * .32, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  // Instrument corner brackets.
  const inset = 8, length = 9;
  ctx.strokeStyle = '#b5c6b82b'; ctx.lineWidth = 1;
  for (const [x, y, dx, dy] of [[inset, inset, 1, 1], [w - inset, inset, -1, 1],
    [inset, h - inset, 1, -1], [w - inset, h - inset, -1, -1]]) {
    path([[x, y + dy * length], [x, y], [x + dx * length, y]]); ctx.stroke();
  }
}

const previewWorld = { width: 20, height: 13.333, pad: [8, 12, 3.333], terrain:
  [[0, 3.5], [2, 4.5], [4, 4.2], [6, 3.5], [8, 3.333], [10, 3.333],
    [12, 3.333], [14, 3.7], [16, 4.6], [18, 4.2], [20, 4.8]] };

function drawScene(flight, w, h, step, index) {
  const world = flight?.world || previewWorld;
  drawBackground(w, h, flight?.seed || 100);
  const scale = Math.min(w / 24, h / 17.5);
  const offset = (w - world.width * scale) / 2;
  const floor = h * .85 + world.pad[2] * scale;
  const project = ([x, y]) => [offset + x * scale, floor - y * scale];
  const padY = project([10, world.pad[2]])[1];
  // Far ridgeline adds depth without changing the physical foreground terrain.
  const ridge = [[-5, 4], [-2, 5.6], [1, 4.4], [4, 6.8], [7, 4.6], [9, 4.8], [12, 4.2],
    [14, 5.4], [17, 6.3], [20, 5], [24, 7], [24, -3], [-5, -3]].map(project);
  path(ridge, true); ctx.fillStyle = '#283a3525'; ctx.fill();
  const terrain = world.terrain.map(project);
  const ground = [[0, terrain[0][1]], ...terrain, [w, terrain[terrain.length - 1][1]], [w, h], [0, h]];
  path(ground, true);
  const groundFill = ctx.createLinearGradient(0, padY - 30, 0, h);
  groundFill.addColorStop(0, '#344036'); groundFill.addColorStop(1, '#222d29');
  ctx.fillStyle = groundFill; ctx.fill();
  path([[0, terrain[0][1]], ...terrain, [w, terrain[terrain.length - 1][1]]]);
  ctx.strokeStyle = '#97a37b55'; ctx.lineWidth = 1; ctx.stroke();
  // Surface contour lines, clipped to the exact simulator terrain.
  ctx.save(); path(ground, true); ctx.clip();
  for (let i = 0; i < 8; i++) {
    path(terrain.map(([x, y], j) => [x, y + 10 + i * 11 + Math.sin(j * 2 + i) * 6]));
    ctx.strokeStyle = '#a8b48b0b'; ctx.lineWidth = .7; ctx.stroke();
  }
  for (let i = 0; i < 70; i++) {
    const x = randomAt(i + 700) * w, y = padY - 25 + randomAt(i + 800) * (h - padY + 25);
    ctx.fillStyle = '#c7d0a71a'; ctx.fillRect(x, y, 1.5, .6);
  }
  ctx.restore();
  const [padLeft] = project([world.pad[0], world.pad[2]]), [padRight] = project([world.pad[1], world.pad[2]]);
  const padCenter = (padLeft + padRight) / 2;
  ctx.shadowColor = '#f15c3544'; ctx.shadowBlur = 14;
  line(padLeft, padY, padRight, padY, '#e78b5b'); ctx.shadowBlur = 0;
  line(padLeft + 2, padY + 3, padRight - 2, padY + 3, '#d5855440');
  for (const x of [padLeft, padRight]) {
    line(x, padY, x, padY - 16, '#97ab83aa');
    path([[x, padY - 16], [x + 8, padY - 13], [x, padY - 10]], true);
    ctx.fillStyle = index === 1 ? '#ba9069' : '#d88d61'; ctx.fill();
    ctx.fillStyle = '#ffc598'; ctx.fillRect(x - 1, padY - 1, 2, 2);
  }
  ctx.font = '5px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
  ctx.fillStyle = '#b1b89888'; ctx.fillText('L A N D I N G   Z O N E', padCenter, padY + 15);
  ctx.fillStyle = '#a0ac8244'; ctx.fillText('—  0 1  —', padCenter, padY + 25);
  line(padCenter, padY - 5, padCenter, 100, '#becba110', [2, 5]);

  if (!flight) return;
  const n = Math.min(Math.floor(step), flight.frames.length - 1);
  const frame = flight.frames[n];
  const next = flight.frames[Math.min(n + 1, flight.frames.length - 1)];
  const t = step >= flight.steps ? 0 : step % 1;
  const lerp = (a, b) => a + (b - a) * t;
  const position = frame.position.map((v, i) => lerp(v, next.position[i]));
  const [rx, ry] = project(position);
  for (const push of flight.interventions || []) {
    if (push.step > n) continue;
    const [x, y] = project(flight.frames[push.step].position);
    ctx.font = '13px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffb484';
    ctx.fillText(push.direction < 0 ? '←' : '→', x, y - 14);
  }
  // Actual recorded path.
  if (n > 1) {
    path(flight.frames.slice(0, n + 1).filter((_, i) => i % 3 === 0).map((f) => project(f.position)));
    ctx.strokeStyle = index === 1 ? '#cd9b6866' : '#b5c8aa66'; ctx.lineWidth = .9;
    ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i <= n; i += 35) {
      const [x, y] = project(flight.frames[i].position);
      ctx.fillStyle = '#d5e4be66'; ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  const complete = step >= flight.steps;
  const crashed = complete && flight.outcome === 'crashed';
  // Height guide follows the actual craft.
  if (rx > 18 && rx < w - 18 && ry > 70 && ry < padY - 25) {
    line(rx + 18, ry, rx + 18, padY, '#afc49922', [2, 4]);
    line(rx + 15, ry, rx + 21, ry, '#afc49955');
    ctx.font = '5px "IBM Plex Mono", monospace'; ctx.fillStyle = '#c1d2af88'; ctx.textAlign = 'left';
    ctx.fillText(`${Math.max(0, position[1] - world.pad[2]).toFixed(1)} u`, rx + 23, (ry + padY) / 2);
  }
  // Thruster glow is driven by the recorded discrete engine action.
  ctx.save(); ctx.translate(rx, ry); ctx.rotate(-lerp(frame.angle, next.angle));
  if (!complete) {
    if (frame.action === 2) {
      const flicker = .85 + randomAt(n * 4.3) * .4;
      const flameLength = scale * 1.4 * flicker;
      const glow = ctx.createRadialGradient(0, scale * .7, 0, 0, scale * .7, scale * 1.6);
      glow.addColorStop(0, '#ff7b3844'); glow.addColorStop(1, '#ff7b3800');
      ctx.fillStyle = glow; ctx.fillRect(-scale * 2, 0, scale * 4, scale * 3);
      const fire = ctx.createLinearGradient(0, scale * .3, 0, flameLength + scale * .3);
      fire.addColorStop(0, '#fff7cc'); fire.addColorStop(.25, '#ffd694'); fire.addColorStop(.6, '#f88a46'); fire.addColorStop(1, '#f15c3500');
      path([[-scale * .21, scale * .32], [-scale * .14, scale * .7], [0, scale * .32 + flameLength],
        [scale * .15, scale * .7], [scale * .21, scale * .32]], true);
      ctx.fillStyle = fire; ctx.fill();
      path([[-scale * .09, scale * .32], [0, scale * .9], [scale * .09, scale * .32]], true);
      ctx.fillStyle = '#fff6c9'; ctx.fill();
    } else if (frame.action === 1 || frame.action === 3) {
      const side = frame.action === 1 ? -1 : 1;
      path([[side * scale * .45, -scale * .35], [side * scale * 1.05, -scale * .15],
        [side * scale * .45, -scale * .2]], true);
      ctx.fillStyle = '#ffca8a'; ctx.shadowColor = '#f15c35'; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0;
    }
  }
  ctx.restore();
  // Render the true Box2D fixture polygons, interpolated only between recorded frames.
  for (let i = 2; i >= 0; i--) {
    const points = frame.bodies[i].map((p, j) => project(p.map((v, k) => lerp(v, next.bodies[i][j][k]))));
    path(points, true);
    if (i === 0) {
      const bodyFill = ctx.createLinearGradient(rx - scale * .5, ry, rx + scale * .5, ry);
      bodyFill.addColorStop(0, crashed ? '#806650' : '#b4c1ae');
      bodyFill.addColorStop(.45, crashed ? '#c2865b' : '#eff2df'); bodyFill.addColorStop(1, '#899986');
      ctx.fillStyle = bodyFill; ctx.strokeStyle = '#f3e7c1'; ctx.lineWidth = .8;
    } else { ctx.fillStyle = '#819580'; ctx.strokeStyle = '#c9d2b8'; ctx.lineWidth = .65; }
    ctx.fill(); ctx.stroke();
  }
  // Fuselage details are cosmetic; the collision silhouette above is unmodified.
  ctx.save(); ctx.translate(rx, ry); ctx.rotate(-lerp(frame.angle, next.angle));
  ctx.fillStyle = index === 1 ? '#b38a65' : '#e77343'; ctx.fillRect(-scale * .4, scale * .04, scale * .8, scale * .14);
  ctx.fillStyle = '#213d47'; ctx.strokeStyle = '#748d86'; ctx.lineWidth = .6;
  ctx.beginPath(); ctx.ellipse(0, -scale * .22, scale * .16, scale * .14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c4e1db66'; ctx.fillRect(-scale * .07, -scale * .3, scale * .08, scale * .035);
  ctx.restore();
  // Contact light and terminal impact field.
  if (complete && flight.outcome === 'landed') {
    ctx.strokeStyle = '#bacba066'; ctx.lineWidth = .7;
    ctx.beginPath(); ctx.ellipse(rx, padY, scale * 1.5, scale * .2, 0, 0, Math.PI * 2); ctx.stroke();
  }
  if (crashed) {
    const glow = ctx.createRadialGradient(rx, ry, 0, rx, ry, scale * 1.8);
    glow.addColorStop(0, '#ed945536'); glow.addColorStop(1, '#ed945500');
    ctx.fillStyle = glow; ctx.fillRect(rx - scale * 2, ry - scale * 2, scale * 4, scale * 4);
  }
  if (complete && state.flights.length === 2) {
    ctx.font = '8px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = flight.outcome === 'landed' ? '#bfd8ad' : '#e1ad84';
    ctx.fillText(outcomes[flight.outcome], w / 2, 120);
  }
}

function draw() {
  if (!width || !height) return;
  ctx.clearRect(0, 0, width, height);
  if (state.flights.length === 2) {
    const w = width / 2;
    state.flights.forEach((flight, i) => {
      ctx.save(); ctx.beginPath(); ctx.rect(i * w, 0, w, height); ctx.clip(); ctx.translate(i * w, 0);
      drawScene(flight, w, height, state.step, i); ctx.restore();
    });
    line(w, 50, w, height - 35, '#b0c4b830');
    ctx.fillStyle = '#152228'; ctx.beginPath(); ctx.arc(w, height * .5, 13, 0, Math.PI * 2); ctx.fill();
    ctx.font = '6px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#a0af9d';
    ctx.fillText('VS', w, height * .5 + 2);
  } else drawScene(state.flights[0], width, height, state.step, 0);
}

function sparkline(id, values) {
  if (!values.length) return;
  const min = Math.min(...values), max = Math.max(...values);
  const points = values.map((value, i) => `${i ? 'L' : 'M'}${(i / Math.max(1, values.length - 1) * 180).toFixed(1)},${(22 - (value - min) / (max - min || 1) * 20).toFixed(1)}`);
  $(id).querySelector('path').setAttribute('d', points.join(' '));
}
function clock(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
function refreshTelemetry() {
  if (!state.flights.length) return;
  const flight = state.flights[0], index = Math.min(Math.floor(state.step), flight.steps);
  const frame = flight.frames[index];
  $('altitude').textContent = Math.max(0, frame.position[1] - flight.world.pad[2]).toFixed(2);
  $('velocity').textContent = `${frame.velocity[1] >= 0 ? '+' : ''}${frame.velocity[1].toFixed(2)}`;
  const angle = frame.angle * 180 / Math.PI;
  $('angle').textContent = angle.toFixed(1);
  $('attitude-needle').style.transform = `rotate(${-angle}deg)`;
  $('reward').textContent = `${frame.reward >= 0 ? '+' : ''}${frame.reward.toFixed(1)}`;
  $('reward').style.color = frame.reward >= 0 ? 'var(--green)' : 'var(--orange)';
  document.querySelectorAll('[data-action]').forEach((el) => el.classList.toggle('active', Number(el.dataset.action) === frame.action));
  $('action-name').textContent = index === flight.steps ? 'POLICY / EPISODE COMPLETE' : actions[frame.action];
  $('left-contact').classList.toggle('contact', frame.contacts[0]);
  $('right-contact').classList.toggle('contact', frame.contacts[1]);
  const recent = flight.frames.slice(Math.max(0, index - 150), index + 1).filter((_, i) => i % 3 === 0);
  sparkline('altitude-chart', recent.map((f) => f.position[1]));
  sparkline('velocity-chart', recent.map((f) => f.velocity[1]));
  $('view-time').textContent = `T+${(state.step / flight.fps).toFixed(2).padStart(5, '0')}`;
  $('frame-counter').textContent = `FRAME ${String(Math.floor(state.step)).padStart(4, '0')}`;
  $('playback-time').innerHTML = `${clock(state.step / flight.fps)} <span>/ ${clock(state.maxSteps / flight.fps)}</span>`;
  $('timeline').value = Math.floor(state.step);
  updatePushControls();
  if (!state.busy && state.step < state.maxSteps) {
    const drift = frame.velocity[0];
    $('mission-message').textContent = frame.contacts.every(Boolean) ? 'Both legs in contact. Waiting for the craft to settle.' :
      frame.contacts.some(Boolean) ? 'One leg in contact. Still moving.' :
      `${Math.abs(drift).toFixed(2)} u/s ${drift < 0 ? 'left' : 'right'} · ${Math.abs(angle).toFixed(1)}° tilt · ${actions[frame.action].toLowerCase()}`;
  }
}

function updatePushControls() {
  const flight = state.flights[0];
  const disabled = state.busy || state.flights.length !== 1 || state.step >= state.maxSteps ||
    (flight?.interventions?.length || 0) >= 12;
  $('push-left').disabled = disabled; $('push-right').disabled = disabled;
}

async function pushCraft(direction) {
  if ($('push-left').disabled) return;
  const flight = state.flights[0], step = Math.floor(state.step);
  // Scrubbing back and pushing creates a new branch, dropping future pushes.
  const interventions = (flight.interventions || []).filter((p) => p.step < step);
  interventions.push({ step, direction });
  const wasPlaying = state.playing;
  state.busy = true; setPlaying(false); updatePushControls();
  $('launch').disabled = true; $('error-banner').hidden = true;
  $('loading-label').textContent = 'RECOMPUTING AFTER YOUR PUSH';
  $('loading-overlay').hidden = false;
  try {
    const query = new URLSearchParams({ policy: flight.policy, seed: flight.seed,
      interventions: JSON.stringify(interventions) });
    const changed = await request(`/api/flight?${query}`);
    state.flights = [changed]; state.maxSteps = changed.steps;
    state.logged = false;
    $('timeline').max = changed.steps;
    $('result-banner').hidden = true;
    $('intervention-note').textContent = `Pushed ${direction < 0 ? 'left' : 'right'} at ${(step / flight.fps).toFixed(2)}s · ${interventions.length}/12 pushes`;
    setPlaying(wasPlaying); refreshTelemetry();
  } catch (error) { showError(error.message || 'Could not recompute this flight. Try again.'); setPlaying(wasPlaying); }
  finally {
    state.busy = false; $('loading-overlay').hidden = true; $('launch').disabled = false;
    updatePushControls();
  }
}

function showError(message) {
  $('error-message').textContent = message; $('error-banner').hidden = false;
  $('mission-message').textContent = 'Mission held. Check the message below the flight deck.';
}
async function request(url) {
  const response = await fetch(url);
  let data;
  try { data = await response.json(); } catch { throw new Error('Unexpected server response. Restart rocket demo and try again.'); }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
function setPolicy(policy) {
  if (state.busy || !state.status?.policies[policy]) return;
  state.policy = policy;
  document.querySelectorAll('[data-policy]').forEach((button) => {
    const selected = button.dataset.policy === policy;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
}
function setMode(mode) {
  if (state.busy) return;
  state.mode = mode;
  document.querySelectorAll('[data-mode]').forEach((button) => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  if (mode === 'compare' && state.policy === 'random') {
    setPolicy(state.status?.policies.trained ? 'trained' : 'best');
  }
  $('launch-text').textContent = mode === 'compare' ? 'Launch showdown' : 'Launch flight';
  $('launch-hint').textContent = mode === 'compare' ? 'Selected pilot vs. random. Identical seed.' : 'Push it during flight. See how it responds.';
  if (state.flights.length) $('mission-message').textContent = 'Flight plan updated. Launch to apply the new configuration.';
}
function setPlaying(playing) {
  state.playing = playing;
  $('play-pause').textContent = playing ? 'Ⅱ' : '▶';
  $('play-pause').setAttribute('aria-label', playing ? 'Pause playback' : 'Play playback');
  const complete = state.flights.length && state.step >= state.maxSteps;
  $('flight-state').textContent = complete ? 'MISSION COMPLETE' : playing ? 'FLIGHT PLAYBACK' : state.flights.length ? 'PLAYBACK PAUSED' : 'SYSTEM READY';
  document.querySelector('.live-chip').classList.toggle('running', playing);
}
function presentFlights(flights, record = true) {
  state.flights = flights; state.step = 0; state.maxSteps = Math.max(...flights.map((f) => f.steps));
  state.logged = !record;
  $('intervention-note').textContent = flights.length === 2 ? 'Switch to Single flight to push the craft.' :
    flights[0].interventions?.length ? `${flights[0].interventions.length} recorded pushes · replay includes their effects.` : 'Push adds 1.5 u/s sideways. Can the pilot recover?';
  $('view-empty').hidden = true; $('result-banner').hidden = true;
  $('canvas-pilot').textContent = flights[0].policy === 'random' ? 'RND / PURE CHAOS' : flights[0].policy === 'best' ? 'PPO / BEST CHECKPOINT' : 'PPO / TRAINED PILOT';
  $('canvas-random').hidden = flights.length !== 2;
  $('space-view').classList.toggle('compare', flights.length === 2);
  $('view-seed').textContent = `LUNAR SURFACE / SEED ${flights[0].seed}`;
  $('timeline').max = state.maxSteps; $('timeline').disabled = false;
  $('play-pause').disabled = false; $('restart').disabled = false;
  const steps = flights[0].model_steps;
  $('mission-message').textContent = flights.length === 2 ? 'Same physics. Same seed. Two very different approaches.' :
    steps ? `Policy loaded · ${steps.toLocaleString()} training steps · weights stay fixed during flight.` : 'Random controller loaded. Each action comes from the seeded random generator.';
  setPlaying(true); refreshTelemetry();
}

async function launch() {
  if (state.busy || !state.status) return;
  const seedInput = $('seed');
  if ($('fresh-start').checked) seedInput.value = crypto.getRandomValues(new Uint32Array(1))[0];
  if (!seedInput.checkValidity() || seedInput.value.trim() === '') {
    showError('Choose a whole-number seed between 0 and 4294967295.'); seedInput.focus(); return;
  }
  if (state.mode === 'compare' && state.policy === 'random') {
    showError('Head to head needs a trained model. Use Single flight for the random controller.'); return;
  }
  state.busy = true; setPlaying(false); $('error-banner').hidden = true;
  updatePushControls(); $('loading-label').textContent = 'RUNNING SIMULATION';
  $('loading-overlay').hidden = false; $('launch').disabled = true;
  document.querySelectorAll('[data-policy], [data-mode]').forEach((button) => { button.disabled = true; });
  const seed = Number(seedInput.value);
  try {
    const policies = state.mode === 'compare' ? [state.policy, 'random'] : [state.policy];
    const flights = await Promise.all(policies.map((policy) => request(`/api/flight?policy=${policy}&seed=${seed}`)));
    presentFlights(flights);
  } catch (error) { showError(error.message || 'Unable to reach mission control. Is rocket demo still running?'); }
  finally {
    state.busy = false; $('loading-overlay').hidden = true; $('launch').disabled = false;
    document.querySelectorAll('[data-mode]').forEach((button) => { button.disabled = false; });
    document.querySelectorAll('[data-policy]').forEach((button) => { button.disabled = !state.status.policies[button.dataset.policy]; });
    updatePushControls();
  }
}
function finish() {
  setPlaying(false);
  const flight = state.flights[0], success = flight.outcome === 'landed';
  $('result-banner').hidden = false; $('result-banner').classList.toggle('failed', !success);
  $('result-icon').textContent = success ? '↗' : '↘';
  $('result-kicker').textContent = state.flights.length === 2 ? 'SAME START. DIFFERENT STORY.' : 'MISSION COMPLETE';
  $('result-title').textContent = success ? 'Craft settled. Landing confirmed.' : flight.outcome === 'timeout' ? 'Time limit reached.' : flight.outcome === 'out_of_bounds' ? 'Craft left the flight area.' : 'Hull impact. Flight ended.';
  $('result-detail').textContent = state.flights.length === 2 ?
    `${names[flight.policy]}: ${outcomes[flight.outcome]} / Random: ${outcomes[state.flights[1].outcome]}` :
    `${flight.reward.toFixed(1)} REWARD / ${(flight.steps / flight.fps).toFixed(2)}s / ${(flight.interventions || []).length} PUSH${flight.interventions?.length === 1 ? '' : 'ES'} / SEED ${flight.seed}`;
  if (!state.logged) {
    state.flights.forEach((f) => state.history.unshift({ flight: f, number: state.history.length + 1 }));
    state.logged = true; renderLog();
  }
  $('mission-message').textContent = success ? 'Safe rest confirmed by simulator. Reward alone never counts as a landing.' :
    `Flight ended: ${outcomes[flight.outcome].toLowerCase()}. Change the seed or try another pilot.`;
  updatePushControls();
}
function replay() {
  if (!state.flights.length || state.busy) return;
  state.step = 0; $('result-banner').hidden = true; setPlaying(true); refreshTelemetry();
}
function togglePlayback() {
  if (!state.flights.length || state.busy) return;
  if (state.step >= state.maxSteps) replay(); else setPlaying(!state.playing);
}
function renderLog() {
  $('log-count').textContent = `${String(state.history.length).padStart(2, '0')} FLIGHTS THIS SESSION`;
  const tbody = $('flight-log'); tbody.replaceChildren();
  state.history.forEach(({ flight, number }) => {
    const tr = document.createElement('tr');
    for (const text of [`FL—${String(number).padStart(3, '0')}`, names[flight.policy], `#${flight.seed}${flight.interventions?.length ? ` · ${flight.interventions.length} push${flight.interventions.length === 1 ? '' : 'es'}` : ''}`,
      `${flight.reward >= 0 ? '+' : ''}${flight.reward.toFixed(1)}`, `${(flight.steps / flight.fps).toFixed(2)}s`]) {
      const td = document.createElement('td'); td.textContent = text; tr.append(td);
    }
    const outcome = document.createElement('td'), chip = document.createElement('span');
    chip.className = `outcome-chip${flight.outcome === 'landed' ? '' : ' failed'}`;
    chip.textContent = outcomes[flight.outcome]; outcome.append(chip); tr.append(outcome);
    const cell = document.createElement('td'), button = document.createElement('button');
    button.className = 'table-replay'; button.textContent = '↗'; button.setAttribute('aria-label', `Replay flight ${number}`);
    button.addEventListener('click', () => {
      if (state.busy) return;
      setMode('solo'); setPolicy(flight.policy); $('seed').value = flight.seed;
      $('fresh-start').checked = false;
      presentFlights([flight], false); $('flight-deck').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    cell.append(button); tr.append(cell); tbody.append(tr);
  });
}

function renderBenchmarks(benchmarks) {
  const trained = benchmarks.trained, random = benchmarks.random;
  if (trained) {
    $('trained-fraction').textContent = `${trained.outcomes.landed} / ${trained.episodes}`;
    $('trained-bar').style.width = `${trained.landing_rate * 100}%`;
    $('landing-rate').innerHTML = `${Math.round(trained.landing_rate * 100)}<span>%</span>`;
    $('mean-reward').textContent = `${trained.mean_reward >= 0 ? '+' : ''}${trained.mean_reward.toFixed(1)}`;
    $('benchmark-note').textContent = `Recorded experiment. ${trained.episodes} flights. Seeds ${trained.seed}–${trained.seed + trained.episodes - 1}. One training seed.`;
  } else $('benchmark-note').textContent = 'No local evaluation report. Run the README evaluation commands to populate these results.';
  if (random) {
    $('random-fraction').textContent = `${random.outcomes.landed} / ${random.episodes}`;
    $('random-bar').style.width = `${random.landing_rate * 100}%`;
  }
}

document.querySelectorAll('[data-policy]').forEach((button) => button.addEventListener('click', () => {
  if (state.mode === 'compare' && button.dataset.policy === 'random') setMode('solo');
  setPolicy(button.dataset.policy);
}));
document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('[data-seed]').forEach((button) => button.addEventListener('click', () => { $('seed').value = button.dataset.seed; }));
$('shuffle').addEventListener('click', () => { $('seed').value = crypto.getRandomValues(new Uint32Array(1))[0]; $('fresh-start').checked = false; });
$('seed').addEventListener('input', () => { $('fresh-start').checked = false; });
$('push-left').addEventListener('click', () => pushCraft(-1));
$('push-right').addEventListener('click', () => pushCraft(1));
$('launch').addEventListener('click', launch); $('first-launch').addEventListener('click', launch);
$('play-pause').addEventListener('click', togglePlayback); $('restart').addEventListener('click', replay);
$('replay-result').addEventListener('click', replay);
$('dismiss-error').addEventListener('click', () => { $('error-banner').hidden = true; });
$('timeline').addEventListener('input', () => {
  if (state.busy) return;
  state.step = Number($('timeline').value); setPlaying(false); $('result-banner').hidden = true;
  refreshTelemetry(); if (state.step >= state.maxSteps) finish();
});
$('speed').addEventListener('click', () => {
  const speeds = [.5, 1, 2, 4]; state.speed = speeds[(speeds.indexOf(state.speed) + 1) % speeds.length];
  $('speed').textContent = `${state.speed}×`; $('speed').setAttribute('aria-label', `Playback speed: ${state.speed} times`);
});
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if ($('space-view').requestFullscreen) await $('space-view').requestFullscreen();
    else showError('Fullscreen is unavailable in this browser.');
  } catch { showError('Fullscreen could not start. Try opening the demo directly in your browser.'); }
});
$('compare-link').addEventListener('click', () => setMode('compare'));
document.addEventListener('keydown', (event) => {
  const editing = /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(event.target.tagName);
  if (event.code === 'Space' && !editing) { event.preventDefault(); togglePlayback(); }
  if (event.code === 'Enter' && (!editing || event.target === $('seed'))) { event.preventDefault(); launch(); }
  if (!editing && !event.repeat && (event.code === 'KeyA' || event.code === 'KeyD')) {
    event.preventDefault(); pushCraft(event.code === 'KeyA' ? -1 : 1);
  }
});
document.addEventListener('visibilitychange', () => { state.lastTime = 0; });

let lastUiFrame = -1;
function animate(now) {
  const elapsed = state.lastTime ? Math.min((now - state.lastTime) / 1000, .1) : 0;
  state.lastTime = now;
  if (state.playing && !document.hidden && state.flights.length) {
    state.step = Math.min(state.maxSteps, state.step + elapsed * state.flights[0].fps * state.speed);
    if (state.step >= state.maxSteps) finish();
  }
  if (Math.floor(state.step) !== lastUiFrame) { refreshTelemetry(); lastUiFrame = Math.floor(state.step); }
  draw(); requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

async function init() {
  $('launch').disabled = true; $('first-launch').disabled = true;
  try {
    state.status = await request('/api/status');
    $('connection-label').textContent = 'SIMULATOR ONLINE';
    document.querySelectorAll('[data-policy]').forEach((button) => {
      button.disabled = !state.status.policies[button.dataset.policy];
      if (button.disabled) button.title = 'Model not found. Train a model or pass its path to rocket demo.';
    });
    if (!state.status.policies.trained) {
      setPolicy(state.status.policies.best ? 'best' : 'random');
      $('mission-message').textContent = 'Trained model not found. Random flights are ready; use --model to connect a trained policy.';
    }
    renderBenchmarks(state.status.benchmarks);
    $('launch').disabled = false; $('first-launch').disabled = false;
  } catch (error) {
    $('connection-label').textContent = 'SIMULATOR OFFLINE'; $('connection-dot').style.background = 'var(--orange)';
    showError(`Cannot reach the local simulator. Start it with uv run rocket demo. ${error.message}`);
  }
}
init();
