/**
 * Desk sounds: paper sliding, lifting, landing, turning, and the candle.
 *
 * Like the paper, the sounds are made here rather than recorded: each one is
 * shaped noise (see `rustle` and `thump`). To use a recording instead, give a
 * sound a `src` in SOUNDS; the recipe is then only the fallback while the file
 * loads or if it fails.
 *
 * Sounds only ever play in answer to something the visitor did, they are
 * short and quiet, and they can be turned off (see `lib/prefs.ts`).
 */

export type SoundId =
  | "slide" // top sheet pushed aside
  | "slideBack" // a sheet brought back onto the pile
  | "lift" // sheet picked up
  | "drop" // sheet put back down
  | "page" // next page of a clipped poem
  | "pageBack"
  | "flip" // sheet turned over
  | "light" // candle lit
  | "snuff"; // candle put out

type Rustle = {
  kind: "rustle";
  /** Seconds after the sound starts. */
  at?: number;
  dur: number;
  gain: number;
  /** The band the noise sits in sweeps from one frequency to another (Hz). */
  from: number;
  to: number;
  q?: number;
  /** 0 = smooth hiss, 1 = dry crackle. */
  crackle?: number;
  attack?: number;
};

type Thump = {
  kind: "thump";
  at?: number;
  dur: number;
  gain: number;
  /** Everything above this is removed (Hz). */
  cutoff: number;
};

type Layer = Rustle | Thump;

type Sound = {
  /** Optional recording to play instead of the recipe. */
  src?: string;
  recipe: Layer[];
};

export const SOUNDS: Record<SoundId, Sound> = {
  slide: {
    recipe: [
      { kind: "rustle", dur: 0.28, gain: 0.085, from: 2200, to: 5200, q: 0.8, crackle: 0.25, attack: 0.05 },
    ],
  },
  slideBack: {
    recipe: [
      { kind: "rustle", dur: 0.28, gain: 0.085, from: 5000, to: 2300, q: 0.8, crackle: 0.25, attack: 0.05 },
      { kind: "thump", at: 0.24, dur: 0.07, gain: 0.07, cutoff: 180 },
    ],
  },
  lift: {
    recipe: [
      { kind: "rustle", dur: 0.16, gain: 0.1, from: 3000, to: 6400, q: 1, crackle: 0.6, attack: 0.012 },
      { kind: "rustle", at: 0.08, dur: 0.11, gain: 0.05, from: 5200, to: 3400, q: 1, crackle: 0.5, attack: 0.01 },
    ],
  },
  drop: {
    recipe: [
      { kind: "rustle", at: 0.05, dur: 0.16, gain: 0.05, from: 4200, to: 2600, q: 0.8, crackle: 0.3, attack: 0.03 },
      { kind: "thump", at: 0.26, dur: 0.085, gain: 0.15, cutoff: 170 },
      { kind: "rustle", at: 0.26, dur: 0.08, gain: 0.05, from: 2600, to: 1800, q: 0.9, crackle: 0.3, attack: 0.004 },
    ],
  },
  page: {
    recipe: [
      { kind: "rustle", dur: 0.34, gain: 0.1, from: 1800, to: 6000, q: 0.9, crackle: 0.7, attack: 0.05 },
      { kind: "rustle", at: 0.23, dur: 0.16, gain: 0.06, from: 5200, to: 2600, q: 0.9, crackle: 0.5, attack: 0.02 },
    ],
  },
  pageBack: {
    recipe: [
      { kind: "rustle", dur: 0.3, gain: 0.09, from: 5600, to: 2000, q: 0.9, crackle: 0.7, attack: 0.04 },
      { kind: "thump", at: 0.3, dur: 0.07, gain: 0.08, cutoff: 200 },
    ],
  },
  flip: {
    recipe: [
      { kind: "rustle", dur: 0.42, gain: 0.085, from: 1400, to: 3800, q: 0.7, crackle: 0.5, attack: 0.09 },
      { kind: "rustle", at: 0.32, dur: 0.13, gain: 0.05, from: 3200, to: 2000, q: 0.9, crackle: 0.4, attack: 0.01 },
    ],
  },
  light: {
    recipe: [
      { kind: "rustle", dur: 0.09, gain: 0.05, from: 5600, to: 8200, q: 1.2, crackle: 0.5, attack: 0.004 },
      { kind: "rustle", at: 0.06, dur: 0.22, gain: 0.03, from: 900, to: 500, q: 0.6, attack: 0.06 },
    ],
  },
  snuff: {
    recipe: [
      { kind: "rustle", dur: 0.2, gain: 0.07, from: 1500, to: 480, q: 0.6, attack: 0.03 },
    ],
  },
};

/** Schedules one recipe on any audio context (live or offline). */
export function playRecipe(
  ctx: BaseAudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  recipe: Layer[],
  when: number,
) {
  for (const layer of recipe) {
    const start = when + (layer.at ?? 0);
    const end = start + layer.dur;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, start);

    if (layer.kind === "thump") {
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = layer.cutoff;
      // Low-passed noise is quiet, so the level is lifted to compensate.
      envelope.gain.linearRampToValueAtTime(layer.gain * 6, start + 0.006);
      envelope.gain.exponentialRampToValueAtTime(0.0001, end);
      source.connect(lowpass).connect(envelope).connect(out);
    } else {
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.Q.value = layer.q ?? 0.8;
      band.frequency.setValueAtTime(layer.from, start);
      band.frequency.exponentialRampToValueAtTime(layer.to, end);
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = Math.min(700, Math.min(layer.from, layer.to) * 0.5);

      const attack = Math.min(layer.attack ?? 0.03, layer.dur * 0.5);
      envelope.gain.linearRampToValueAtTime(layer.gain * 3, start + attack);
      envelope.gain.setTargetAtTime(0, start + layer.dur * 0.45, layer.dur * 0.2);

      // Paper does not hiss evenly: its loudness jitters as fibres catch.
      const grain = ctx.createGain();
      const crackle = layer.crackle ?? 0;
      if (crackle > 0) {
        const points = Math.max(4, Math.round(layer.dur * 110));
        const curve = new Float32Array(points);
        for (let i = 0; i < points; i++) curve[i] = 1 - crackle * Math.random();
        grain.gain.setValueCurveAtTime(curve, start, layer.dur);
      }
      source.connect(band).connect(highpass).connect(grain).connect(envelope).connect(out);
    }

    source.start(start, Math.random() * (noise.duration - 0.1));
    source.stop(end + 0.5);
  }
}

export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * 2), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export class DeskSound {
  private ctx: AudioContext | null = null;
  private out: AudioNode | null = null;
  private noise: AudioBuffer | null = null;
  private recordings = new Map<SoundId, AudioBuffer>();

  /** Browsers only allow sound after a tap or key press, so this is lazy. */
  private start(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    const ctx = new Context();
    // Soften the top end. With this gain the loudest sound peaks at about
    // 40% of full volume: present on a phone speaker, never startling.
    const soften = ctx.createBiquadFilter();
    soften.type = "lowpass";
    soften.frequency.value = 9000;
    const master = ctx.createGain();
    master.gain.value = 1.7;
    soften.connect(master).connect(ctx.destination);
    this.ctx = ctx;
    this.out = soften;
    this.noise = makeNoise(ctx);
    for (const id of Object.keys(SOUNDS) as SoundId[]) {
      const src = SOUNDS[id].src;
      if (!src) continue;
      fetch(src)
        .then((response) => response.arrayBuffer())
        .then((bytes) => ctx.decodeAudioData(bytes))
        .then((buffer) => this.recordings.set(id, buffer))
        .catch(() => {
          // Keep the synthesised sound if a recording fails to load.
        });
    }
    return ctx;
  }

  play(id: SoundId) {
    try {
      const ctx = this.start();
      if (!ctx || !this.out || !this.noise) return;
      if (ctx.state === "suspended") void ctx.resume();
      const when = ctx.currentTime + 0.01;
      const recording = this.recordings.get(id);
      if (recording) {
        const source = ctx.createBufferSource();
        source.buffer = recording;
        source.connect(this.out);
        source.start(when);
      } else {
        playRecipe(ctx, this.out, this.noise, SOUNDS[id].recipe, when);
      }
    } catch {
      // Sound is a nicety; never let it break the desk.
    }
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }
}
