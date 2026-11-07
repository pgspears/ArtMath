// Generative score, synthesized live with the Web Audio API: a detuned pad on each scene's
// chord, a sub bass, plucked notes on an eighth-note grid, echo and a synthetic reverb.
const BPM = 92, EIGHTH = 60 / BPM / 2;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Score {
  constructor() { this.ac = null; this.on = false; this.voices = []; this.chord = null; this.pulse = false; this.next = 0; }
  build() {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    this.ac = ac;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3;
    this.master = ac.createGain(); this.master.gain.value = 0.0;
    this.master.connect(comp); comp.connect(ac.destination);
    // reverb: decaying stereo noise as the impulse response
    const len = Math.floor(ac.sampleRate * 3.2), ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.verb = ac.createConvolver(); this.verb.buffer = ir;
    const vg = ac.createGain(); vg.gain.value = 0.5; this.verb.connect(vg); vg.connect(this.master);
    this.padBus = ac.createGain(); this.padBus.gain.value = 0.16;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700; lp.Q.value = 0.3;
    this.padBus.connect(lp); lp.connect(this.master); lp.connect(this.verb);
    this.pluckBus = ac.createGain(); this.pluckBus.gain.value = 0.22;
    const dl = ac.createDelay(1.0); dl.delayTime.value = 0.489;
    const fb = ac.createGain(); fb.gain.value = 0.38;
    const dlp = ac.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    this.pluckBus.connect(this.master); this.pluckBus.connect(this.verb); this.pluckBus.connect(dl);
    dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(this.verb);
    const pan = ac.createStereoPanner(); pan.pan.value = 0.35; dlp.connect(pan); pan.connect(this.master);
    this.kickBus = ac.createGain(); this.kickBus.gain.value = 0.35; this.kickBus.connect(this.master);
    this.timer = setInterval(() => this.schedule(), 40);
  }
  async start() {
    if (!this.ac) this.build();
    await this.ac.resume();
    this.on = true;
    const now = this.ac.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.9, now, 0.4);
    this.next = now + 0.1;
    if (this.chord) this.pad(this.chord);
  }
  stop() {
    if (!this.ac) return;
    this.on = false;
    const now = this.ac.currentTime;
    this.master.gain.setTargetAtTime(0, now, 0.15);
    setTimeout(() => { if (!this.on) this.ac.suspend(); }, 600);
  }
  setScene(scene) {
    this.chord = scene.chord; this.pulse = !!scene.pulse;
    if (!this.on) return;
    this.pad(scene.chord);
  }
  pad(chord) {
    const ac = this.ac, now = ac.currentTime;
    for (const v of this.voices) {
      v.g.gain.cancelScheduledValues(now);
      v.g.gain.setValueAtTime(v.g.gain.value, now);
      v.g.gain.linearRampToValueAtTime(0, now + 2.2);
      v.o.forEach((o) => o.stop(now + 2.4));
    }
    this.voices = [];
    const notes = chord.slice();
    const root = notes[0];
    notes.push(root > 36 ? root - 12 : root);
    notes.forEach((m, idx) => {
      const g = ac.createGain(); g.gain.value = 0;
      const lvl = idx === notes.length - 1 ? 0.55 : idx === 0 ? 0.42 : 0.2;
      g.gain.linearRampToValueAtTime(lvl, now + 2.4);
      g.connect(idx === notes.length - 1 ? this.master : this.padBus);
      const os = [];
      const dets = idx === notes.length - 1 ? [0] : [-0.11, 0.12];
      for (const det of dets) {
        const o = ac.createOscillator();
        o.type = idx === notes.length - 1 ? 'sine' : det < 0 ? 'sine' : 'triangle';
        o.frequency.value = hz(m) * Math.pow(2, det / 12);
        const lfo = ac.createOscillator(), lg = ac.createGain();
        lfo.frequency.value = 0.12 + Math.random() * 0.08; lg.gain.value = o.frequency.value * 0.0018;
        lfo.connect(lg); lg.connect(o.frequency); lfo.start();
        o.connect(g); o.start(); os.push(o, lfo);
      }
      this.voices.push({ g, o: os });
    });
  }
  schedule() {
    if (!this.on || !this.chord) return;
    const ac = this.ac;
    while (this.next < ac.currentTime + 0.15) {
      const t = this.next;
      if (Math.random() < 0.5) {
        const m = this.chord[1 + Math.floor(Math.random() * (this.chord.length - 1))] + 12 * (1 + Math.floor(Math.random() * 2));
        this.pluck(hz(m), t, 0.2 + Math.random() * 0.3);
      }
      const beatIdx = Math.round(t / EIGHTH);
      if (this.pulse && beatIdx % 2 === 0) this.kick(t);
      this.next += EIGHTH;
    }
  }
  pluck(f, t, vel) {
    const ac = this.ac, g = ac.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.5);
    const o1 = ac.createOscillator(), o2 = ac.createOscillator(), g2 = ac.createGain();
    o1.frequency.value = f; o2.frequency.value = 2 * f; g2.gain.value = 0.22;
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.pluckBus);
    o1.start(t); o2.start(t); o1.stop(t + 1.6); o2.stop(t + 1.6);
  }
  kick(t) {
    const ac = this.ac, o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(118, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.8, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.45);
    o.connect(g); g.connect(this.kickBus); o.start(t); o.stop(t + 0.5);
  }
  impact() {
    const ac = this.ac, t = ac.currentTime + 0.05;
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(88, t); o.frequency.exponentialRampToValueAtTime(28, t + 2.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0008, t + 3.5);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 3.6);
    const n = ac.createBufferSource(), buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / ac.sampleRate * 3);
    const nf = ac.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 400;
    const ng = ac.createGain(); ng.gain.value = 0.35;
    n.buffer = buf; n.connect(nf); nf.connect(ng); ng.connect(this.master); ng.connect(this.verb); n.start(t);
  }
}
