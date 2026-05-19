export class Sound {
  private ctx!: AudioContext;
  private engine!: OscillatorNode;
  private engineGain!: GainNode;
  private screecher!: OscillatorNode;
  private screechGain!: GainNode;
  private started = false;

  /** Must be called on a user gesture to satisfy browser autoplay policy */
  init() {
    if (this.started) return;
    this.started = true;

    this.ctx = new AudioContext();

    // Engine — layered saw + square for gritty feel
    const saw    = this.ctx.createOscillator();
    const square = this.ctx.createOscillator();
    const mix    = this.ctx.createGain();
    this.engineGain = this.ctx.createGain();

    saw.type = 'sawtooth';
    square.type = 'square';
    square.detune.value = 7;   // slight detune for texture

    saw.connect(mix);
    square.connect(mix);
    mix.gain.value = 0.5;
    mix.connect(this.engineGain);
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.ctx.destination);

    saw.frequency.value = 60;
    square.frequency.value = 60;
    saw.start();
    square.start();

    // Alias for frequency control (both tracked via same ref for simplicity)
    this.engine = saw;

    // Tire screech — band-pass noise
    const noise = this._createNoise();
    const bp    = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 800;
    bp.Q.value = 0.5;
    this.screechGain = this.ctx.createGain();
    this.screechGain.gain.value = 0;
    noise.connect(bp);
    bp.connect(this.screechGain);
    this.screechGain.connect(this.ctx.destination);
    this.screecher = noise;
  }

  private _createNoise(): OscillatorNode {
    // Use a high-freq detuned saw as cheap noise stand-in
    const n = this.ctx.createOscillator();
    n.type = 'sawtooth';
    n.frequency.value = 220;
    n.detune.value = 1200;
    n.start();
    return n;
  }

  update(speed: number, maxSpeed: number, lateralInput: number) {
    if (!this.started) return;
    const t   = Math.min(speed / maxSpeed, 1);
    const now = this.ctx.currentTime;

    // Engine pitch: 70 Hz idle → 380 Hz max
    const freq = 70 + t * 310;
    this.engine.frequency.setTargetAtTime(freq, now, 0.08);

    // Engine volume: quiet idle, louder under throttle
    const vol = 0.015 + t * 0.06;
    this.engineGain.gain.setTargetAtTime(vol, now, 0.06);

    // Tire screech: when steering hard at speed
    const screech = Math.max(0, Math.abs(lateralInput) - 0.5) * t;
    this.screechGain.gain.setTargetAtTime(screech * 0.05, now, 0.1);
  }
}
