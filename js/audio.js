// Fully procedural sound: no downloads, starts on the first touch.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
const CHORDS = [[48, 55, 59, 64], [45, 52, 57, 60], [41, 48, 52, 57], [43, 50, 55, 59]];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.musicOn = true; this.lastPlink = 0; this.intensity = 0; this.suck = 0; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.enabled ? .9 : 0;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = .8; this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = this.musicOn ? .32 : 0; this.music.connect(this.master);
    // Shared reverb-ish echo for the "underwater" space.
    this.echo = c.createDelay(1); this.echo.delayTime.value = .23; const fb = c.createGain(); fb.gain.value = .32; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    this.echo.connect(lp).connect(fb).connect(this.echo); const wet = c.createGain(); wet.gain.value = .35; lp.connect(wet).connect(this.master);
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
    this.whiteBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const w = this.whiteBuf.getChannelData(0); for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
    this.startAmbient(); this.startSuction(); this.nextBar = c.currentTime + .1; this.bar = 0; this.step16 = 0;
  }

  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.setTargetAtTime(on ? .9 : 0, this.ctx.currentTime, .05); }
  setMusic(on) { this.musicOn = on; if (this.music) this.music.gain.setTargetAtTime(on ? .32 : 0, this.ctx.currentTime, .3); }

  startAmbient() {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; const g = c.createGain(); g.gain.value = .22;
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = .07; lg.gain.value = 120; lfo.connect(lg).connect(f.frequency); lfo.start();
    src.connect(f).connect(g).connect(this.music); src.start();
  }

  startSuction() {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.whiteBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.4;
    this.suckGain = c.createGain(); this.suckGain.gain.value = 0; this.suckFilter = f;
    src.connect(f).connect(this.suckGain).connect(this.sfx); src.start();
  }

  // Called every frame from the game loop.
  update(dt, state) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const target = state.sucking ? .05 + Math.min(.06, state.combo * .0004) : 0;
    this.suckGain.gain.setTargetAtTime(target, t, .06);
    this.suckFilter.frequency.setTargetAtTime(state.sucking ? 700 + Math.sin(t * 7) * 150 + state.speed * 120 : 500, t, .05);
    this.intensity = state.intensity || 0;
    while (this.nextBar < t + .2) this.scheduleStep(this.nextBar);
  }

  // Generative pad + arpeggio, intensifies with combo/fever.
  scheduleStep(at) {
    const stepLen = .25, i = this.step16 % 16, chord = CHORDS[this.bar % 4];
    if (i === 0) { for (const m of chord) this.pad(mtof(m), at, stepLen * 16); }
    if (this.intensity > 0 && i % (this.intensity > 1 ? 2 : 4) === 0) {
      const m = chord[(i / 2) % chord.length | 0] + 24; this.marimba(mtof(m), at, .09);
    }
    if (this.intensity > 2 && i % 2 === 1) this.tick(at);
    if (this.intensity > 1 && i % 8 === 4) this.kick(at);
    this.step16++; if (this.step16 % 16 === 0) this.bar++; this.nextBar += stepLen;
  }

  pad(f, at, len) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 1.004; lp.type = 'lowpass'; lp.frequency.value = 900;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(.05, at + 1.2); g.gain.setTargetAtTime(0, at + len - 1, .6);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(this.music); o.start(at); o2.start(at); o.stop(at + len + 2); o2.stop(at + len + 2);
  }

  marimba(f, at, vol) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(.001, at + .35);
    o.connect(g); g.connect(this.music); g.connect(this.echo); o.start(at); o.stop(at + .4);
  }

  tick(at) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.whiteBuf;
    f.type = 'highpass'; f.frequency.value = 7000; g.gain.setValueAtTime(.05, at); g.gain.exponentialRampToValueAtTime(.001, at + .05);
    s.connect(f).connect(g).connect(this.music); s.start(at, Math.random()); s.stop(at + .06);
  }

  kick(at) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(110, at); o.frequency.exponentialRampToValueAtTime(40, at + .18);
    g.gain.setValueAtTime(.35, at); g.gain.exponentialRampToValueAtTime(.001, at + .25); o.connect(g).connect(this.music); o.start(at); o.stop(at + .3);
  }

  tone(f, dur, { type = 'sine', vol = .2, slide = 0, delay = 0, echo = false } = {}) {
    if (!this.ctx || !this.enabled) return; const c = this.ctx, at = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, at); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), at + dur);
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(.001, at + dur);
    o.connect(g); g.connect(this.sfx); if (echo) g.connect(this.echo); o.start(at); o.stop(at + dur + .05);
  }

  noise(dur, { freq = 1000, q = 1, vol = .2, type = 'bandpass', delay = 0, slide = 0 } = {}) {
    if (!this.ctx || !this.enabled) return; const c = this.ctx, at = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.whiteBuf; f.type = type; f.frequency.setValueAtTime(freq, at); if (slide) f.frequency.exponentialRampToValueAtTime(freq * slide, at + dur); f.Q.value = q;
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(.001, at + dur);
    s.connect(f).connect(g).connect(this.sfx); s.start(at, Math.random() * .5); s.stop(at + dur + .05);
  }

  // Rising pentatonic notes: the core "satisfying" feedback while cleaning.
  plink(step) {
    if (!this.ctx) return; const now = this.ctx.currentTime; if (now - this.lastPlink < .055) return; this.lastPlink = now;
    const n = SCALE[step % SCALE.length] + 12 * Math.min(1, Math.floor(step / SCALE.length) % 2);
    const f = mtof(72 + n);
    this.tone(f, .18, { vol: .07, echo: true }); this.tone(f * 2, .08, { vol: .025, type: 'triangle' });
  }
  pop(pitch = 1) { this.tone(520 * pitch, .14, { vol: .22, slide: .35 }); this.noise(.04, { freq: 3000, vol: .08 }); }
  coin(pitch = 1) { this.tone(1046 * pitch, .08, { vol: .09, type: 'square' }); this.tone(1568 * pitch, .16, { vol: .08, type: 'square', delay: .06 }); }
  bloom(i = 0) { const f = mtof(76 + SCALE[i % 8]); this.tone(f, .9, { vol: .08, echo: true }); this.tone(f * 2.76, .4, { vol: .02 }); }
  pulse() { this.tone(160, .5, { vol: .45, slide: .25 }); this.noise(.45, { freq: 600, q: .7, vol: .3, type: 'lowpass', slide: .2 }); this.tone(880, .3, { vol: .05, slide: 2, echo: true }); }
  whoosh() { this.noise(.35, { freq: 400, q: 2, vol: .18, slide: 4 }); }
  sharkWarn() { this.tone(98, .5, { type: 'sawtooth', vol: .12 }); this.tone(104, .5, { type: 'sawtooth', vol: .12 }); }
  stun() { for (let i = 0; i < 3; i++) this.tone(1200 + i * 300, .12, { vol: .06, delay: i * .07, type: 'triangle' }); }
  hit() { this.noise(.4, { freq: 300, vol: .5, type: 'lowpass' }); this.tone(90, .4, { vol: .5, slide: .4 }); }
  sting() { this.tone(1400, .25, { type: 'sawtooth', vol: .07, slide: .5 }); this.noise(.2, { freq: 4000, vol: .1 }); }
  bubble() { this.tone(400 + Math.random() * 400, .1, { vol: .06, slide: 2.4 }); }
  rescue() { [0, 4, 7, 12, 16].forEach((n, i) => this.tone(mtof(72 + n), .5, { vol: .1, delay: i * .08, echo: true, type: 'triangle' })); }
  star(i) { this.tone(mtof(79 + i * 5), .7, { vol: .16, echo: true, type: 'triangle' }); this.tone(mtof(91 + i * 5), .4, { vol: .05, delay: .04 }); }
  fanfare() { [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => this.tone(mtof(67 + n), i === 6 ? .9 : .22, { vol: .13, delay: i * .11, type: 'square', echo: true })); }
  fail() { [7, 4, 0, -5].forEach((n, i) => this.tone(mtof(64 + n), .35, { vol: .1, delay: i * .16, type: 'triangle' })); }
  fever() { [0, 7, 12, 19, 24].forEach((n, i) => this.tone(mtof(72 + n), .3, { vol: .1, delay: i * .05, type: 'sawtooth', echo: true })); }
  ui() { this.tone(880, .06, { vol: .06, type: 'triangle' }); }
  buy() { this.coin(1); this.tone(660, .3, { vol: .08, delay: .1, echo: true }); }
  tally() { this.tone(1500 + Math.random() * 200, .03, { vol: .03, type: 'square' }); }
}

export const audio = new Audio();
