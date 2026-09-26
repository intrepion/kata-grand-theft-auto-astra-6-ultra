/** Tiny original synth soundscape. Audio is created only after a user gesture. */
export class GameAudio {
  enabled = false;
  private ctx?: AudioContext;
  private engine?: OscillatorNode;
  private gain?: GainNode;

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.ctx ??= new AudioContext();
      void this.ctx.resume().catch(() => {});
      if (!this.engine) {
        this.engine = this.ctx.createOscillator();
        this.gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        this.engine.type = "sawtooth";
        filter.type = "lowpass";
        filter.frequency.value = 180;
        this.gain.gain.value = 0;
        this.engine.connect(filter);
        filter.connect(this.gain);
        this.gain.connect(this.ctx.destination);
        this.engine.start();
      }
    } else if (this.gain && this.ctx)
      this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    return this.enabled;
  }

  update(speed: number, driving: boolean, paused: boolean): void {
    if (!this.enabled || !this.ctx || !this.gain || !this.engine) return;
    this.engine.frequency.setTargetAtTime(
      36 + Math.abs(speed) * 3,
      this.ctx.currentTime,
      0.06,
    );
    this.gain.gain.setTargetAtTime(
      driving && !paused ? 0.07 : 0,
      this.ctx.currentTime,
      0.15,
    );
  }

  chime(success = true): void {
    if (!this.enabled || !this.ctx) return;
    [0, 1, 2].forEach((i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const t = this.ctx!.currentTime + i * 0.11;
      osc.type = "sine";
      osc.frequency.value = (success ? [523, 659, 784] : [260, 220, 170])[i];
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.07, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }
}
