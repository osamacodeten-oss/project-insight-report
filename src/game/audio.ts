/** Tiny synthesized audio engine — no external files, works fully offline. */
export class GameAudio {
  private ctx: AudioContext | undefined = undefined;
  private musicGain?: GainNode;
  private sfxGain?: GainNode;
  private ambientGain?: GainNode;
  private musicTimer?: number;

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.ambientGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.3;
    this.sfxGain.gain.value = 0.6;
    this.ambientGain.gain.value = 0.05;
    this.musicGain.connect(this.ctx.destination);
    this.sfxGain.connect(this.ctx.destination);
    this.ambientGain.connect(this.ctx.destination);
    this.startAmbient();
    this.startMusic();
  }

  setMusic(v: number) {
    if (this.musicGain) this.musicGain.gain.value = v * 0.5;
    if (this.ambientGain) this.ambientGain.gain.value = v * 0.16;
  }
  setSfx(v: number) {
    if (this.sfxGain) this.sfxGain.gain.value = v;
  }

  /** Soft pink-ish noise bed = air conditioning / room tone. */
  private startAmbient() {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 620;
    src.connect(f).connect(this.ambientGain!);
    src.start();
  }

  /** Slow relaxing arpeggio in a warm major key. */
  private startMusic() {
    const notes = [261.63, 329.63, 392.0, 493.88, 392.0, 329.63];
    let i = 0;
    const play = () => {
      const ctx = this.ctx;
      if (!ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = notes[i % notes.length]! / (i % 12 < 6 ? 1 : 2);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
      o.connect(g).connect(this.musicGain!);
      o.start(t);
      o.stop(t + 3.6);
      i++;
    };
    play();
    this.musicTimer = window.setInterval(play, 2600);
  }

  private blip(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.25) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxGain!);
    o.start(t);
    o.stop(t + dur);
  }

  click() { this.blip(720, 0.08, "triangle", 0.18); }
  open() { this.blip(520, 0.12, "sine", 0.2); setTimeout(() => this.blip(780, 0.14, "sine", 0.16), 70); }
  close() { this.blip(430, 0.12, "sine", 0.16); }
  success() { this.blip(660, 0.1); setTimeout(() => this.blip(880, 0.18), 90); }
  error() { this.blip(180, 0.22, "sawtooth", 0.14); }
  door() { this.blip(300, 0.5, "sine", 0.1); setTimeout(() => this.blip(420, 0.4, "sine", 0.08), 180); }
  step() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.12;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 900;
    src.connect(f).connect(g).connect(this.sfxGain!);
    src.start(t);
  }

  dispose() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.ctx?.close();
    this.ctx = undefined;
  }
}

export const audio = new GameAudio();