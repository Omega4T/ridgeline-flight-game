// Ridgeline — flight model. One job: turn pilot inputs into aircraft motion,
// fuel burn, stall, damage and landing judgement. Arcade physics, tuned so
// throttle and bank discipline decide the score.
function newFlightState(missionIdx) {
  const starts = [
    { x: 420, y: 110, z: 1560, headingDeg: 180, speedKt: 150 }, // ring run: north up the valley (rings lie toward -z)
    { x: 820, y: 95, z: 1420, headingDeg: 150, speedKt: 140 }, // ridge rescue: low entry toward gate 1
    { x: 100, y: 130, z: 1420, headingDeg: 90, speedKt: 130 }, // landing: on final for rwy 09
  ];
  const s = starts[missionIdx] || starts[0];
  return {
    x: s.x, y: s.y, z: s.z,
    headingDeg: s.headingDeg, pitchDeg: 0, rollDeg: 0,
    speedKt: s.speedKt, throttle: 0.65, gearDown: missionIdx === 2,
    airbrake: false, fuel: GAME_CONFIG.aircraft.fuelCapacity,
    damage: 0, verticalSpeedFpm: 0, aglFt: 0,
    stalled: false, crashed: false, landed: false, landedScore: 0,
    elapsedSec: 0, distanceFlown: 0,
  };
}

// input: { pitch: -1..1 (up positive), roll: -1..1 (right positive),
//          throttleUp, throttleDown, airbrake, gearToggle }
function updateFlightModel(st, input, dt) {
  const A = GAME_CONFIG.aircraft;
  if (st.crashed || st.landed) return st;

  // Throttle.
  if (input.throttleUp) st.throttle = Math.min(1, st.throttle + dt * 0.5);
  if (input.throttleDown) st.throttle = Math.max(0, st.throttle - dt * 0.5);
  st.airbrake = !!input.airbrake;

  // Bank-to-turn: roll chases the stick, heading follows the bank.
  const targetRoll = input.roll * 62;
  st.rollDeg += (targetRoll - st.rollDeg) * Math.min(1, dt * 3.2);
  const turnRate = Math.tan(st.rollDeg * Math.PI / 180) * 9.81 /
    (st.speedKt * 0.514 * A.turnFactor + 1) * 57.2958;
  st.headingDeg = (st.headingDeg + turnRate * dt + 360) % 360;

  // Pitch chases the stick; stall drops the nose at low speed.
  st.stalled = st.speedKt < A.stallKt && st.pitchDeg > 2;
  const targetPitch = st.stalled ? -14 : input.pitch * 24;
  st.pitchDeg += (targetPitch - st.pitchDeg) * Math.min(1, dt * 2.6);

  // Speed: throttle pulls toward its target, drag and brake pull back.
  const targetSpeed = A.minSpeedKt + st.throttle * (A.maxSpeedKt - A.minSpeedKt)
    - (st.airbrake ? 55 : 0) - Math.max(0, st.pitchDeg) * 0.9;
  st.speedKt += (targetSpeed - st.speedKt) * Math.min(1, dt * 0.55);

  // Motion.
  const hdg = st.headingDeg * Math.PI / 180;
  const pitch = st.pitchDeg * Math.PI / 180;
  const ms = st.speedKt * 0.514;               // kt -> m/s, world unit ~ metre
  const prevY = st.y;
  st.x += Math.sin(hdg) * Math.cos(pitch) * ms * dt;
  st.z += Math.cos(hdg) * Math.cos(pitch) * ms * dt;
  st.y += Math.sin(pitch) * ms * dt;
  st.verticalSpeedFpm = ((st.y - prevY) / dt) * 196.85;
  st.distanceFlown += ms * dt;
  st.elapsedSec += dt;

  // Fuel: throttle is the main cost, hard manoeuvres add a little.
  const burn = A.fuelBurnIdle + st.throttle * (A.fuelBurnFull - A.fuelBurnIdle)
    + Math.abs(st.rollDeg) / 62 * 0.06;
  st.fuel = Math.max(0, st.fuel - burn * dt);
  if (st.fuel <= 0) st.throttle = Math.max(st.throttle - dt * 0.4, 0);

  // Stay inside the world: soft wall pushes the nose around.
  const M = 60, W = GAME_CONFIG.world.size - 60;
  if (st.x < M || st.x > W || st.z < M || st.z > W) {
    st.headingDeg = (st.headingDeg + 180 + 360) % 360;
    st.x = Math.max(M, Math.min(W, st.x));
    st.z = Math.max(M, Math.min(W, st.z));
  }

  // Ground contact.
  const ground = heightAt(st.x, st.z);
  st.aglFt = (st.y - ground) * 3.28084;
  if (st.y <= ground + 0.5) {
    const onRunway = inRunway(st.x, st.z);
    const gentle = Math.abs(st.verticalSpeedFpm) < GAME_CONFIG.missions[2].landing.maxVsFpm
      && st.speedKt < GAME_CONFIG.missions[2].landing.maxSpeedKt;
    if (onRunway && st.gearDown && gentle && st.pitchDeg > -6) {
      st.landed = true;
      st.y = ground + 0.5;
      st.landedScore = scoreLanding(st);
    } else if (onRunway && st.gearDown && Math.abs(st.verticalSpeedFpm) < 900 && st.speedKt < 150) {
      // Hard landing: damage, but the sortie survives on the runway.
      st.damage = Math.min(100, st.damage + 35);
      st.y = ground + 0.5;
      st.speedKt *= 0.5;
      st.landed = true;
      st.landedScore = Math.max(0, scoreLanding(st) - 200);
    } else {
      st.crashed = true;
      st.y = ground + 0.5;
    }
  }
  return st;
}

// Landing precision: 400 base, minus centreline and touchdown-zone error.
function scoreLanding(st) {
  const r = GAME_CONFIG.world.runway;
  const centreErr = Math.abs(st.z - r.z);                       // units off centreline
  const touchX = st.x - (r.x - r.length / 2);                   // 0..length along runway
  const zoneErr = touchX < 40 ? (40 - touchX) : touchX > 220 ? (touchX - 220) : 0;
  const vsPenalty = Math.max(0, Math.abs(st.verticalSpeedFpm) - 200) * 0.2;
  return Math.max(50, Math.round(
    GAME_CONFIG.scoring.landingBase - centreErr * 1.6 - zoneErr * 1.2 - vsPenalty));
}
