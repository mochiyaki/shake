/**
 * Web Audio API procedural sound synthesizer for the Earthquake Simulator.
 * Provides realistic low-frequency seismic rumbles, early warning sirens,
 * tectonic fractures, and network sensor notification beeps without external assets.
 */

class EarthquakeAudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  
  // Ambient city hum
  private ambientOsc: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;

  // Seismic rumble generator (Brown noise + lowpass filters + low frequency oscillators)
  private rumbleNode: AudioWorkletNode | ScriptProcessorNode | null = null;
  private rumbleGain: GainNode | null = null;
  private rumbleFilter: BiquadFilterNode | null = null;

  // Siren sweep (warning)
  private sirenOsc1: OscillatorNode | null = null;
  private sirenOsc2: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private sirenLfo: OscillatorNode | null = null;

  private isMuted: boolean = false;
  private masterVolValue: number = 0.5;

  constructor() {
    // Lazy initialize when user interacts
  }

  private init() {
    if (this.ctx) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolValue, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('Web Audio API not supported in this browser environment', e);
    }
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
    if (!this.ctx) this.init();
    if (this.masterGain && this.ctx) {
      const targetGain = muted ? 0 : this.masterVolValue;
      this.masterGain.gain.linearRampToValueAtTime(targetGain, this.ctx.currentTime + 0.1);
    }
  }

  public setMasterVolume(vol: number) {
    this.masterVolValue = Math.max(0, Math.min(1, vol));
    if (!this.ctx) this.init();
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.linearRampToValueAtTime(this.masterVolValue, this.ctx.currentTime + 0.05);
    }
  }

  /**
   * Generates a procedurally synthesized Brown Noise source (seismic rumble spectral template)
   */
  private createBrownNoiseNode(): ScriptProcessorNode | null {
    if (!this.ctx) return null;
    
    // Fallback to script processor for backward compatibility and simplicity
    const bufferSize = 4096;
    let lastOut = 0.0;
    
    const node = this.ctx.createScriptProcessor(bufferSize, 1, 1);
    node.onaudioprocess = (e) => {
      const output = e.outputBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // Brown noise filter formula: integrate white noise and decay slightly
        output[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = output[i];
        // Compensate for loss of volume
        output[i] *= 3.5;
      }
    };
    return node;
  }

  /**
   * Starts a continuous, dynamic low-frequency seismic earth rumble
   */
  public startRumble(magnitude: number) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    this.stopRumble();

    const ctx = this.ctx;
    
    // Resume context if suspended (browser security autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // 1. Generate brown noise
    const noise = this.createBrownNoiseNode();
    if (!noise) return;
    this.rumbleNode = noise;

    // 2. Setup lowpass filter (highly muffled bass frequencies)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // Frequency proportional to magnitude - heavier magnitudes are deeper
    const cutoffFreq = Math.max(25, 110 - (magnitude * 8));
    filter.frequency.setValueAtTime(cutoffFreq, ctx.currentTime);
    filter.Q.setValueAtTime(4.0, ctx.currentTime);
    this.rumbleFilter = filter;

    // 3. Setup rumble gain
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, ctx.currentTime);
    // Ramp up rumble
    gain.gain.exponentialRampToValueAtTime(0.4 + (magnitude * 0.15), ctx.currentTime + 1.2);
    this.rumbleGain = gain;

    // 4. Modulator (LFO) to create rolling, non-static waves of shaking rumble
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.35, ctx.currentTime); // 0.35 Hz oscillation

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0.18, ctx.currentTime);

    // Connect nodes
    lfo.connect(lfoGain);
    if (this.rumbleGain) {
      lfoGain.connect(this.rumbleGain.gain);
      noise.connect(filter);
      filter.connect(this.rumbleGain);
      this.rumbleGain.connect(this.masterGain);
    }

    lfo.start();
  }

  public updateRumbleIntensity(intensity: number) {
    if (!this.ctx || !this.rumbleGain) return;
    // Dynamically adjust gain during active wave decays
    this.rumbleGain.gain.linearRampToValueAtTime(Math.max(0.01, intensity), this.ctx.currentTime + 0.2);
  }

  public stopRumble() {
    if (this.rumbleNode) {
      try {
        this.rumbleNode.disconnect();
      } catch (e) {}
      this.rumbleNode = null;
    }
    if (this.rumbleGain) {
      try {
        this.rumbleGain.disconnect();
      } catch (e) {}
      this.rumbleGain = null;
    }
    this.rumbleFilter = null;
  }

  /**
   * Starts a dynamic background urban ambient hum
   */
  public startAmbientHum() {
    this.init();
    if (!this.ctx || !this.masterGain || this.ambientOsc) return;

    const ctx = this.ctx;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(55, ctx.currentTime); // Low 55Hz transformer hum

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, ctx.currentTime);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();

    this.ambientOsc = osc;
    this.ambientGain = gain;
  }

  public stopAmbientHum() {
    if (this.ambientOsc) {
      try {
        this.ambientOsc.stop();
        this.ambientOsc.disconnect();
      } catch (e) {}
      this.ambientOsc = null;
    }
    if (this.ambientGain) {
      try {
        this.ambientGain.disconnect();
      } catch (e) {}
      this.ambientGain = null;
    }
  }

  /**
   * Triggers a tectonic snap/fault fracture sound
   */
  public triggerTectonicFracture() {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. Short low-frequency explosion/thud
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.4);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(150, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.75);

    // 2. High-frequency crack noise
    const noise = this.createBrownNoiseNode();
    if (noise) {
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.3, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(1800, now);

      noise.connect(highpass);
      highpass.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      setTimeout(() => {
        try {
          noise.disconnect();
          noiseGain.disconnect();
        } catch (e) {}
      }, 300);
    }
  }

  /**
   * Triggers short alerts when P-wave or S-wave hits a network seismometer
   */
  public triggerSensorBeep(waveType: 'p' | 's') {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    
    // P-wave hits are short high alerts, S-wave are urgent lower alarms
    const freq = waveType === 'p' ? 1200 : 650;
    osc.frequency.setValueAtTime(freq, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + (waveType === 'p' ? 0.08 : 0.25));

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  /**
   * Starts early warning sirens (pulsing dual frequencies)
   */
  public startSiren() {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    this.stopSiren();

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Dual oscillator warning system
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(500, now);

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(504, now); // slightly detuned for chorus

    const sirenGain = ctx.createGain();
    sirenGain.gain.setValueAtTime(0.01, now);
    sirenGain.gain.linearRampToValueAtTime(0.16, now + 0.3); // warning level
    this.sirenGain = sirenGain;

    // LFO to sweep frequencies up/down (standard emergency siren sweep)
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(1.2, now); // 1.2 Hz sweep cycle

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(150, now); // swing +/- 150 Hz

    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    osc1.connect(sirenGain);
    osc2.connect(sirenGain);
    sirenGain.connect(this.masterGain);

    lfo.start(now);
    osc1.start(now);
    osc2.start(now);

    this.sirenOsc1 = osc1;
    this.sirenOsc2 = osc2;
    this.sirenLfo = lfo;
  }

  public stopSiren() {
    if (this.sirenOsc1) {
      try {
        this.sirenOsc1.stop();
        this.sirenOsc1.disconnect();
      } catch (e) {}
      this.sirenOsc1 = null;
    }
    if (this.sirenOsc2) {
      try {
        this.sirenOsc2.stop();
        this.sirenOsc2.disconnect();
      } catch (e) {}
      this.sirenOsc2 = null;
    }
    if (this.sirenLfo) {
      try {
        this.sirenLfo.stop();
        this.sirenLfo.disconnect();
      } catch (e) {}
      this.sirenLfo = null;
    }
    if (this.sirenGain) {
      try {
        this.sirenGain.disconnect();
      } catch (e) {}
      this.sirenGain = null;
    }
  }
}

export const audio = new EarthquakeAudioManager();
