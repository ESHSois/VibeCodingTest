/**
 * Web Audio API synthesizer for retro-style game sounds.
 * Synthesizing audio directly prevents any network latency or asset-loading failures.
 */

class AudioManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    // Check if localStorage has mute settings
    if (typeof window !== 'undefined') {
      const savedMute = localStorage.getItem('power_gate_shooter_muted');
      this.isMuted = savedMute === 'true';
    }
  }

  private init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('power_gate_shooter_muted', String(this.isMuted));
    }
    return this.isMuted;
  }

  getMuted(): boolean {
    return this.isMuted;
  }

  // 1. Fire Laser
  playShoot(type: 'normal' | 'homing' | 'heavy' = 'normal') {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    if (type === 'normal') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      osc.start(now);
      osc.stop(now + 0.16);
    } else if (type === 'homing') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.12);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

      osc.start(now);
      osc.stop(now + 0.13);
    } else if (type === 'heavy') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(250, now);
      osc.frequency.linearRampToValueAtTime(50, now + 0.3);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      osc.start(now);
      osc.stop(now + 0.31);
    }
  }

  // 2. Explosion
  playExplosion(intensity: 'small' | 'large' = 'small') {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const duration = intensity === 'large' ? 0.6 : 0.25;

    // Create noise buffer
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = buffer;

    // Filter to make it sound muffled/bassy
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(intensity === 'large' ? 250 : 400, now);
    filter.frequency.exponentialRampToValueAtTime(10, now + duration);

    const gainNode = this.ctx.createGain();
    const volume = intensity === 'large' ? 0.3 : 0.15;
    gainNode.gain.setValueAtTime(volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

    noiseNode.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    noiseNode.start(now);
    noiseNode.stop(now + duration + 0.05);

    // Add secondary bass rumble for large explosion
    if (intensity === 'large') {
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();

      subOsc.type = 'sawtooth';
      subOsc.frequency.setValueAtTime(80, now);
      subOsc.frequency.linearRampToValueAtTime(10, now + 0.5);

      subGain.gain.setValueAtTime(0.25, now);
      subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

      subOsc.connect(subGain);
      subGain.connect(this.ctx.destination);

      subOsc.start(now);
      subOsc.stop(now + 0.55);
    }
  }

  // 3. Pass through Gate (Power-up sound)
  playGatePass() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25]; // C4, E4, G4, C5, E5 arpeggio
    const noteDuration = 0.06;

    notes.forEach((freq, index) => {
      if (!this.ctx) return;
      const t = now + index * noteDuration;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + noteDuration * 1.5);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + noteDuration * 2);
    });
  }

  // 4. Hit Hurt
  playPlayerHurt() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.setValueAtTime(90, now + 0.08);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.19);
  }

  // 5. Boss Warning Siren
  playBossWarning() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const duration = 2.0;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    // Oscillating frequency like a siren
    for (let i = 0; i < duration * 4; i++) {
      const time = now + i * 0.25;
      const freq = i % 2 === 0 ? 180 : 100;
      osc.frequency.exponentialRampToValueAtTime(freq, time);
    }

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.linearRampToValueAtTime(0.12, now + duration - 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  // 6. Stage Cleared fanfare
  playStageCleared() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // C Major Triad building up, then high C
    const notes = [261.63, 329.63, 392.00, 523.25, 783.99, 1046.50];
    const steps = [0, 0.1, 0.2, 0.3, 0.45, 0.6];
    const lengths = [0.2, 0.2, 0.2, 0.3, 0.3, 0.8];

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const t = now + steps[idx];
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = idx === notes.length - 1 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + lengths[idx]);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + lengths[idx] + 0.05);
    });
  }

  // 7. Game Over
  playGameOver() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Descending or sad structure
    const notes = [293.66, 277.18, 261.63, 220.00]; // D4, C#4, C4, A3
    const steps = [0, 0.25, 0.5, 0.75];

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const t = now + steps[idx];
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  // Simple, optional repeating background beat (laser kick/hihat chiptune loop)
  // To keep it clean and non-annoying, we can skip full BGM synthesizers or make a subtle bass pulse.
  // Let's create a subtle chiptune bass pattern that can be played when playing.
}

export const audio = new AudioManager();
