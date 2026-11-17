/**
 * Desk sounds: paper sliding, lifting, landing, turning, and the candle.
 *
 * Most sounds are made here rather than recorded: each one is shaped noise (a
 * `rustle` is the hiss of paper moving, a `thump` is it landing). A sound can
 * instead name recordings in `src` (files in `public/sounds/`); each play then
 * picks one of them, and the recipe is only the fallback while they load or
 * if they fail.
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
  /**
   * "swell" rises and fades (paper sliding). "hit" starts at once and dies
   * away fast, with a finer, crisper grain (a page flapping over).
   */
  shape?: "swell" | "hit";
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
  /**
   * Recordings to play instead of the recipe. Each play picks one at random
   * (never the same one twice running) and nudges its speed a little, so no
   * two turns sound alike.
   */
  src?: string[];
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
  // Page turns are recordings of real books. All are CC0 (public domain)
  // from Freesound, trimmed, high-passed at 150 Hz to take out room rumble and
  // levelled to the synthesised sounds:
  //   page-1, page-2      freesound.org/s/656546  "Page Turn", IENBA
  //   page-3              freesound.org/s/858468  "Flipping Page Forward", Ym_The_Cosmic
  //   page-back-1         freesound.org/s/858467  "Flipping Page Back", Ym_The_Cosmic
  //   page-back-2         freesound.org/s/656546  "Page Turn", IENBA
  //   page-back-3         freesound.org/s/676674  "Page flip", cameronpride
  //   flip-1              freesound.org/s/856497  "Turning page (heavy paper)", xkeril
  // The recipes are the fallback: one continuous, airy swish. A soft, bright
  // brush as the corner lifts, a breath while it rises, the broad sweep as it
  // falls (most of it around 2 kHz, with a little low air pushed ahead of it),
  // and a tail that darkens as the page settles.
  page: {
    src: ["/sounds/page-1.mp3", "/sounds/page-2.mp3", "/sounds/page-3.mp3"],
    recipe: [
      { kind: "rustle", shape: "hit", dur: 0.06, gain: 0.05, from: 3600, to: 2500, q: 0.8, crackle: 0.5 },
      { kind: "rustle", at: 0.06, dur: 0.27, gain: 0.08, from: 2400, to: 1600, q: 0.95, crackle: 0.45, attack: 0.05 },
      { kind: "rustle", shape: "hit", at: 0.2, dur: 0.04, gain: 0.03, from: 2200, to: 1300, q: 0.8, crackle: 0.5 },
      { kind: "rustle", at: 0.06, dur: 0.3, gain: 0.03, from: 300, to: 200, q: 0.7, attack: 0.06 },
      { kind: "rustle", at: 0.24, dur: 0.22, gain: 0.03, from: 1500, to: 900, q: 0.7, crackle: 0.3, attack: 0.02 },
    ],
  },
  pageBack: {
    src: ["/sounds/page-back-1.mp3", "/sounds/page-back-2.mp3", "/sounds/page-back-3.mp3"],
    recipe: [
      { kind: "rustle", shape: "hit", dur: 0.06, gain: 0.05, from: 3300, to: 2300, q: 0.8, crackle: 0.5 },
      { kind: "rustle", at: 0.06, dur: 0.27, gain: 0.08, from: 2200, to: 1450, q: 0.95, crackle: 0.45, attack: 0.05 },
      { kind: "rustle", shape: "hit", at: 0.19, dur: 0.04, gain: 0.03, from: 2000, to: 1200, q: 0.8, crackle: 0.5 },
      { kind: "rustle", at: 0.06, dur: 0.3, gain: 0.03, from: 280, to: 190, q: 0.7, attack: 0.06 },
      { kind: "rustle", at: 0.23, dur: 0.22, gain: 0.03, from: 1400, to: 850, q: 0.7, crackle: 0.3, attack: 0.02 },
    ],
  },
  // Turning the whole sheet over: the same gesture with a bigger, heavier
  // sheet, so a little slower and deeper.
  flip: {
    src: ["/sounds/flip-1.mp3"],
    recipe: [
      { kind: "rustle", shape: "hit", dur: 0.07, gain: 0.05, from: 3100, to: 2200, q: 0.8, crackle: 0.5 },
      { kind: "rustle", at: 0.07, dur: 0.33, gain: 0.08, from: 2100, to: 1400, q: 0.95, crackle: 0.45, attack: 0.06 },
      { kind: "rustle", shape: "hit", at: 0.25, dur: 0.045, gain: 0.03, from: 1900, to: 1100, q: 0.8, crackle: 0.5 },
      { kind: "rustle", at: 0.07, dur: 0.36, gain: 0.035, from: 260, to: 180, q: 0.7, attack: 0.07 },
      { kind: "rustle", at: 0.3, dur: 0.26, gain: 0.03, from: 1300, to: 780, q: 0.7, crackle: 0.3, attack: 0.02 },
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
  // No two page turns sound alike: each play runs a little faster or slower,
  // and sits a little higher or lower.
  const pace = 0.9 + Math.random() * 0.22;
  const tune = 0.88 + Math.random() * 0.26;
  const offset = () => Math.random() * (noise.duration - 0.1);

  for (const layer of recipe) {
    const start = when + (layer.at ?? 0) * pace;
    const dur = layer.dur * pace;
    const end = start + dur;

    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, start);

    if (layer.kind === "thump") {
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = layer.cutoff * tune;
      // Low-passed noise is quiet, so the level is lifted to compensate.
      envelope.gain.linearRampToValueAtTime(layer.gain * 6, start + 0.006);
      envelope.gain.exponentialRampToValueAtTime(0.0001, end);
      source.connect(lowpass).connect(envelope).connect(out);
    } else {
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.Q.value = layer.q ?? 0.8;
      band.frequency.setValueAtTime(layer.from * tune, start);
      band.frequency.exponentialRampToValueAtTime(layer.to * tune, end);
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = Math.min(700, Math.min(layer.from, layer.to) * 0.5);

      const hit = layer.shape === "hit";
      if (hit) {
        // Fast in, then a short body before it is gone: a flap, not a tick.
        envelope.gain.linearRampToValueAtTime(layer.gain * 3, start + 0.002);
        envelope.gain.exponentialRampToValueAtTime(layer.gain * 0.09, end);
        envelope.gain.linearRampToValueAtTime(0, end + 0.012);
      } else {
        const attack = Math.min((layer.attack ?? 0.03) * pace, dur * 0.5);
        envelope.gain.linearRampToValueAtTime(layer.gain * 3, start + attack);
        envelope.gain.setTargetAtTime(0, start + Math.max(attack, dur * 0.45), dur * 0.2);
      }

      // Paper does not hiss evenly: its loudness jitters as fibres catch.
      const grain = ctx.createGain();
      const crackle = layer.crackle ?? 0;
      if (crackle > 0) {
        const points = Math.max(4, Math.round(dur * (hit ? 420 : 110)));
        const curve = new Float32Array(points);
        for (let i = 0; i < points; i++) curve[i] = 1 - crackle * Math.random();
        grain.gain.setValueCurveAtTime(curve, start, dur);
      }
      source.connect(band).connect(highpass).connect(grain).connect(envelope).connect(out);
    }

    source.start(start, offset());
    source.stop(end + 0.5);
  }
}

export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * 2), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Fetched once per page load and shared by every DeskSound. */
let downloads: Map<string, Promise<ArrayBuffer>> | null = null;

/**
 * Downloads every recording. Needs no user gesture, so the desk calls it as
 * soon as it mounts and the first page turn already has its file.
 */
export function preloadSounds() {
  if (downloads || typeof window === "undefined") return;
  downloads = new Map();
  for (const sound of Object.values(SOUNDS)) {
    for (const src of sound.src ?? []) {
      const bytes = fetch(src).then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${src}`);
        return response.arrayBuffer();
      });
      // A failed download leaves that sound on its recipe; never unhandled.
      bytes.catch(() => {});
      downloads.set(src, bytes);
    }
  }
}

/** How long a play may wait for its recording before using the recipe. */
const WAIT_FOR_RECORDING = 0.2;

export class DeskSound {
  private ctx: AudioContext | null = null;
  private out: AudioNode | null = null;
  private noise: AudioBuffer | null = null;
  private recordings = new Map<SoundId, AudioBuffer[]>();
  private decoding = new Map<SoundId, Promise<AudioBuffer[]>>();
  private last = new Map<SoundId, AudioBuffer>();

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
    preloadSounds();
    for (const id of Object.keys(SOUNDS) as SoundId[]) {
      const srcs = SOUNDS[id].src;
      if (!srcs?.length) continue;
      const decoded = Promise.allSettled(
        srcs.map((src) =>
          // Decoding detaches the bytes, so each context decodes a copy.
          downloads!.get(src)!.then((bytes) => ctx.decodeAudioData(bytes.slice(0))),
        ),
      ).then((results) =>
        results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])),
      );
      this.decoding.set(id, decoded);
      void decoded.then((buffers) => {
        if (buffers.length) this.recordings.set(id, buffers);
      });
    }
    return ctx;
  }

  play(id: SoundId) {
    try {
      const ctx = this.start();
      if (!ctx || !this.out || !this.noise) return;
      if (ctx.state === "suspended") void ctx.resume();
      const asked = ctx.currentTime;
      const pending = this.decoding.get(id);
      if (this.recordings.has(id) || !pending) {
        this.playNow(id, ctx.currentTime + 0.01);
        return;
      }
      // The very first play arrives while its file is still decoding (a few
      // milliseconds). Wait for it; a sound that would come late enough to
      // feel unrelated to the gesture is skipped instead.
      void pending.then(() => {
        if (ctx.currentTime - asked > WAIT_FOR_RECORDING) return;
        this.playNow(id, ctx.currentTime + 0.01);
      });
    } catch {
      // Sound is a nicety; never let it break the desk.
    }
  }

  private playNow(id: SoundId, when: number) {
    const ctx = this.ctx;
    if (!ctx || !this.out || !this.noise) return;
    const buffers = this.recordings.get(id);
    if (!buffers) {
      playRecipe(ctx, this.out, this.noise, SOUNDS[id].recipe, when);
      return;
    }
    const choices = buffers.length > 1 ? buffers.filter((b) => b !== this.last.get(id)) : buffers;
    const buffer = choices[Math.floor(Math.random() * choices.length)];
    this.last.set(id, buffer);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 0.95 + Math.random() * 0.1;
    source.connect(this.out);
    source.start(when);
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }
}
