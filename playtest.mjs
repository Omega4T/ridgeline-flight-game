// Ridgeline — headless playtest. Boots the live game, flies mission 1 with
// keys, then uses the debug handle to prove ring detection, landing and
// crash paths. Run: node playtest.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const puppeteer = require('/home/hatch/workspace/chrome/node_modules/puppeteer-core');
const PORT = 18082;
const server = spawn('node', ['serve.ts'], {
  cwd: '/home/hatch/workspace/makefun/best-flight-game',
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((r) => setTimeout(r, 1200));
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  userDataDir: '/tmp/ridgeline-chrome-profile',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--window-size=1280,720'],
  env: { ...process.env, HOME: '/home/hatch/workspace/chrome/fakehome' },
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const state = () => page.evaluate(() => {
  const G = window.__ridgeline;
  if (!G) return null;
  if (!G.flight) return { screen: G.screen };
  return { screen: G.screen, x: Math.round(G.flight.x), y: Math.round(G.flight.y), z: Math.round(G.flight.z),
    hdg: Math.round(G.flight.headingDeg), spd: Math.round(G.flight.speedKt), fuel: Math.round(G.flight.fuel),
    score: G.mission.score, rings: G.mission.ringsCleared, crashed: G.flight.crashed, landed: G.flight.landed };
});

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 20000 });
await new Promise((r) => setTimeout(r, 800));
console.log('title:', JSON.stringify(await state()));
await page.keyboard.press('Digit1');
await new Promise((r) => setTimeout(r, 300));
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 500));
console.log('mission start:', JSON.stringify(await state()));
// Fly: throttle up + gentle climb for 6s.
await page.keyboard.down('ShiftLeft');
await page.keyboard.down('ArrowUp');
await new Promise((r) => setTimeout(r, 6000));
await page.keyboard.up('ArrowUp');
await page.keyboard.up('ShiftLeft');
console.log('after 6s climb:', JSON.stringify(await state()));
// Teleport onto ring 1 to prove detection.
await page.evaluate(() => {
  const G = window.__ridgeline;
  const r = G.mission.rings[0];
  G.flight.x = r.x; G.flight.y = r.y; G.flight.z = r.z;
});
await new Promise((r) => setTimeout(r, 500));
console.log('after ring 1 teleport:', JSON.stringify(await state()));
// Teleport onto the runway, gear down, slow, gentle: prove landing.
await page.evaluate(() => {
  const G = window.__ridgeline;
  G.flight.x = 420; G.flight.y = 13; G.flight.z = 1420;
  G.flight.speedKt = 100; G.flight.pitchDeg = -2; G.flight.verticalSpeedFpm = -200;
  G.flight.gearDown = true; G.flight.throttle = 0.2;
});
await new Promise((r) => setTimeout(r, 800));
console.log('after runway teleport:', JSON.stringify(await state()));
// Crash path: fresh mission, teleport into the volcano.
await page.keyboard.press('KeyR');
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => {
  const G = window.__ridgeline;
  G.flight.x = 1520; G.flight.y = 40; G.flight.z = 560;
});
await new Promise((r) => setTimeout(r, 800));
console.log('after volcano teleport:', JSON.stringify(await state()));
console.log('console errors:', JSON.stringify(errors));
await browser.close();
server.kill();
