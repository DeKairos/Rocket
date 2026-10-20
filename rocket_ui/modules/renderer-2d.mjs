// Retained Canvas renderer of the recorded Box2D fixtures.
export function create2DRenderer(canvas) {
const outcomes={landed:'Landing confirmed.',crashed:'Hull impact.',timeout:'Time limit reached.',out_of_bounds:'Craft left the flight area.'};
const ctx=canvas.getContext('2d');
let width=0,height=0;
const state={flights:[],step:0};
function resize() {
  const bounds = canvas.parentElement.getBoundingClientRect();
  width = bounds.width; height = bounds.height;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}


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
  // Leave the lower third clear for the floating playback instruments.
  const floor = h * .62 + world.pad[2] * scale;
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


return {setFlights(flights){state.flights=flights;},render(step){state.step=step;draw();},resize,dispose(){}};
}
