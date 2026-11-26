// Ridgeline — screenshot poses. One job: fixed, deterministic game states
// for each ?shot=, so the 4 screenshots are reproducible renders of the
// game's own code (cover first, by name).
// Pose fields: mission, flight overrides, timeOfDay, viewMode, timeSec,
// message override, ringsCleared (which rings are already down).
const SHOT_POSES = {
  cover: {
    mission: 0, timeOfDay: 0.42, viewMode: 'chase', timeSec: 42,
    flight: { x: 760, y: 108, z: 1060, headingDeg: 146, pitchDeg: 2, rollDeg: -9, speedKt: 165, throttle: 0.72, fuel: 82, damage: 0 },
    ringsCleared: 2, score: 200,
    message: 'RING RUN — ring 3 ahead, valley course',
  },
  rings: {
    mission: 0, timeOfDay: 0.5, viewMode: 'chase', timeSec: 96,
    flight: { x: 1150, y: 165, z: 830, headingDeg: 126, pitchDeg: 2, rollDeg: 14, speedKt: 178, throttle: 0.8, fuel: 64, damage: 0 },
    ringsCleared: 4, score: 400,
    message: 'RING 5 / 8 — keep the throttle honest',
  },
  runway: {
    mission: 2, timeOfDay: 0.88, viewMode: 'chase', timeSec: 210,
    flight: { x: 220, y: 58, z: 1420, headingDeg: 90, pitchDeg: -5, rollDeg: 2, speedKt: 108, throttle: 0.3, fuel: 41, damage: 0, gearDown: true },
    ringsCleared: 1, score: 50,
    message: 'FINAL — gear down, runway 09 ahead',
  },
  debrief: {
    mission: 0, timeOfDay: 0.95, viewMode: 'chase', timeSec: 312,
    flight: { x: 900, y: 210, z: 1200, headingDeg: 180, pitchDeg: 0, rollDeg: 0, speedKt: 120, throttle: 0.25, fuel: 38, damage: 0, distanceFlown: 42500 },
    ringsCleared: 8, score: 1240, finished: true,
    message: 'COURSE CLEAR — debrief below',
  },
};

// Build the full state for a shot name. Returns null for unknown shots.
function poseForShot(name) {
  const pose = SHOT_POSES[name];
  if (!pose) return null;
  const st = newFlightState(pose.mission);
  Object.assign(st, pose.flight);
  st.elapsedSec = pose.timeSec;
  st.aglFt = (st.y - heightAt(st.x, st.z)) * 3.28084;
  st.verticalSpeedFpm = Math.round(Math.sin(st.pitchDeg * Math.PI / 180) * st.speedKt * 0.514 * 196.85);
  const m = newMissionState(pose.mission);
  m.nextRing = pose.ringsCleared;
  m.ringsCleared = pose.ringsCleared;
  m.score = pose.score;
  m.message = pose.message;
  if (pose.finished) { m.finished = true; m.finishReason = 'course-clear'; }
  return { st, mission: m, timeOfDay: pose.timeOfDay, viewMode: pose.viewMode, timeSec: pose.timeSec };
}
