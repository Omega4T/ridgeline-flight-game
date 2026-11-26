// Ridgeline — the valley. One job: build the heightmap and answer questions
// about it (height, colour, runway, rings, town, river). Seeded, so the
// world is identical on every load.
const WORLD_SEED = 20261126;

function buildHeightmap() {
  const cfg = GAME_CONFIG.world;
  const fbm = makeFbm(WORLD_SEED);
  const grid = cfg.grid, size = cfg.size;
  const h = new Float32Array((grid + 1) * (grid + 1));
  const distToSegment = (px, pz, x0, z0, x1, z1) => {
    const dx = x1 - x0, dz = z1 - z0;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((px - x0) * dx + (pz - z0) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = x0 + dx * t, cz = z0 + dz * t;
    return Math.hypot(px - cx, pz - cz);
  };
  for (let gz = 0; gz <= grid; gz++) {
    for (let gx = 0; gx <= grid; gx++) {
      const x = (gx / grid) * size, z = (gz / grid) * size;
      // Rolling base terrain.
      let height = 18 + fbm(x, z) * 70;
      // Northern mountain wall.
      const ridgeD = Math.max(0, 1 - z / 420);
      height += ridgeD * ridgeD * cfg.ridge.height;
      // Merapi cone with a crater dip.
      const vd = Math.hypot(x - cfg.volcano.x, z - cfg.volcano.z);
      const cone = Math.max(0, 1 - vd / cfg.volcano.radius);
      height += cone * cone * cfg.volcano.height;
      if (vd < 55) height -= (1 - vd / 55) * 45;
      // River valley carve, volcano down to the south coast.
      const riverD = distToSegment(x, z, cfg.river.x0, cfg.river.z0, cfg.river.x1, cfg.river.z1);
      const carve = Math.max(0, 1 - riverD / 150);
      height = height * (1 - carve * 0.55) + 4 * carve;
      // Sea to the south.
      if (z > cfg.coast.z) height = Math.min(height, 2 + (z - cfg.coast.z) * 0.002);
      // Flatten the airfield apron.
      const ad = Math.hypot(x - cfg.airfield.x, z - cfg.airfield.z);
      if (ad < 320) {
        const t = Math.max(0, 1 - ad / 320);
        height = height * (1 - t) + cfg.airfield.flat * t;
      }
      h[gz * (grid + 1) + gx] = height;
    }
  }
  return h;
}

let _heightmap = null;
let _slopegrid = null;
function getHeightmap() {
  if (!_heightmap) _heightmap = buildHeightmap();
  return _heightmap;
}

// Slope magnitude per grid cell, precomputed once so the per-frame renderer
// never pays for finite differences.
function getSlopegrid() {
  if (_slopegrid) return _slopegrid;
  const cfg = GAME_CONFIG.world, map = getHeightmap();
  const w = cfg.grid + 1, step = cfg.size / cfg.grid;
  _slopegrid = new Float32Array(w * w);
  for (let gz = 0; gz <= cfg.grid; gz++) {
    for (let gx = 0; gx <= cfg.grid; gx++) {
      const xm = map[gz * w + Math.max(0, gx - 1)], xp = map[gz * w + Math.min(cfg.grid, gx + 1)];
      const zm = map[Math.max(0, gz - 1) * w + gx], zp = map[Math.min(cfg.grid, gz + 1) * w + gx];
      _slopegrid[gz * w + gx] = Math.hypot((xp - xm) / (2 * step), (zp - zm) / (2 * step));
    }
  }
  return _slopegrid;
}

// Bilinear height at world (x, z). Outside the world, clamp to the edge.
function heightAt(x, z) {
  const cfg = GAME_CONFIG.world, map = getHeightmap();
  const gx = Math.max(0, Math.min(cfg.grid - 0.001, (x / cfg.size) * cfg.grid));
  const gz = Math.max(0, Math.min(cfg.grid - 0.001, (z / cfg.size) * cfg.grid));
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  const fx = gx - x0, fz = gz - z0, w = cfg.grid + 1;
  const a = map[z0 * w + x0], b = map[z0 * w + x0 + 1];
  const c = map[(z0 + 1) * w + x0], d = map[(z0 + 1) * w + x0 + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// Slope (for shading): bilinear read of the precomputed slope grid.
function slopeAt(x, z) {
  const cfg = GAME_CONFIG.world, grid = getSlopegrid();
  const gx = Math.max(0, Math.min(cfg.grid - 0.001, (x / cfg.size) * cfg.grid));
  const gz = Math.max(0, Math.min(cfg.grid - 0.001, (z / cfg.size) * cfg.grid));
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  const fx = gx - x0, fz = gz - z0, w = cfg.grid + 1;
  const a = grid[z0 * w + x0], b = grid[z0 * w + x0 + 1];
  const c = grid[(z0 + 1) * w + x0], d = grid[(z0 + 1) * w + x0 + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

function inRunway(x, z) {
  const r = GAME_CONFIG.world.runway;
  return Math.abs(x - r.x) <= r.length / 2 && Math.abs(z - r.z) <= r.width / 2;
}
function inTown(x, z) {
  const t = GAME_CONFIG.world.town;
  return Math.abs(x - t.x) <= t.w / 2 && Math.abs(z - t.z) <= t.d / 2;
}
function inRiver(x, z) {
  const r = GAME_CONFIG.world.river;
  const dx = r.x1 - r.x0, dz = r.z1 - r.z0;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((x - r.x0) * dx + (z - r.z0) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (r.x0 + dx * t), z - (r.z0 + dz * t)) < r.width / 2;
}

// Colour of the ground at (x, z) with height h. Returns a shared [r,g,b]
// array — callers must not mutate it. Colours are parsed once at load.
const _hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const _COL = (() => {
  const C = GAME_CONFIG.colors, out = {};
  for (const k of Object.keys(C)) out[k] = _hex(C[k]);
  out.terraceWall = [74, 122, 61];
  return out;
})();
function terrainColor(x, z, h) {
  const C = _COL;
  // Runway asphalt with centreline dashes and threshold bars.
  if (inRunway(x, z)) {
    const r = GAME_CONFIG.world.runway;
    const along = x - (r.x - r.length / 2);   // 0..length along the runway
    const across = Math.abs(z - r.z);
    if (across < 1.2 && Math.floor(along / 14) % 2 === 0) return C.marking;
    if ((along < 18 || along > r.length - 18) && across < r.width / 2 - 3) return C.marking;
    return C.asphalt;
  }
  if (h < GAME_CONFIG.world.seaLevel || (inRiver(x, z) && h < 14)) {
    return h < 3 ? C.waterDeep : C.water;
  }
  if (inTown(x, z)) {
    // Blocky rooftops: hash the 24-unit block the point falls in.
    const bx = Math.floor(x / 24), bz = Math.floor(z / 24);
    const hash = ((bx * 73856093) ^ (bz * 19349663)) >>> 0;
    if (hash % 5 === 0) return C.townRoof;
    return C.town;
  }
  // Terraced rice fields on the gentle slopes: stepped green bands.
  const slope = slopeAt(x, z);
  if (h < 95 && slope < 0.45) {
    const band = Math.floor(h / 7) % 2 === 0 ? C.terrace : C.field;
    // Terrace walls: thin darker lines every 7 units of height.
    if (Math.abs(h % 7) < 0.45) return C.terraceWall;
    return band;
  }
  if (h < 40) return C.fieldDry;
  if (h < 95) return C.field;
  if (h < 140) return C.forest;
  if (h < 185) return C.rock;
  return C.snow;
}

// Ring / gate world positions for a mission, with live status.
function missionRings(missionIdx) {
  return GAME_CONFIG.missions[missionIdx].rings.map((p, i) => ({
    index: i, x: p[0], y: p[1], z: p[2],
    radius: GAME_CONFIG.missions[missionIdx].ringRadius,
  }));
}
