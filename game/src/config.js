// Ridgeline: Merapi Ridge Run — game tuning, world layout and mission data.
// One job: every number the rest of the game reads. Nothing here runs logic.
const GAME_CONFIG = {
  world: {
    size: 2048,          // world is size x size units, origin at (0,0)
    grid: 256,           // heightmap resolution
    seaLevel: 6,         // below this is water
    volcano: { x: 1520, z: 560, height: 185, radius: 300 },
    ridge: { z: 120, height: 120 },          // mountain wall along the north edge
    coast: { z: 1780 },                       // sea starts south of this
    airfield: { x: 420, z: 1420, flat: 12 },  // flattened apron height
    runway: { x: 420, z: 1420, length: 320, width: 26, headingDeg: 90 },
    town: { x: 900, z: 1300, w: 260, d: 200 },
    river: { x0: 1520, z0: 700, x1: 700, z1: 1780, width: 26 },
  },
  aircraft: {
    name: 'Kestrel K-9',
    minSpeedKt: 55, maxSpeedKt: 240, cruiseKt: 150,
    climbRate: 38,            // units of altitude per second at full climb
    rollRateDeg: 95,          // deg per second of bank change
    pitchRateDeg: 42,
    turnFactor: 0.9,          // bank-to-turn authority
    stallKt: 68,
    fuelCapacity: 100,
    fuelBurnIdle: 0.10,       // per second at throttle 0
    fuelBurnFull: 0.85,       // per second at throttle 1
    maxDamage: 100,
  },
  camera: {
    distance: 20, height: 7, fovDeg: 74, nearDist: 6, farDist: 520,
    renderWidth: 640, renderHeight: 360,
  },
  missions: [
    {
      id: 'ring-run', name: 'RING RUN',
      brief: 'Fly the valley course: 8 gold rings, in order. +100 per ring, +time bonus.',
      ringRadius: 26, pointsPerRing: 100,
      rings: [
        [420, 90, 1180], [640, 110, 1000], [880, 130, 880], [1120, 150, 760],
        [1330, 170, 700], [1420, 150, 950], [1200, 120, 1150], [900, 90, 1330],
      ],
    },
    {
      id: 'ridge-rescue', name: 'RIDGE RESCUE',
      brief: 'Low-level valley run: 6 gates hugging the terrain. Stay under 300 ft AGL for +50 each.',
      ringRadius: 24, pointsPerRing: 100, lowBonus: 50, lowCeilingFt: 300,
      rings: [
        [980, 80, 1150], [1150, 95, 1000], [1300, 110, 900], [1380, 125, 1050],
        [1250, 100, 1250], [1050, 85, 1380],
      ],
    },
    {
      id: 'runway-landing', name: 'RUNWAY LANDING',
      brief: 'Land on runway 09: gear down, under 120 kt, gentle descent, inside the touchdown zone.',
      ringRadius: 30, pointsPerRing: 0,
      rings: [[740, 60, 1420]],   // final approach gate, 320 units out on runway heading
      landing: { maxSpeedKt: 120, maxVsFpm: 500, zoneStart: 300, zoneEnd: 620 },
    },
  ],
  scoring: { timeBonusPerSecond: 2, lowBonus: 50, landingBase: 400 },
  colors: {
    skyTop: '#2e6db4', skyMid: '#7fb2e0', skyLow: '#f2c98a',
    sun: '#fff3c4', fog: '#cfe0ee',
    field: '#5d9b4a', fieldDry: '#8aa653', terrace: '#6fae56',
    forest: '#2f6b34', rock: '#8a7a63', snow: '#f4f7f9',
    water: '#2f6fb4', waterDeep: '#1e4f8a', town: '#9a938a', townRoof: '#b0563a',
    asphalt: '#3c3f45', marking: '#f5f2e8', ringGold: '#ffc93c', ringNext: '#c8ccd2',
  },
};
