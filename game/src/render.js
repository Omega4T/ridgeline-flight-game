// Ridgeline — renderer. One job: turn game state into pixels.
// Canvas 2D, no libraries. Terrain is a voxel raycast into a 640x360
// offscreen buffer, then blitted with roll; aircraft, cockpit and HUD draw
// on top at full resolution.
const RW = GAME_CONFIG.camera.renderWidth;   // 640
const RH = GAME_CONFIG.camera.renderHeight;  // 360

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(c1, c2, t) {
  return [Math.round(lerp(c1[0], c2[0], t)), Math.round(lerp(c1[1], c2[1], t)), Math.round(lerp(c1[2], c2[2], t))];
}
function css(rgb) { return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')'; }
function hexRgb(s) { return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; }

// Sky palette by time of day (0 = dawn, 0.5 = noon, 1 = dusk).
function skyPalette(t) {
  const day = { top: hexRgb('#2e6db4'), mid: hexRgb('#7fb2e0'), low: hexRgb('#dcecf7'), sun: '#fff3c4', fog: hexRgb('#cfe0ee') };
  const dusk = { top: hexRgb('#2b2a55'), mid: hexRgb('#b65d7a'), low: hexRgb('#f2a35e'), sun: '#ffd27a', fog: hexRgb('#d9a284') };
  const w = Math.max(0, Math.min(1, Math.abs(t - 0.5) * 2)); // 0 at noon, 1 at dawn/dusk
  return {
    top: lerpColor(day.top, dusk.top, w), mid: lerpColor(day.mid, dusk.mid, w),
    low: lerpColor(day.low, dusk.low, w), fog: lerpColor(day.fog, dusk.fog, w),
    sun: w > 0.5 ? dusk.sun : day.sun, duskness: w,
  };
}

// Fixed cloud puffs, seeded positions above the valley.
const CLOUDS = (() => {
  const rand = mulberry32(777);
  const list = [];
  for (let i = 0; i < 26; i++) {
    list.push({ x: 100 + rand() * 1850, z: 100 + rand() * 1700, y: 250 + rand() * 90, s: 40 + rand() * 90 });
  }
  return list;
})();

// Project a world point into offscreen pixels. Returns null when behind camera.
function projectPoint(x, y, z, cam) {
  const dx = x - cam.x, dz = z - cam.z;
  const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
  const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  const depth = dx * fx + dz * fz;
  if (depth < GAME_CONFIG.camera.nearDist) return null;
  const lateral = dx * rx + dz * rz;
  const vertical = y - cam.y;
  const sx = RW / 2 + (lateral * cam.focal) / depth;
  const sy = cam.horizon - (vertical * cam.focal) / depth;
  return { x: sx, y: sy, depth };
}

function renderTerrain(offCtx, cam, pal) {
  const focal = cam.focal;
  const horizon = cam.horizon;
  const maxY = new Float32Array(RW).fill(RH);
  const fov = GAME_CONFIG.camera.fovDeg * Math.PI / 180;
  const far = GAME_CONFIG.camera.farDist;
  const fogRgb = pal.fog;
  for (let cx = 0; cx < RW; cx++) {
    const ang = cam.yaw + (cx / RW - 0.5) * fov;
    const dx = Math.sin(ang), dz = Math.cos(ang);
    let d = GAME_CONFIG.camera.nearDist;
    let prevH = null;
    while (d < far) {
      const px = cam.x + dx * d, pz = cam.z + dz * d;
      const h = heightAt(px, pz);
      const sy = horizon - ((h - cam.y) * focal) / d;
      if (sy < maxY[cx]) {
        const col = terrainColor(px, pz, h);
        // Cheap slope shade from the height change along this ray.
        let shade = 1;
        if (prevH !== null) shade = Math.max(0.62, Math.min(1.08, 1 + (h - prevH) * 0.03));
        const fogT = Math.min(0.8, Math.pow(d / far, 1.3) * 0.85);
        // Blend toward fog without allocating (hot path: ~50k samples/frame).
        const fr = col[0] * shade, fg = col[1] * shade, fb = col[2] * shade;
        offCtx.fillStyle = 'rgb(' + Math.round(fr + (fogRgb[0] - fr) * fogT) + ',' +
          Math.round(fg + (fogRgb[1] - fg) * fogT) + ',' + Math.round(fb + (fogRgb[2] - fb) * fogT) + ')';
        offCtx.fillRect(cx, Math.max(0, sy), 1, maxY[cx] - Math.max(0, sy));
        maxY[cx] = Math.max(0, sy);
      }
      prevH = h;
      d += 2 + d * 0.06;
    }
  }
}

function renderClouds(offCtx, cam, pal) {
  const pts = [];
  for (const c of CLOUDS) {
    const p = projectPoint(c.x, c.y, c.z, cam);
    if (p && p.x > -120 && p.x < RW + 120 && p.y > -40 && p.y < RH) pts.push({ p, s: c.s });
  }
  pts.sort((a, b) => b.p.depth - a.p.depth);
  for (const { p, s } of pts) {
    const sc = Math.max(0.25, cam.focal / p.depth);
    const w = s * sc * 0.5, hgt = w * 0.38;
    const alpha = Math.max(0.12, Math.min(0.85, 1.1 - p.depth / 520));
    offCtx.fillStyle = 'rgba(255,255,255,' + alpha.toFixed(2) + ')';
    offCtx.beginPath();
    offCtx.ellipse(p.x, p.y, w, hgt, 0, 0, Math.PI * 2);
    offCtx.ellipse(p.x - w * 0.5, p.y + hgt * 0.25, w * 0.6, hgt * 0.7, 0, 0, Math.PI * 2);
    offCtx.ellipse(p.x + w * 0.5, p.y + hgt * 0.25, w * 0.6, hgt * 0.7, 0, 0, Math.PI * 2);
    offCtx.fill();
  }
}

function renderRings(offCtx, cam, mission) {
  const target = nextRingTarget(mission);
  const rings = mission.rings.slice().sort((a, b) => {
    const da = Math.hypot(a.x - cam.x, a.z - cam.z), db = Math.hypot(b.x - cam.x, b.z - cam.z);
    return db - da;
  });
  for (const ring of rings) {
    if (ring.index < mission.nextRing) continue; // cleared rings stay down
    const p = projectPoint(ring.x, ring.y, ring.z, cam);
    if (!p || p.x < -80 || p.x > RW + 80 || p.y < -40 || p.y > RH + 40) continue;
    const isNext = target && ring.index === target.index;
    const rx = Math.max(4, (ring.radius * cam.focal) / p.depth);
    const ry = rx * 0.62;
    offCtx.save();
    offCtx.strokeStyle = isNext ? '#ffc93c' : '#e8ebee';
    offCtx.lineWidth = Math.max(2, rx * 0.09);
    offCtx.shadowColor = isNext ? '#ffc93c' : '#ffffff';
    offCtx.shadowBlur = isNext ? 14 : 4;
    offCtx.beginPath();
    offCtx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
    offCtx.stroke();
    offCtx.restore();
    if (isNext) {
      offCtx.fillStyle = '#ffc93c';
      offCtx.font = 'bold 13px sans-serif';
      offCtx.textAlign = 'center';
      // Label below the ring when it sits near the top of the frame,
      // so it never collides with the HUD bar (top ~80px of the 720p frame).
      const labelY = (p.y - ry - 10 < 56) ? p.y + ry + 18 : p.y - ry - 10;
      offCtx.fillText('RING ' + (ring.index + 1) + '  ' + Math.round(p.depth) + 'm', p.x, labelY);
    }
  }
}

// Runway edge lights, brighter at dusk.
function renderRunwayLights(offCtx, cam, duskness) {
  const r = GAME_CONFIG.world.runway;
  const alpha = 0.25 + duskness * 0.75;
  for (let i = 0; i <= 10; i++) {
    const x = r.x - r.length / 2 + (i / 10) * r.length;
    for (const side of [-1, 1]) {
      const p = projectPoint(x, GAME_CONFIG.world.airfield.flat + 1, r.z + side * (r.width / 2 + 2), cam);
      if (!p || p.x < 0 || p.x > RW || p.y < 0 || p.y > RH) continue;
      offCtx.fillStyle = 'rgba(255,240,180,' + alpha.toFixed(2) + ')';
      offCtx.beginPath();
      offCtx.arc(p.x, p.y, Math.max(1.5, 90 / p.depth), 0, Math.PI * 2);
      offCtx.fill();
    }
  }
}

// The Kestrel K-9 from behind and above, as a chase camera sees it:
// wide swept wings, a short foreshortened fuselage pointing away, the
// tail fin rising above it, and afterburner glow at the tail.
function renderAircraft(ctx, W, H, rollDeg, throttle, speedKt) {
  const cx = W / 2, cy = H * 0.60;
  const s = W / 1280; // scale to canvas width
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rollDeg * 0.85 * Math.PI) / 180);
  ctx.scale(s, s);
  // Afterburner glow at the tail.
  if (throttle > 0.55) {
    const glow = ctx.createRadialGradient(0, 46, 4, 0, 46, 40 + throttle * 26);
    glow.addColorStop(0, 'rgba(255,190,80,0.95)');
    glow.addColorStop(0.5, 'rgba(255,110,30,0.55)');
    glow.addColorStop(1, 'rgba(255,110,30,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 46, 40 + throttle * 26, 0, Math.PI * 2); ctx.fill();
  }
  // Main wings, swept back.
  ctx.fillStyle = '#e8542f';
  ctx.beginPath();
  ctx.moveTo(-12, -6); ctx.lineTo(-178, 34); ctx.lineTo(-168, 52); ctx.lineTo(-8, 22); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(12, -6); ctx.lineTo(178, 34); ctx.lineTo(168, 52); ctx.lineTo(8, 22); ctx.closePath(); ctx.fill();
  // Wingtip lights.
  ctx.fillStyle = '#ff5a4e'; ctx.beginPath(); ctx.arc(-176, 42, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#59d867'; ctx.beginPath(); ctx.arc(176, 42, 5, 0, Math.PI * 2); ctx.fill();
  // Tailplanes.
  ctx.fillStyle = '#c23d1e';
  ctx.beginPath(); ctx.moveTo(-10, 30); ctx.lineTo(-66, 52); ctx.lineTo(-60, 62); ctx.lineTo(-8, 44); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(10, 30); ctx.lineTo(66, 52); ctx.lineTo(60, 62); ctx.lineTo(8, 44); ctx.closePath(); ctx.fill();
  // Tail fin rising above the fuselage.
  ctx.fillStyle = '#c23d1e';
  ctx.beginPath(); ctx.moveTo(-9, -14); ctx.lineTo(0, -66); ctx.lineTo(9, -14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e8542f';
  ctx.beginPath(); ctx.moveTo(-5, -14); ctx.lineTo(0, -52); ctx.lineTo(5, -14); ctx.closePath(); ctx.fill();
  // Fuselage, foreshortened: a stubby body pointing away from the camera.
  const body = ctx.createLinearGradient(-13, 0, 13, 0);
  body.addColorStop(0, '#c3ccd4'); body.addColorStop(0.5, '#ffffff'); body.addColorStop(1, '#c3ccd4');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.quadraticCurveTo(13, -18, 13, 6);
  ctx.quadraticCurveTo(13, 32, 8, 44);
  ctx.lineTo(-8, 44);
  ctx.quadraticCurveTo(-13, 32, -13, 6);
  ctx.quadraticCurveTo(-13, -18, 0, -30);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#5a646e'; ctx.lineWidth = 2; ctx.stroke();
  // Canopy hump on top of the fuselage.
  ctx.fillStyle = '#17324d';
  ctx.beginPath(); ctx.ellipse(0, -16, 7, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(180,220,255,0.7)';
  ctx.beginPath(); ctx.ellipse(-2, -20, 2.5, 6, 0.2, 0, Math.PI * 2); ctx.fill();
  // Spine stripe + K-9 mark on the tail.
  ctx.fillStyle = '#e8542f';
  ctx.fillRect(-12, 8, 24, 5);
  ctx.fillStyle = '#17324d';
  ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('K-9', 0, 30);
  ctx.restore();
}

// Cockpit panel + artificial horizon + engine gauges, drawn lit.
function renderCockpit(ctx, W, H, st, mission, timeSec) {
  const panelH = 108;
  const g = ctx.createLinearGradient(0, H - panelH, 0, H);
  g.addColorStop(0, '#1a2027'); g.addColorStop(1, '#05070a');
  ctx.fillStyle = g;
  ctx.fillRect(0, H - panelH, W, panelH);
  ctx.fillStyle = '#2c3844';
  ctx.fillRect(0, H - panelH, W, 4);
  const cx = W / 2, cy = H - panelH / 2 + 12, R = 38;
  // Artificial horizon.
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate((-st.rollDeg * Math.PI) / 180);
  ctx.translate(0, st.pitchDeg * 1.4);
  ctx.fillStyle = '#3f8fd2'; ctx.fillRect(-R - 4, -R - 60, R * 2 + 8, R + 60);
  ctx.fillStyle = '#7a5230'; ctx.fillRect(-R - 4, 0, R * 2 + 8, R + 60);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
  for (const off of [-20, 20]) {
    ctx.beginPath(); ctx.moveTo(-R, off); ctx.lineTo(R, off); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffb347';
  ctx.beginPath(); ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 16, cy); ctx.lineTo(cx, cy + 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#9fd8ff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('ATT', cx, cy - R - 8);
  // Gauge helper: label + lit bar.
  const gauge = (x, label, frac, color) => {
    ctx.fillStyle = '#8fa3b3'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(label, x, H - panelH + 22);
    ctx.fillStyle = '#0a0e12';
    ctx.fillRect(x - 34, H - 62, 68, 12);
    ctx.fillStyle = color;
    ctx.fillRect(x - 33, H - 61, 66 * Math.max(0, Math.min(1, frac)), 10);
    ctx.strokeStyle = '#3a4753'; ctx.lineWidth = 1;
    ctx.strokeRect(x - 34, H - 62, 68, 12);
  };
  gauge(cx - 220, 'THR', st.throttle, '#ffb347');
  gauge(cx - 120, 'FUEL', st.fuel / 100, st.fuel < 25 ? '#ff5a4e' : '#59d867');
  gauge(cx + 120, 'DMG', 1 - st.damage / 100, '#59b7ff');
  gauge(cx + 220, 'FLAPS', st.gearDown ? 1 : 0, '#c9a2ff');
  ctx.fillStyle = st.gearDown ? '#59d867' : '#8fa3b3';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(st.gearDown ? 'GEAR DOWN' : 'GEAR UP', cx + 220, H - 18);
  ctx.fillStyle = '#8fa3b3';
  ctx.fillText('KESTREL K-9', cx - 220, H - 18);
  // Warnings, blinking on a fixed clock so screenshots are deterministic.
  const blink = Math.floor(timeSec * 2) % 2 === 0;
  let warn = '';
  if (st.stalled) warn = 'STALL — NOSE DOWN';
  // Low over the terrain is a warning, unless the pilot is on final with the
  // gear down — then low is the whole point.
  else if (st.aglFt < 150 && st.aglFt > 0 && !st.landed && !st.gearDown) warn = 'PULL UP';
  else if (st.fuel < 20 && st.fuel > 0) warn = 'LOW FUEL';
  else if (st.fuel <= 0) warn = 'FUEL EMPTY — GLIDE';
  if (warn && blink) {
    ctx.fillStyle = '#ff5a4e';
    ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(warn, W / 2, 150);
  }
}

// Top HUD: altitude, speed, heading, score, mission, timer.
function renderHUD(ctx, W, H, st, mission, timeSec) {
  ctx.textAlign = 'left';
  const bar = (x, y, w, label, value, unit) => {
    ctx.fillStyle = 'rgba(5,10,16,0.55)';
    ctx.fillRect(x, y, w, 54);
    ctx.strokeStyle = 'rgba(160,200,230,0.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, 54);
    ctx.fillStyle = '#9fd8ff'; ctx.font = 'bold 12px sans-serif';
    ctx.fillText(label, x + 10, y + 17);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 24px sans-serif';
    const vw = ctx.measureText(value).width;
    ctx.fillText(value, x + 10, y + 44);
    ctx.fillStyle = '#9fd8ff'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText(unit, x + 16 + vw, y + 44);
  };
  bar(16, 14, 190, 'ALTITUDE', Math.max(0, Math.round(st.y * 3.28084)).toLocaleString('en-US'), 'FT');
  bar(216, 14, 170, 'AIRSPEED', Math.round(st.speedKt) + '', 'KT');
  // Heading compass tape.
  const hx = 396, hy = 14, hw = 300;
  ctx.fillStyle = 'rgba(5,10,16,0.55)'; ctx.fillRect(hx, hy, hw, 54);
  ctx.strokeStyle = 'rgba(160,200,230,0.5)'; ctx.strokeRect(hx, hy, hw, 54);
  ctx.fillStyle = '#9fd8ff'; ctx.font = 'bold 12px sans-serif';
  ctx.fillText('HEADING', hx + 10, hy + 17);
  const hdg = st.headingDeg;
  ctx.save();
  ctx.beginPath(); ctx.rect(hx, hy + 20, hw, 30); ctx.clip();
  for (let d = -60; d <= 60; d += 10) {
    const deg = (((Math.round((hdg + d) / 10) * 10) % 360) + 360) % 360;
    const off = ((deg - hdg + 540) % 360) - 180;
    if (Math.abs(off) > 52) continue;
    const x = hx + hw / 2 + off * 2.4;
    if (x < hx + 4 || x > hx + hw - 4) continue;
    if (deg % 30 === 0) {
      ctx.fillStyle = deg % 90 === 0 ? '#ffffff' : '#9fd8ff';
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
      ctx.fillText(names[deg] || String(deg).padStart(3, '0'), x, hy + 46);
    } else {
      ctx.fillStyle = '#9fd8ff';
      ctx.fillRect(x - 1, hy + 38, 2, 8);
    }
  }
  ctx.restore();
  ctx.fillStyle = '#ffc93c';
  ctx.beginPath(); ctx.moveTo(hx + hw / 2, hy + 20); ctx.lineTo(hx + hw / 2 - 6, hy + 12); ctx.lineTo(hx + hw / 2 + 6, hy + 12); ctx.closePath(); ctx.fill();
  // Score block, right.
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(5,10,16,0.55)';
  ctx.fillRect(W - 216, 14, 200, 54);
  ctx.strokeStyle = 'rgba(160,200,230,0.5)'; ctx.strokeRect(W - 216, 14, 200, 54);
  ctx.fillStyle = '#9fd8ff'; ctx.font = 'bold 12px sans-serif';
  ctx.fillText(mission.def.name, W - 26, 31);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 24px sans-serif';
  ctx.fillText('SCORE ' + mission.score, W - 26, 58);
  // Ring progress + timer under the score.
  ctx.fillStyle = '#ffc93c'; ctx.font = 'bold 15px sans-serif';
  const total = mission.rings.length;
  ctx.fillText('RINGS ' + mission.ringsCleared + '/' + total + '   ' +
    Math.floor(st.elapsedSec / 60) + ':' + String(Math.floor(st.elapsedSec % 60)).padStart(2, '0'),
    W - 26, 92);
  // Mission message banner.
  if (mission.message) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(5,10,16,0.6)';
    const tw = ctx.measureText(mission.message).width + 36;
    ctx.fillRect(W / 2 - tw / 2, 84, tw, 30);
    ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 15px sans-serif';
    ctx.fillText(mission.message, W / 2, 104);
  }
  // Next-ring direction arrow at screen edge.
  const target = nextRingTarget(mission);
  if (target && !mission.finished) {
    const dx = target.x - st.x, dz = target.z - st.z;
    const bearing = (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360;
    let rel = ((bearing - st.headingDeg + 540) % 360) - 180;
    if (Math.abs(rel) > 32) {
      ctx.fillStyle = '#ffc93c';
      ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
      const dir = rel > 0 ? 'RING ▶' : '◀ RING';
      ctx.fillText(dir, rel > 0 ? W - 90 : 90, H / 2);
    }
  }
}

// Full frame. viewMode: 'chase' (aircraft visible) or 'cockpit' (camera at nose).
function renderFrame(ctx, off, offCtx, W, H, st, mission, opts) {
  const pal = skyPalette(opts.timeOfDay);
  // Camera: chase sits behind and above the aircraft; cockpit sits at the nose.
  const hdg = st.headingDeg * Math.PI / 180;
  const dist = opts.viewMode === 'cockpit' ? 1.5 : GAME_CONFIG.camera.distance;
  const camH = opts.viewMode === 'cockpit' ? 1.2 : GAME_CONFIG.camera.height;
  const cam = {
    x: st.x - Math.sin(hdg) * dist,
    z: st.z - Math.cos(hdg) * dist,
    y: st.y + camH,
    yaw: hdg,
    focal: (RW / 2) / Math.tan((GAME_CONFIG.camera.fovDeg * Math.PI / 180) / 2),
    // Nose-up pushes the horizon down; the chase camera also looks 12 deg
    // down at the terrain so the valley fills the frame instead of the sky.
    horizon: RH / 2 + (st.pitchDeg - 12) * (RH / 55),
  };
  // Sky.
  const sky = offCtx.createLinearGradient(0, 0, 0, RH);
  sky.addColorStop(0, css(pal.top)); sky.addColorStop(0.55, css(pal.mid)); sky.addColorStop(1, css(pal.low));
  offCtx.fillStyle = sky;
  offCtx.fillRect(0, 0, RW, RH);
  // Sun.
  const sunX = RW * (0.72 - opts.timeOfDay * 0.44), sunY = RH * (0.30 - Math.abs(opts.timeOfDay - 0.5) * 0.25);
  const sunGlow = offCtx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
  sunGlow.addColorStop(0, pal.sun); sunGlow.addColorStop(0.25, 'rgba(255,230,160,0.55)'); sunGlow.addColorStop(1, 'rgba(255,230,160,0)');
  offCtx.fillStyle = sunGlow;
  offCtx.fillRect(0, 0, RW, RH);
  offCtx.fillStyle = pal.sun;
  offCtx.beginPath(); offCtx.arc(sunX, sunY, 13, 0, Math.PI * 2); offCtx.fill();
  renderTerrain(offCtx, cam, pal);
  renderClouds(offCtx, cam, pal);
  renderRings(offCtx, cam, mission);
  renderRunwayLights(offCtx, cam, pal.duskness);
  // Blit with bank roll.
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate((-st.rollDeg * 0.45 * Math.PI) / 180);
  ctx.drawImage(off, -W / 2 - 40, -H / 2 - 40, W + 80, H + 80);
  ctx.restore();
  if (opts.viewMode === 'chase') renderAircraft(ctx, W, H, st.rollDeg, st.throttle, st.speedKt);
  renderCockpit(ctx, W, H, st, mission, opts.timeSec);
  renderHUD(ctx, W, H, st, mission, opts.timeSec);
}
