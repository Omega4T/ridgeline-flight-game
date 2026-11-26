// Ridgeline — input. One job: read keyboard + mouse into one control vector
// the flight model consumes. Mouse steers like a stick; keys are the fallback.
function InputState(canvas) {
  this.keys = {};
  this.edges = {};   // keydown latch: a quick tap between frames still counts
  this.mouseX = 0; this.mouseY = 0; this.mouseActive = false;
  this.camToggle = false; this._camPressed = false;
  const self = this;
  window.addEventListener('keydown', (e) => {
    self.keys[e.code] = true;
    self.edges[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { self.keys[e.code] = false; });
  window.addEventListener('blur', () => { self.keys = {}; });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    self.mouseX = (e.clientX - r.left) / r.width - 0.5;
    self.mouseY = (e.clientY - r.top) / r.height - 0.5;
    self.mouseActive = true;
  });
  canvas.addEventListener('mousedown', () => {
    if (!self._camPressed) { self.camToggle = !self.camToggle; self._camPressed = true; }
  });
  canvas.addEventListener('mouseup', () => { self._camPressed = false; });
  canvas.addEventListener('mouseleave', () => { self.mouseActive = false; });
}

// Returns { pitch, roll, throttleUp, throttleDown, airbrake, gear, pause, restart, mute }.
InputState.prototype.read = function () {
  const k = this.keys;
  let pitch = 0, roll = 0;
  if (k['ArrowUp'] || k['KeyW']) pitch += 1;
  if (k['ArrowDown'] || k['KeyS']) pitch -= 1;
  if (k['ArrowLeft'] || k['KeyA']) roll -= 1;
  if (k['ArrowRight'] || k['KeyD']) roll += 1;
  if (this.mouseActive && pitch === 0 && roll === 0) {
    // Mouse stick: up = nose up, left = bank left. Dead zone in the middle.
    pitch = Math.max(-1, Math.min(1, -this.mouseY * 2.4));
    roll = Math.max(-1, Math.min(1, this.mouseX * 2.4));
    if (Math.abs(pitch) < 0.08) pitch = 0;
    if (Math.abs(roll) < 0.08) roll = 0;
  }
  return {
    pitch, roll,
    throttleUp: !!(k['ShiftLeft'] || k['ShiftRight'] || k['Equal']),
    throttleDown: !!(k['ControlLeft'] || k['ControlRight'] || k['Minus']),
    airbrake: !!k['KeyB'],
    gear: !!k['KeyG'],
    pause: !!k['KeyP'],
    restart: !!k['KeyR'],
    mute: !!k['KeyM'],
  };
};
InputState.prototype.consumeEdge = function (code) {
  if (this.edges[code]) { this.edges[code] = false; return true; }
  return false;
};
