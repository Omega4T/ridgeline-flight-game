// Ridgeline — sound. One job: synthesised WebAudio only (no audio files):
// engine hum tied to throttle, wind, and one-shot event sounds.
function AudioEngine() {
  this.ctx = null; this.master = null; this.osc = null; this.osc2 = null;
  this.wind = null; this.muted = false; this.started = false;
}
AudioEngine.prototype.ensure = function () {
  if (this.started) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.16;
    this.master.connect(this.ctx.destination);
    this.osc = this.ctx.createOscillator();
    this.osc.type = 'sawtooth'; this.osc.frequency.value = 55;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320;
    this.osc.connect(lp); lp.connect(this.master);
    this.osc2 = this.ctx.createOscillator();
    this.osc2.type = 'triangle'; this.osc2.frequency.value = 110;
    const g2 = this.ctx.createGain(); g2.gain.value = 0.4;
    this.osc2.connect(g2); g2.connect(this.master);
    // Wind: looped noise buffer through a bandpass.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6;
    this.wind = this.ctx.createGain(); this.wind.gain.value = 0.0;
    noise.connect(bp); bp.connect(this.wind); this.wind.connect(this.master);
    this.osc.start(); this.osc2.start(); noise.start();
    this.started = true;
  } catch (e) { /* headless / no audio: the game plays silent */ }
};
AudioEngine.prototype.update = function (throttle, speedKt, muted) {
  if (!this.started || !this.ctx) return;
  this.muted = muted;
  const t = this.ctx.currentTime;
  const target = this.muted ? 0 : 0.16;
  this.master.gain.setTargetAtTime(target, t, 0.1);
  this.osc.frequency.setTargetAtTime(48 + throttle * 70, t, 0.1);
  this.osc2.frequency.setTargetAtTime(96 + throttle * 140, t, 0.1);
  this.wind.gain.setTargetAtTime(this.muted ? 0 : Math.min(0.25, speedKt / 900), t, 0.2);
};
AudioEngine.prototype.blip = function (freq, dur, type, vol) {
  if (!this.started || !this.ctx || this.muted) return;
  try {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.5, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(this.ctx.currentTime + dur);
  } catch (e) { /* ignore */ }
};
AudioEngine.prototype.playRingChime = function () {
  this.blip(880, 0.35, 'sine', 0.5); this.blip(1318, 0.5, 'sine', 0.35);
};
AudioEngine.prototype.playLandingThud = function () {
  this.blip(90, 0.3, 'triangle', 0.8);
};
AudioEngine.prototype.playWarning = function () {
  this.blip(440, 0.18, 'square', 0.25);
};
