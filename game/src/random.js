// Ridgeline — seeded randomness. One job: deterministic noise, no Math.random
// in world generation, so every run of the game builds the same valley.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise on a 2D lattice, deterministic per seed.
function makeValueNoise(seed, cell) {
  const rand = mulberry32(seed);
  const cols = 64, rows = 64;
  const lattice = new Float32Array((cols + 1) * (rows + 1));
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const smooth = (t) => t * t * (3 - 2 * t);
  return function (x, z) {
    const gx = x / cell, gz = z / cell;
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const fx = smooth(gx - x0), fz = smooth(gz - z0);
    const at = (ix, iz) => lattice[((iz % rows + rows) % rows) * (cols + 1) + ((ix % cols + cols) % cols)];
    const a = at(x0, z0), b = at(x0 + 1, z0), c = at(x0, z0 + 1), d = at(x0 + 1, z0 + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
}

// Fractal brownian motion: 4 octaves of value noise, 0..1.
function makeFbm(seed) {
  const octaves = [
    makeValueNoise(seed + 11, 420),
    makeValueNoise(seed + 23, 190),
    makeValueNoise(seed + 37, 85),
    makeValueNoise(seed + 51, 38),
  ];
  return function (x, z) {
    let v = 0, amp = 1, sum = 0;
    for (let i = 0; i < octaves.length; i++) {
      v += octaves[i](x, z) * amp; sum += amp; amp *= 0.5;
    }
    return v / sum;
  };
}
