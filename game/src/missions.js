// Ridgeline — missions. One job: track ring progress, low-level bonuses,
// landing hand-off and the running score for the active mission.
function newMissionState(missionIdx) {
  const def = GAME_CONFIG.missions[missionIdx];
  return {
    missionIdx, def,
    rings: missionRings(missionIdx),
    nextRing: 0,
    ringsCleared: 0,
    lowBonuses: 0,
    score: 0,
    message: def.brief,
    messageUntil: 0,
    finished: false,
    finishReason: '',
  };
}

function ringDistance(st, ring) {
  return Math.hypot(st.x - ring.x, st.y - ring.y, st.z - ring.z);
}

// Call once per frame. Returns events the main loop should announce.
function updateMission(m, st, dt) {
  const events = [];
  if (m.finished) return events;
  const def = m.def;

  if (m.missionIdx === 2) {
    // Landing mission: the approach gate, then the flight model decides.
    if (m.nextRing === 0 && ringDistance(st, m.rings[0]) < def.ringRadius + 14) {
      m.nextRing = 1; m.ringsCleared = 1;
      m.score += 50;
      events.push({ type: 'gate', text: 'FINAL GATE — gear down, runway 09 ahead' });
    }
    if (st.landed) {
      m.finished = true; m.finishReason = 'landed';
      m.score += st.landedScore;
      events.push({ type: 'landed', text: 'TOUCHDOWN — landing +' + st.landedScore });
    }
    if (st.crashed) {
      m.finished = true; m.finishReason = 'crashed';
      events.push({ type: 'crashed', text: 'CRASHED — short of the runway' });
    }
    return events;
  }

  const ring = m.rings[m.nextRing];
  if (ring && ringDistance(st, ring) < ring.radius) {
    m.ringsCleared++;
    m.score += def.pointsPerRing;
    let text = 'RING ' + m.ringsCleared + ' / ' + m.rings.length + '  +' + def.pointsPerRing;
    if (m.missionIdx === 1 && st.aglFt < GAME_CONFIG.missions[1].lowCeilingFt) {
      m.lowBonuses++;
      m.score += def.lowBonus;
      text += '  LOW PASS +' + def.lowBonus;
    }
    events.push({ type: 'ring', text });
    m.nextRing++;
    if (m.nextRing >= m.rings.length) {
      m.finished = true; m.finishReason = 'course-clear';
      const timeBonus = Math.max(0, Math.round((600 - st.elapsedSec)) * GAME_CONFIG.scoring.timeBonusPerSecond);
      m.score += timeBonus;
      events.push({ type: 'complete', text: 'COURSE CLEAR — time bonus +' + timeBonus });
    }
  }
  if (st.crashed) {
    m.finished = true; m.finishReason = 'crashed';
    events.push({ type: 'crashed', text: 'CRASHED — terrain strike' });
  }
  if (st.landed) {
    // A runway landing ends any sortie: bank the landing score.
    m.finished = true; m.finishReason = 'landed';
    m.score += st.landedScore;
    events.push({ type: 'landed', text: 'TOUCHDOWN — landing +' + st.landedScore });
  }
  if (st.fuel <= 0 && !st.crashed) {
    m.message = 'FUEL EMPTY — gliding. Find the runway.';
  }
  return events;
}

// The next ring the pilot should chase (null when the course is done).
function nextRingTarget(m) {
  return m.nextRing < m.rings.length ? m.rings[m.nextRing] : null;
}
