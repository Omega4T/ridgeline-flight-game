// Ridgeline — main loop and screens. One job: own the game state machine
// (title / briefing / flying / paused / landed / crashed / debrief) and
// drive one frame per animation tick. Shot mode (?shot=name) renders one
// deterministic frame and stops, for the screenshots.
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const off = document.createElement('canvas');
off.width = RW; off.height = RH;
const offCtx = off.getContext('2d');

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const audio = new AudioEngine();
const input = new InputState(canvas);

const Game = {
  screen: 'title',        // title | briefing | flying | paused | debrief
  missionIdx: 0,
  flight: null,
  mission: null,
  timeOfDay: 0.42,
  viewMode: 'chase',
  timeSec: 0,
  muted: false,
  lastTs: 0,
  flash: '',
  flashUntil: 0,
  stats: { bestScore: 0, sorties: 0 },
};

function startMission(idx) {
  Game.missionIdx = idx;
  Game.flight = newFlightState(idx);
  Game.mission = newMissionState(idx);
  Game.screen = 'flying';
  Game.timeSec = 0;
  Game.viewMode = 'chase';
  Game.stats.sorties++;
  audio.ensure();
}

function titlePose() {
  // A slow scenic orbit for the title screen backdrop.
  const t = Game.timeSec;
  return {
    st: Object.assign(newFlightState(0), {
      x: 1000 + Math.sin(t * 0.05) * 350, y: 190, z: 1100 + Math.cos(t * 0.05) * 250,
      headingDeg: (t * 4) % 360, pitchDeg: 0, rollDeg: Math.sin(t * 0.3) * 8,
      speedKt: 150, throttle: 0.6, fuel: 90, damage: 0,
    }),
    mission: newMissionState(0),
  };
}

function drawTitle(W, H) {
  const pose = titlePose();
  pose.st.elapsedSec = Game.timeSec;
  pose.mission.message = '';
  renderFrame(ctx, off, offCtx, W, H, pose.st, pose.mission, {
    timeOfDay: Game.timeOfDay, viewMode: 'chase', timeSec: Game.timeSec,
  });
  ctx.fillStyle = 'rgba(5,10,16,0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffc93c';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('RIDGELINE', W / 2, H * 0.30);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('MERAPI RIDGE RUN', W / 2, H * 0.30 + 40);
  ctx.fillStyle = '#cfe0ee';
  ctx.font = '18px sans-serif';
  ctx.fillText('Fly the valley. Thread the rings. Bring her home.', W / 2, H * 0.30 + 74);
  const items = ['1 — RING RUN', '2 — RIDGE RESCUE', '3 — RUNWAY LANDING'];
  ctx.font = 'bold 22px sans-serif';
  items.forEach((it, i) => {
    const y = H * 0.52 + i * 40;
    ctx.fillStyle = Game.missionIdx === i ? '#ffc93c' : '#ffffff';
    ctx.fillText(it, W / 2, y);
  });
  ctx.fillStyle = '#9fd8ff';
  ctx.font = '16px sans-serif';
  ctx.fillText('Arrows / WASD fly · Shift throttle · G gear · B brake · Click toggles cockpit cam', W / 2, H * 0.78);
  ctx.fillText('Press 1, 2 or 3 to fly a mission — or click a mission above', W / 2, H * 0.78 + 26);
  if (Game.stats.bestScore > 0) {
    ctx.fillStyle = '#ffc93c';
    ctx.fillText('BEST SCORE ' + Game.stats.bestScore + ' · SORTIES ' + Game.stats.sorties, W / 2, H * 0.78 + 56);
  }
}

function drawBriefing(W, H) {
  const def = GAME_CONFIG.missions[Game.missionIdx];
  ctx.fillStyle = '#0a1420';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffc93c';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText(def.name, W / 2, H * 0.28);
  ctx.fillStyle = '#ffffff';
  ctx.font = '20px sans-serif';
  const words = def.brief.split(' ');
  let line = '', y = H * 0.38;
  for (const w of words) {
    if ((line + ' ' + w).length > 62) { ctx.fillText(line.trim(), W / 2, y); y += 30; line = w; }
    else line += ' ' + w;
  }
  ctx.fillText(line.trim(), W / 2, y);
  ctx.fillStyle = '#9fd8ff';
  ctx.font = '17px sans-serif';
  ctx.fillText('Aircraft: Kestrel K-9 · Fuel 100 · Watch the throttle — full power drinks fuel', W / 2, y + 60);
  ctx.fillText('Terrain kills. Gear down and under 120 kt to land on runway 09.', W / 2, y + 88);
  ctx.fillStyle = '#ffc93c';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('Press ENTER to fly', W / 2, y + 150);
}

function drawDebrief(W, H) {
  const st = Game.flight, m = Game.mission;
  // Dusk vista behind the panel.
  const pose = { st: Object.assign({}, st, { rollDeg: 0, pitchDeg: 0 }), mission: m };
  renderFrame(ctx, off, offCtx, W, H, pose.st, pose.mission, {
    timeOfDay: 0.95, viewMode: 'chase', timeSec: Game.timeSec,
  });
  ctx.fillStyle = 'rgba(5,10,16,0.82)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  const title = m.finishReason === 'crashed' ? 'SORTIE LOST' :
    m.finishReason === 'landed' ? 'WHEELS DOWN — LANDED' : 'COURSE CLEAR';
  ctx.fillStyle = m.finishReason === 'crashed' ? '#ff5a4e' : '#ffc93c';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(title, W / 2, H * 0.24);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('SCORE ' + m.score, W / 2, H * 0.24 + 52);
  const rows = [
    ['Mission', m.def.name],
    ['Rings', m.ringsCleared + ' / ' + m.rings.length],
    ['Low passes', String(m.lowBonuses)],
    ['Time', Math.floor(st.elapsedSec / 60) + ':' + String(Math.floor(st.elapsedSec % 60)).padStart(2, '0')],
    ['Distance', Math.round(st.distanceFlown / 1000 * 10) / 10 + ' km'],
    ['Fuel left', Math.round(st.fuel) + ' / 100'],
    ['Damage', Math.round(st.damage) + ' / 100'],
  ];
  ctx.font = '19px sans-serif';
  rows.forEach((r, i) => {
    const y = H * 0.40 + i * 32;
    ctx.fillStyle = '#9fd8ff'; ctx.textAlign = 'right';
    ctx.fillText(r[0], W / 2 - 20, y);
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left';
    ctx.fillText(r[1], W / 2 + 20, y);
  });
  ctx.fillStyle = '#ffc93c';
  ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Press R to fly again · T for title', W / 2, H * 0.40 + rows.length * 32 + 30);
}

function resize() {
  canvas.width = 1280; canvas.height = 720;
}
resize();

function frame(ts) {
  const W = canvas.width, H = canvas.height;
  const dt = Math.min(0.05, (ts - Game.lastTs) / 1000 || 0.016);
  Game.lastTs = ts;
  Game.timeSec += dt;
  Game.timeOfDay = 0.42 + Math.sin(Game.timeSec * 0.008) * 0.12;

  if (Game.screen === 'title') {
    drawTitle(W, H);
    if (input.consumeEdge('Digit1')) { Game.missionIdx = 0; Game.screen = 'briefing'; }
    if (input.consumeEdge('Digit2')) { Game.missionIdx = 1; Game.screen = 'briefing'; }
    if (input.consumeEdge('Digit3')) { Game.missionIdx = 2; Game.screen = 'briefing'; }
    if (input.consumeEdge('Enter')) Game.screen = 'briefing';
    requestAnimationFrame(frame);
    return;
  }
  if (Game.screen === 'briefing') {
    drawBriefing(W, H);
    if (input.consumeEdge('Enter') || input.consumeEdge('Space')) startMission(Game.missionIdx);
    if (input.consumeEdge('Escape')) Game.screen = 'title';
    requestAnimationFrame(frame);
    return;
  }
  if (Game.screen === 'debrief') {
    drawDebrief(W, H);
    if (input.consumeEdge('KeyR')) startMission(Game.missionIdx);
    if (input.consumeEdge('KeyT')) Game.screen = 'title';
    requestAnimationFrame(frame);
    return;
  }

  // Flying / paused.
  const ctl = input.read();
  if (input.consumeEdge('KeyP')) Game.screen = Game.screen === 'paused' ? 'flying' : 'paused';
  if (input.consumeEdge('KeyM')) Game.muted = !Game.muted;
  if (input.consumeEdge('KeyG')) Game.flight.gearDown = !Game.flight.gearDown;
  if (input.consumeEdge('KeyR')) { startMission(Game.missionIdx); requestAnimationFrame(frame); return; }
  if (input.camToggle) { Game.viewMode = Game.viewMode === 'chase' ? 'cockpit' : 'chase'; input.camToggle = false; }

  if (Game.screen === 'paused') {
    renderFrame(ctx, off, offCtx, W, H, Game.flight, Game.mission, {
      timeOfDay: Game.timeOfDay, viewMode: Game.viewMode, timeSec: Game.timeSec,
    });
    ctx.fillStyle = 'rgba(5,10,16,0.6)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 44px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('PAUSED', W / 2, H / 2);
    requestAnimationFrame(frame);
    return;
  }

  updateFlightModel(Game.flight, ctl, dt);
  const events = updateMission(Game.mission, Game.flight, dt);
  for (const ev of events) {
    Game.flash = ev.text; Game.flashUntil = Game.timeSec + 2.5;
    if (ev.type === 'ring') audio.playRingChime();
    if (ev.type === 'landed') audio.playLandingThud();
    if (ev.type === 'crashed') audio.playWarning();
  }
  if (Game.timeSec < Game.flashUntil) Game.mission.message = Game.flash;
  else if (Game.mission.message === Game.flash) Game.mission.message = '';
  audio.update(Game.flight.throttle, Game.flight.speedKt, Game.muted);
  renderFrame(ctx, off, offCtx, W, H, Game.flight, Game.mission, {
    timeOfDay: Game.timeOfDay, viewMode: Game.viewMode, timeSec: Game.timeSec,
  });
  if (Game.mission.finished) {
    Game.stats.bestScore = Math.max(Game.stats.bestScore, Game.mission.score);
    Game.screen = 'debrief';
  }
  requestAnimationFrame(frame);
}

function bootGame() {
  if (shotName) {
    // Deterministic single frame for screenshots.
    const pose = poseForShot(shotName);
    if (!pose) { document.title = 'bad-shot'; return; }
    getHeightmap();
    renderFrame(ctx, off, offCtx, canvas.width, canvas.height, pose.st, pose.mission, {
      timeOfDay: pose.timeOfDay, viewMode: pose.viewMode, timeSec: pose.timeSec,
    });
    if (shotName === 'debrief') {
      // Debrief panel over the vista.
      Game.flight = pose.st; Game.mission = pose.mission; Game.timeSec = pose.timeSec;
      drawDebrief(canvas.width, canvas.height);
    }
    document.title = 'shot-ready';
    return;
  }
  getHeightmap();
  requestAnimationFrame(frame);
}

bootGame();
window.__ridgeline = Game; // playtest handle: read state, never used by the game itself
