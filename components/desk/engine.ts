import { BOOK_AMBIENCE, type Book, type PaperId } from "@/lib/papers";
import { FAN, hash01, jitterFor, type Jitter } from "@/lib/seed";
import { PaperRenderer, type SheetQuad } from "./gl/renderer";
import {
  chain,
  perspective,
  project,
  rotX,
  rotY,
  rotZ,
  scale,
  toCss,
  translate,
  type Mat4,
} from "./matrix";

/**
 * The desk engine.
 *
 * React owns *what* is on the desk (which poem is on top, whether a sheet is
 * picked up, which page, which side). The engine owns *where everything is*:
 * it animates each sheet with springs and, every frame, writes one matrix per
 * sheet to both the HTML element (real text) and the WebGL quad (paper)
 * underneath it, so the two can never drift apart.
 *
 * Because the paper is drawn on a single canvas under all the text, text that
 * should be hidden by a sheet lying on top of it is clipped with `clip-path`
 * (see `occlude`).
 */

export type EnginePoem = { slug: string; book: Book; paper: PaperId; sheets: number };

export type View = {
  /** Index of the poem on top of the pile; poems before it have been set aside. */
  top: number;
  picked: boolean;
  /** Which sheet of a clipped poem is in front. */
  page: number;
  flipped: boolean;
};

export type EngineEvents = {
  /** The top sheet was swiped aside. */
  onDismiss(): void;
  /** The top sheet was tapped. */
  onPickUp(): void;
  /** The desk around a picked-up sheet was tapped. */
  onPutDown(): void;
  /**
   * A picked-up sheet was leafed sideways (a swipe, a two-finger swipe on a
   * trackpad, or a drag on the paper's margin): 1 is onwards (next page, then
   * the back), -1 is back again.
   */
  onPage(delta: 1 | -1): void;
  /** WebGL paper became available or was lost. */
  onPaper(ready: boolean): void;
};

const DEG = Math.PI / 180;
const PERSPECTIVE = 2600;
const LAMP_HEIGHT = 300;
const REST_LIFT = 2;
const DRAG_LIFT = 16;
const PICKED_LIFT = 90;
const PILE_DIM = 0.36;
/** Clear space between the title block and the top of the pile. */
const HEADER_GAP = 18;
/** Height of the candle flame above the desk, in px. */
const CANDLE_HEIGHT = 46;
/** Where the clip grips the sheets, as fractions of the sheet size. */
const CLIP_X = 0.13;
/** Seconds the room takes to settle into another book's light. */
const TONE_EASE = 1;

type Tone = number[];
/** A book's ambience as one list: lamp RGB, then desk RGB. */
const toneOf = (book: Book | undefined): Tone =>
  book ? [...BOOK_AMBIENCE[book].lamp, ...BOOK_AMBIENCE[book].desk] : [1, 1, 1, 1, 1, 1];

class Spring {
  v = 0;
  target: number;
  constructor(
    public x: number,
    private k: number,
    private c: number,
    private eps: number,
  ) {
    this.target = x;
  }
  /** Returns true while still moving. */
  step(dt: number): boolean {
    if (this.x === this.target && this.v === 0) return false;
    this.v += (-this.k * (this.x - this.target) - this.c * this.v) * dt;
    this.x += this.v * dt;
    if (
      Math.abs(this.x - this.target) < this.eps &&
      Math.abs(this.v) < this.eps * 20
    ) {
      this.x = this.target;
      this.v = 0;
      return false;
    }
    return true;
  }
  snap(to = this.target) {
    this.x = this.target = to;
    this.v = 0;
  }
}

type SheetMats = {
  screen: Mat4;
  world: Mat4;
  css: Mat4;
  front: boolean;
  fold: number;
};

type PoemState = {
  poem: EnginePoem;
  el: HTMLElement;
  sheetEls: HTMLElement[];
  contentEls: HTMLElement[];
  backEl: HTMLElement | null;
  clipEl: HTMLElement | null;
  jitter: Jitter;
  seeds: number[];
  x: Spring;
  y: Spring;
  rot: Spring;
  scale: Spring;
  lift: Spring;
  flip: Spring;
  dim: Spring;
  fan: Spring;
  folds: Spring[];
  /** The side this sheet leaves by when set aside. */
  dir: 1 | -1;
  mats: SheetMats[];
  base: Mat4;
  onScreen: boolean;
  flippedOver: boolean;
};

type Drag = {
  id: number;
  x0: number;
  y0: number;
  sx: number;
  sy: number;
  t0: number;
  moved: boolean;
  lastX: number;
  lastT: number;
  vx: number;
  grab: number;
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class DeskEngine {
  private poems: PoemState[] = [];
  private view: View;
  private pendingView: View | null = null;
  private renderer: PaperRenderer | null = null;
  private styles = new WeakMap<HTMLElement | SVGElement, Record<string, string>>();
  private raf = 0;
  private last = 0;
  private destroyed = false;

  private vw = 0;
  private vh = 0;
  private W = 0;
  private H = 0;
  private pileScale = 0.8;
  private pileX = 0;
  private pileY = 0;
  private pickedY = 0;

  private lampX = new Spring(0, 70, 16, 0.2);
  private lampY = new Spring(0, 70, 16, 0.2);
  /** True once the canvas has drawn a frame and the HTML paper can step aside. */
  private paperShown = false;
  private lampMoved = false;
  private fade = 1;
  private fadeDir = 0;

  private drag: Drag | null = null;
  private backdrop: { id: number; x: number; y: number } | null = null;
  private touch: { x: number; y: number; t: number } | null = null;
  /** A mouse drag on the paper of a picked-up sheet, to leaf it. */
  private leaf: { id: number; x: number; y: number; t: number } | null = null;
  /** A trackpad's sideways swipe: how far it has gone, and when it moved last. */
  private wheel = { dx: 0, t: 0, spent: false };
  private reduced: boolean;
  private motionQuery: MediaQueryList;
  private resizer: ResizeObserver;
  private tilt: { beta: number; gamma: number } | null = null;
  private tilting = false;
  /** On iOS: waiting for the first tap to ask for the phone's motion. */
  private askForTilt: (() => void) | null = null;

  private candleEl: HTMLElement | null = null;
  /** The candle's drawing, clipped apart from the button (see draw()). */
  private candleArt: SVGElement | null = null;
  private candleX = -9999;
  private candleY = -9999;
  private candleSize = 0;
  /** 1 when the candle is lit, 0 when it has been put out. */
  private candleGlow = new Spring(1, 60, 14, 0.002);
  private lastDraw = 0;

  /** The book on top tints the lamp and the desk; eased from one to the next. */
  private toneFrom: Tone;
  private toneTo: Tone;
  private toneT = 1;

  constructor(
    private root: HTMLElement,
    private canvas: HTMLCanvasElement,
    poems: EnginePoem[],
    private events: EngineEvents,
    view: View,
  ) {
    this.view = view;
    this.motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced = this.motionQuery.matches;

    const articles = Array.from(root.querySelectorAll<HTMLElement>(".poema"));
    this.poems = poems.map((poem, i) => {
      const el = articles[i];
      const sheetEls = Array.from(el.querySelectorAll<HTMLElement>(".folha"));
      return {
        poem,
        el,
        sheetEls,
        contentEls: sheetEls.map(
          (sheet) => sheet.querySelector<HTMLElement>(".folha-conteudo")!,
        ),
        backEl: el.querySelector<HTMLElement>(".verso-folha"),
        clipEl: el.querySelector<HTMLElement>(".clipe"),
        jitter: jitterFor(poem.slug),
        seeds: sheetEls.map((_, j) => hash01(`${poem.slug}:folha:${j}`)),
        x: new Spring(0, 150, 24, 0.05),
        y: new Spring(0, 150, 24, 0.05),
        rot: new Spring(0, 150, 24, 0.0002),
        scale: new Spring(1, 150, 24, 0.0002),
        lift: new Spring(REST_LIFT, 150, 24, 0.05),
        flip: new Spring(0, 95, 19, 0.0005),
        dim: new Spring(1, 120, 22, 0.002),
        fan: new Spring(1, 150, 24, 0.002),
        folds: sheetEls.map(() => new Spring(0, 85, 18.5, 0.0005)),
        // Sheets set aside with a button leave by the left, away from the candle.
        dir: -1,
        mats: [],
        base: [],
        onScreen: true,
        flippedOver: false,
      };
    });

    this.toneTo = this.toneFrom = toneOf(poems[view.top]?.book);
    this.candleEl = root.querySelector<HTMLElement>(".vela");
    this.candleArt = this.candleEl?.querySelector("svg") ?? null;
    this.measure();
    this.lampX.snap(this.restLamp()[0]);
    this.lampY.snap(this.restLamp()[1]);
    this.retarget();
    this.snapAll();

    this.startPaper();

    root.addEventListener("pointerdown", this.onPointerDown);
    root.addEventListener("pointermove", this.onPointerMove);
    root.addEventListener("pointerup", this.onPointerUp);
    root.addEventListener("pointercancel", this.onPointerCancel);
    root.addEventListener("touchstart", this.onTouchStart, { passive: true });
    root.addEventListener("touchend", this.onTouchEnd, { passive: true });
    root.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    this.motionQuery.addEventListener("change", this.onMotionChange);
    this.listenForTilt();
    this.resizer = new ResizeObserver(this.onResize);
    this.resizer.observe(root);
    // The title grows when its web font arrives.
    const header = root.querySelector(".mesa-topo");
    if (header) this.resizer.observe(header);

    this.draw();
    this.invalidate();
  }

  /* ---------------------------------------------------------------- state */

  setView(view: View) {
    const current = this.pendingView ?? this.view;
    const same =
      view.top === current.top &&
      view.picked === current.picked &&
      view.page === current.page &&
      view.flipped === current.flipped;
    if (same) return;
    if (this.reduced) {
      // Reduced motion: fade out, move everything at once, fade back in.
      this.pendingView = view;
      this.fadeDir = -1;
    } else {
      this.view = view;
      this.retarget();
    }
    this.invalidate();
  }

  private restLamp(): [number, number] {
    return [
      this.pileX - Math.min(this.vw * 0.3, 330),
      this.pileY - Math.min(this.vh * 0.3, 270),
    ];
  }

  private measure() {
    const rect = this.root.getBoundingClientRect();
    this.vw = rect.width;
    this.vh = rect.height;
    const style = getComputedStyle(this.root);
    // The title block's real height (the tagline, and in English a second
    // line, can wrap), so the pile never crowds it. Written back as
    // --topo-medido for the CSS that places the candle.
    const header = this.root.querySelector<HTMLElement>(".mesa-topo");
    const top = Math.max(
      parseFloat(style.getPropertyValue("--topo")) || 64,
      header ? Math.ceil(header.offsetTop + header.offsetHeight + HEADER_GAP) : 0,
    );
    this.root.style.setProperty("--topo-medido", `${top}px`);
    const bar = parseFloat(style.getPropertyValue("--barra")) || 96;
    // On phones a strip under the pile is kept for the candle.
    const under = parseFloat(style.getPropertyValue("--sob-pilha")) || 0;
    const sheet = this.poems[0]?.sheetEls[0];
    this.W = sheet?.offsetWidth || 400;
    this.H = sheet?.offsetHeight || 568;
    this.pileScale = Math.min(
      this.vw < 640 ? 0.9 : 0.8,
      (this.vh - top - bar - under - 12) / this.H,
      (this.vw - 28) / this.W,
    );
    // The candle's CSS places it from the pile's real size.
    this.root.style.setProperty("--s-pilha", String(this.pileScale));
    this.pileX = this.vw / 2;
    // The pile sits just under the title, so the two read together, and any
    // room to spare is shared above and below them: the title comes down by
    // --desce (desk.css), which the header's measured place leaves out
    // because it is a translate. On phones the room goes below, by the
    // buttons. (Matched by --pilha-y in desk.css.)
    const spare = this.vh - top - bar - under - 6 - this.H * this.pileScale;
    const lower = this.vw < 640 ? 0 : Math.max(0, spare / 2);
    this.pileY = top + lower + 6 + (this.H * this.pileScale) / 2;
    // Land the picked-up sheet on whole pixels so its text stays sharp.
    this.pickedY =
      Math.round(Math.max(8, (this.vh - bar - this.H) / 2 + 4)) + this.H / 2;
    this.renderer?.resize(
      this.vw,
      this.vh,
      Math.min(window.devicePixelRatio || 1, 2),
    );
    // The candle is placed by CSS; the engine only needs to know where.
    if (this.candleEl) {
      const box = this.candleEl.getBoundingClientRect();
      this.candleSize = box.width;
      this.candleX = box.left - rect.left + box.width / 2;
      this.candleY = box.top - rect.top + box.height / 2;
    }
  }

  /** Lights the candle or puts it out. */
  setCandle(lit: boolean) {
    this.candleGlow.target = lit ? 1 : 0;
    if (this.reduced) this.candleGlow.snap();
    this.invalidate();
  }

  /** Works out where every sheet should be for the current view. */
  private retarget() {
    const { view } = this;
    this.poems.forEach((s, i) => {
      const rank = i - view.top;
      const picked = rank === 0 && view.picked;
      if (rank < 0) {
        s.x.target = s.dir > 0 ? this.vw + this.W * 0.7 : -this.W * 0.7;
        s.y.target = this.pileY + s.jitter.dy - 24;
        s.rot.target = (s.jitter.rot + s.dir * 15) * DEG;
        s.scale.target = this.pileScale;
        s.lift.target = REST_LIFT;
        s.dim.target = view.picked ? PILE_DIM : 1;
      } else if (picked) {
        s.x.target = Math.round(this.vw / 2 - this.W / 2) + this.W / 2;
        s.y.target = this.pickedY;
        s.rot.target = 0;
        s.scale.target = 1;
        s.lift.target = PICKED_LIFT;
        s.dim.target = 1;
      } else {
        s.x.target = this.pileX + s.jitter.dx;
        s.y.target = this.pileY + s.jitter.dy + Math.min(rank, 5) * 1.5;
        s.rot.target = s.jitter.rot * DEG;
        s.scale.target = this.pileScale;
        s.lift.target = REST_LIFT;
        s.dim.target = view.picked ? PILE_DIM : 1;
      }
      s.flip.target = picked && view.flipped ? Math.PI : 0;
      s.fan.target = picked ? 0.55 : 1;
      s.folds.forEach((fold, j) => {
        fold.target = picked && j < view.page ? 1 : 0;
      });
    });
    this.retone();
  }

  /** The ambience right now, part way between two books while easing. */
  private tone(): Tone {
    const e = smooth(0, 1, this.toneT);
    return this.toneFrom.map((v, i) => v + (this.toneTo[i] - v) * e);
  }

  /**
   * Starts easing towards the ambience of the book on top. With reduced
   * motion it switches at once (while the pile is faded out).
   */
  private retone() {
    const to = toneOf(this.poems[this.view.top]?.poem.book);
    if (to.every((v, i) => v === this.toneTo[i])) return;
    this.toneFrom = this.tone();
    this.toneTo = to;
    this.toneT = this.reduced ? 1 : 0;
  }

  private springsOf(s: PoemState): Spring[] {
    return [s.x, s.y, s.rot, s.scale, s.lift, s.flip, s.dim, s.fan, ...s.folds];
  }

  private snapAll() {
    for (const s of this.poems) for (const spring of this.springsOf(s)) spring.snap();
  }

  /* ----------------------------------------------------------------- loop */

  invalidate() {
    if (this.raf || this.destroyed) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.destroyed) return;
    // Use real elapsed time, in small steps: animations take the same time
    // whatever the frame rate, and the springs stay stable on slow frames.
    const dt = Math.min(0.5, (now - this.last) / 1000 || 0.016);
    this.last = now;
    let active = false;
    const steps = Math.max(2, Math.ceil(dt / 0.008));
    for (let pass = 0; pass < steps; pass++) {
      active = false;
      for (const s of this.poems) {
        for (const spring of this.springsOf(s)) {
          active = spring.step(dt / steps) || active;
        }
      }
      active = this.lampX.step(dt / steps) || active;
      active = this.lampY.step(dt / steps) || active;
      active = this.candleGlow.step(dt / steps) || active;
    }

    if (this.toneT < 1) {
      this.toneT = Math.min(1, this.toneT + dt / TONE_EASE);
      active = true;
    }

    if (this.fadeDir !== 0) {
      this.fade += this.fadeDir * (dt / 0.16);
      if (this.fade <= 0) {
        this.fade = 0;
        this.fadeDir = 1;
        if (this.pendingView) {
          this.view = this.pendingView;
          this.pendingView = null;
          this.retarget();
          this.snapAll();
        }
      } else if (this.fade >= 1) {
        this.fade = 1;
        this.fadeDir = 0;
      }
      active = true;
    }

    // A lit candle keeps flickering, so the desk keeps drawing, but at a
    // gentle rate when nothing else is moving.
    const flickering =
      !this.reduced && !!this.renderer && !!this.candleEl && this.candleGlow.x > 0.01;
    const busy = active || !!this.drag;
    if (busy || !flickering || now - this.lastDraw >= 40) {
      this.draw();
      this.lastDraw = now;
    }
    if (busy || flickering) this.raf = requestAnimationFrame(this.frame);
  };

  /** How bright the flame is right now (0..1) and which way it leans (deg). */
  private flame(): [number, number] {
    if (this.reduced) return [0.94 * this.candleGlow.x, 0];
    const t = performance.now() / 1000;
    const level =
      0.9 +
      0.06 * Math.sin(t * 9.1) * Math.sin(t * 2.3) +
      0.04 * Math.sin(t * 17.3 + 1.7 * Math.sin(t * 3.1));
    return [level * this.candleGlow.x, 7 * Math.sin(t * 2.1) * Math.sin(t * 0.7 + 1)];
  }

  /* ----------------------------------------------------------------- draw */

  private set(el: HTMLElement | SVGElement, prop: string, value: string) {
    let cache = this.styles.get(el);
    if (!cache) this.styles.set(el, (cache = {}));
    if (cache[prop] === value) return;
    cache[prop] = value;
    if (prop.startsWith("--")) el.style.setProperty(prop, value);
    else (el.style as unknown as Record<string, string>)[prop] = value;
  }

  private fanMatrix(s: PoemState, j: number): Mat4 | null {
    if (j === 0) return null;
    const k = s.fan.x * j;
    const px = -this.W / 2 + this.W * CLIP_X;
    const py = -this.H / 2 + this.H * 0.03;
    return chain(
      translate(px + k * FAN.dx, py + k * FAN.dy),
      rotZ(k * FAN.rot * DEG),
      translate(-px, -py),
    );
  }

  private corners(m: Mat4): [number, number][] {
    const w = this.W / 2;
    const h = this.H / 2;
    return [project(m, -w, -h), project(m, w, -h), project(m, w, h), project(m, -w, h)];
  }

  /**
   * The paper is drawn on a canvas *under* all the text, so the text of a
   * sheet lying beneath another would show through. This returns the
   * clip-path that hides the part of `target` covered by `occluder`.
   */
  private occlude(target: Mat4, occluder: Mat4, width: number, height: number): string {
    const [a, b, c, d, e, f] = [target[0], target[1], target[4], target[5], target[12], target[13]];
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-6) return "none";
    const pad = 80;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const hole = this.corners(occluder).map(([X, Y]) => {
      const x = (d * (X - e) - c * (Y - f)) / det;
      const y = (-b * (X - e) + a * (Y - f)) / det;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      return `${x.toFixed(1)}px ${y.toFixed(1)}px`;
    });
    if (maxX < -pad || minX > width + pad || maxY < -pad || minY > height + pad) {
      return "none";
    }
    const o = [
      `${-pad}px ${-pad}px`,
      `${width + pad}px ${-pad}px`,
      `${width + pad}px ${height + pad}px`,
      `${-pad}px ${height + pad}px`,
    ];
    return `polygon(evenodd, ${o.join(", ")}, ${o[0]}, ${hole.join(", ")}, ${hole[0]}, ${o[0]})`;
  }

  /** The sheet currently in front of a poem (pages before it are turned over). */
  private frontSheet(s: PoemState): number {
    const j = s.mats.findIndex((m) => m.fold < 0.5);
    return j < 0 ? s.mats.length - 1 : j;
  }

  private draw() {
    const { W, H, view } = this;
    const n = this.poems.length;
    const lamp: [number, number, number] = [this.lampX.x, this.lampY.x, LAMP_HEIGHT];

    // Pass 1: matrices.
    for (const s of this.poems) {
      const x = s.x.x;
      const y = s.y.x;
      const turn = [rotZ(s.rot.x), scale(s.scale.x), rotY(s.flip.x)];
      s.base = chain(translate(x, y), perspective(PERSPECTIVE), ...turn);
      const baseWorld = chain(translate(x, y, s.lift.x), ...turn);
      s.flippedOver = Math.cos(s.flip.x) < 0;
      s.mats = s.sheetEls.map((_, j) => {
        const fold = s.folds[j].x;
        const parts: Mat4[] = [];
        const fan = this.fanMatrix(s, j);
        if (fan) parts.push(fan);
        if (fold > 0.0005) {
          parts.push(translate(0, -H / 2), rotX(fold * Math.PI), translate(0, H / 2));
        }
        const screen = chain(s.base, ...parts);
        const world = chain(baseWorld, ...parts);
        const [p0, p1, , p3] = this.corners(screen);
        const front =
          (p1[0] - p0[0]) * (p3[1] - p0[1]) - (p1[1] - p0[1]) * (p3[0] - p0[0]) > 0;
        return { screen, world, css: chain(screen, translate(-W / 2, -H / 2)), front, fold };
      });
      const box = this.corners(s.mats[0].screen);
      const reach = 60;
      s.onScreen =
        Math.max(...box.map((p) => p[0])) > -reach &&
        Math.min(...box.map((p) => p[0])) < this.vw + reach &&
        Math.max(...box.map((p) => p[1])) > -reach &&
        Math.min(...box.map((p) => p[1])) < this.vh + reach;
    }

    // Pass 2: HTML.
    this.poems.forEach((s, i) => {
      const rank = i - view.top;
      const textShown = rank === 0 || rank === 1 || (rank < 0 && s.onScreen);
      const above = i > 0 && this.poems[i - 1].onScreen ? this.poems[i - 1] : null;
      const inFront = this.frontSheet(s);
      const ink = 0.45 + 0.55 * smooth(PILE_DIM, 1, s.dim.x);

      s.mats.forEach((m, j) => {
        const sheet = s.sheetEls[j];
        const content = s.contentEls[j];
        this.set(sheet, "transform", toCss(m.css));
        const uncovered =
          (j === 0 || s.folds[j - 1].x > 0.002) && (j < 2 || s.folds[j - 2].x > 0.5);
        const show = textShown && m.front && m.fold < 0.5 && uncovered && s.onScreen;
        this.set(content, "opacity", show ? ink.toFixed(2) : "0");

        let clip = "none";
        if (show) {
          const pageAbove = j > 0 ? s.mats[j - 1] : null;
          if (pageAbove && pageAbove.fold < 0.5) {
            clip = this.occlude(m.css, pageAbove.screen, W, H);
          } else if (j === inFront && above) {
            clip = this.occlude(m.css, above.mats[this.frontSheet(above)].screen, W, H);
          }
        }
        this.set(content, "clipPath", clip);
      });

      if (s.backEl) {
        const fan = this.fanMatrix(s, s.mats.length - 1);
        const back = chain(
          s.base,
          ...(fan ? [fan] : []),
          rotY(Math.PI),
          translate(-W / 2, -H / 2),
        );
        this.set(s.backEl, "transform", toCss(back));
        const content = s.backEl.firstElementChild as HTMLElement | null;
        if (content) this.set(content, "opacity", s.flippedOver && rank === 0 ? "1" : "0");
      }

      if (s.clipEl) {
        const css = chain(s.base, translate(-W / 2 + W * CLIP_X, -H / 2));
        this.set(s.clipEl, "transform", toCss(css));
        const show = textShown && !s.flippedOver && s.onScreen;
        this.set(s.clipEl, "opacity", show ? "1" : "0");
        this.set(
          s.clipEl,
          "clipPath",
          show && above
            ? this.occlude(css, above.mats[this.frontSheet(above)].screen, 0, 0)
            : "none",
        );
      }

      // Which way the lamp rakes across this sheet, for the pressed-in type.
      if (rank <= 1) {
        const dx = lamp[0] - s.x.x;
        const dy = lamp[1] - s.y.x;
        const cos = Math.cos(s.rot.x);
        const sin = Math.sin(s.rot.x);
        const reach = Math.min(1, Math.hypot(dx, dy) / 260) / (Math.hypot(dx, dy) || 1);
        const q = (v: number) => (Math.round(v * 8) / 8).toFixed(3);
        this.set(s.el, "--lx", q((dx * cos + dy * sin) * reach));
        this.set(s.el, "--ly", q((-dx * sin + dy * cos) * reach));
      }
    });

    const pile = this.root.querySelector<HTMLElement>(".pilha");
    if (pile) this.set(pile, "opacity", this.fade >= 1 ? "" : this.fade.toFixed(3));

    // The candle is an HTML element above the pile. A sheet held up to read
    // is nearer than the candle, so it hides the part of the candle behind it.
    // Two things can: the bundle itself (its last sheet, which never turns,
    // covers the rest), and a page in the air being turned, which lifts off
    // the bundle towards you. One clip-path can only cut one hole, so the
    // button is cut by the bundle and its drawing by the turning page.
    const [flame, lean] = this.flame();
    if (this.candleEl) {
      const held = this.poems[view.top];
      const half = this.candleSize / 2;
      const candle = translate(this.candleX - half, this.candleY - half);
      const hide = (sheet: Mat4 | undefined) =>
        sheet ? this.occlude(candle, sheet, this.candleSize, this.candleSize) : "none";
      const isHeld = held && held.onScreen && held.lift.x > DRAG_LIFT + 4;
      // Of the pages in the air (still drawn, see alpha in pass 3), the one
      // nearest to lying flat hangs lowest, towards the candle.
      const turning = isHeld
        ? held.mats
            .filter((m) => m.fold > 0.002 && m.fold < 0.92)
            .sort((a, b) => a.fold - b.fold)[0]
        : undefined;
      this.set(this.candleEl, "--chama", flame.toFixed(3));
      this.set(this.candleEl, "--vento", `${lean.toFixed(1)}deg`);
      this.set(this.candleEl, "clipPath", isHeld ? hide(held.mats.at(-1)?.screen) : "none");
      if (this.candleArt) this.set(this.candleArt, "clipPath", hide(turning?.screen));
    }

    // Pass 3: paper.
    if (!this.renderer) return;
    const quads: SheetQuad[] = [];
    let grounded = false;
    for (let i = n - 1; i >= 0; i--) {
      const s = this.poems[i];
      const rank = i - view.top;
      if (!s.onScreen || rank > 6) continue;
      const count = s.mats.length;
      const order = Array.from({ length: count }, (_, k) =>
        s.flippedOver ? k : count - 1 - k,
      );
      order.forEach((j, k) => {
        const m = s.mats[j];
        const alpha = (1 - smooth(0.5, 0.92, m.fold)) * this.fade;
        const picked = rank === 0 && s.lift.x > DRAG_LIFT + 4;
        const ground = k === 0 && rank >= 0 && (!grounded || picked);
        if (ground) grounded = true;
        quads.push({
          screen: m.screen,
          world: m.world,
          halfW: W / 2,
          halfH: H / 2,
          paper: s.poem.paper,
          seed: s.seeds[j],
          alpha,
          dim: s.dim.x,
          // Only the bottom sheet of a bundle shadows the desk; the others
          // lie on the sheet below, unless a page is in the air being turned.
          lift: k === 0 ? s.lift.x : 1.2 + Math.sin(m.fold * Math.PI) * 60,
          back: !m.front,
          ground,
          // A sheet held up is above the flame, so the candle cannot light it.
          candle: 1 - smooth(DRAG_LIFT + 2, 54, s.lift.x),
        });
      });
    }
    const deskDim = this.poems.reduce((min, s) => Math.min(min, s.dim.x), 1);
    const tone = this.tone();
    this.renderer.render({
      width: this.vw,
      height: this.vh,
      light: lamp,
      // The lamp is already on when the page opens: the paper the server sent
      // is drawn lit (desk.css), so the first frame matches it, not dark.
      lampOn: 1,
      candle: [this.candleX, this.candleY, CANDLE_HEIGHT],
      candleOn: flame,
      deskDim: 0.55 + 0.45 * smooth(PILE_DIM, 1, deskDim),
      lampTint: [tone[0], tone[1], tone[2]],
      deskTint: [tone[3], tone[4], tone[5]],
      quads,
    });
    // Only now is there paper on the canvas to show under the text.
    if (!this.paperShown) {
      this.paperShown = true;
      this.events.onPaper(true);
    }
  }

  /* ---------------------------------------------------------------- paper */

  private startPaper() {
    try {
      this.renderer = new PaperRenderer(this.canvas);
      this.renderer.onChange = () => this.invalidate();
      this.renderer.resize(this.vw, this.vh, Math.min(window.devicePixelRatio || 1, 2));
    } catch (error) {
      this.renderer = null;
      this.events.onPaper(false);
      if (process.env.NODE_ENV !== "production") console.warn(error);
    }
  }

  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.renderer = null;
    this.paperShown = false;
    this.events.onPaper(false);
  };

  private onContextRestored = () => {
    this.startPaper();
    this.invalidate();
  };

  /* ---------------------------------------------------------------- input */

  private onResize = () => {
    this.measure();
    if (!this.lampMoved) {
      this.lampX.snap(this.restLamp()[0]);
      this.lampY.snap(this.restLamp()[1]);
    }
    this.retarget();
    this.snapAll();
    this.draw();
  };

  private onMotionChange = () => {
    this.reduced = this.motionQuery.matches;
    if (this.reduced) {
      this.lampMoved = false;
      this.lampX.snap(this.restLamp()[0]);
      this.lampY.snap(this.restLamp()[1]);
      this.snapAll();
      this.toneT = 1;
    }
    this.invalidate();
  };

  /** The lamp follows the pointer. With reduced motion it stays still. */
  private pointLamp(x: number, y: number) {
    if (this.reduced) return;
    this.lampMoved = true;
    this.lampX.target = x;
    this.lampY.target = y;
    this.invalidate();
  }

  private topPoem(): PoemState | undefined {
    return this.poems[this.view.top];
  }

  private isOnTopSheet(target: EventTarget | null): boolean {
    const top = this.topPoem();
    if (!top || !(target instanceof Element)) return false;
    return top.el.contains(target) && !!target.closest(".folha, .verso-folha, .clipe");
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!this.tilting) this.pointLamp(e.clientX, e.clientY);
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!(e.target instanceof Element) || e.target.closest("button, .comandos, .menu-selecao, .nota-margem")) return;
    const top = this.topPoem();
    if (!top || this.pendingView) return;
    const onTop = this.isOnTopSheet(e.target);

    if (this.view.picked) {
      this.backdrop = onTop ? null : { id: e.pointerId, x: e.clientX, y: e.clientY };
      // On the bare paper (not on words, which a drag selects) a mouse can
      // take the sheet by its margin and leaf it.
      this.leaf =
        onTop && e.pointerType === "mouse" && this.isBarePaper(e.target)
          ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp }
          : null;
      if (this.leaf) e.preventDefault();
      return;
    }
    if (!onTop) return;
    this.drag = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      sx: top.x.x,
      sy: top.y.x,
      t0: e.timeStamp,
      moved: false,
      lastX: e.clientX,
      lastT: e.timeStamp,
      vx: 0,
      // Grabbing low on the sheet swings it the other way, like real paper.
      grab: Math.max(-1, Math.min(1, (e.clientY - top.y.x) / (this.H * top.scale.x * 0.5))),
    };
    this.root.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.tilting && (e.pointerType === "mouse" || e.pressure > 0)) {
      this.pointLamp(e.clientX, e.clientY);
    }
    const d = this.drag;
    const top = this.topPoem();
    if (!d || d.id !== e.pointerId || !top) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) > 6) d.moved = true;
    if (!d.moved) return;
    // The last sheet has nothing under it, so it resists.
    const give = this.view.top === this.poems.length - 1 ? 0.28 : 1;
    top.x.snap(d.sx + dx * give);
    top.y.snap(d.sy + dy * give * 0.6);
    top.rot.snap((top.jitter.rot + dx * give * 0.028 * (0.4 - d.grab)) * DEG);
    top.lift.target = DRAG_LIFT;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) {
      d.vx = d.vx * 0.6 + ((e.clientX - d.lastX) / dt) * 0.4;
      d.lastX = e.clientX;
      d.lastT = e.timeStamp;
    }
    this.invalidate();
  };

  private onPointerUp = (e: PointerEvent) => {
    const l = this.leaf;
    if (l && l.id === e.pointerId) {
      this.leaf = null;
      this.leafed(e.clientX - l.x, e.clientY - l.y, e.timeStamp - l.t, 60, Infinity);
    }
    const b = this.backdrop;
    if (b && b.id === e.pointerId) {
      this.backdrop = null;
      const still = Math.hypot(e.clientX - b.x, e.clientY - b.y) < 10;
      if (still && this.view.picked && !this.isOnTopSheet(e.target)) this.events.onPutDown();
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    const top = this.topPoem();
    if (!top) return;
    if (!d.moved) {
      if (e.timeStamp - d.t0 < 700) this.events.onPickUp();
      return;
    }
    const dx = e.clientX - d.x0;
    const stale = e.timeStamp - d.lastT > 90;
    const vx = stale ? 0 : d.vx;
    const fling = Math.abs(vx) > 0.5;
    const far = Math.abs(dx) > this.W * this.pileScale * 0.3;
    const last = this.view.top === this.poems.length - 1;
    if (!last && (fling || far)) {
      top.dir = (fling ? vx : dx) > 0 ? 1 : -1;
      top.x.v = Math.max(-3200, Math.min(3200, vx * 1000));
      // Move on at once; React catches up with the same view a moment later.
      this.setView({ ...this.view, top: this.view.top + 1 });
      this.events.onDismiss();
    } else {
      this.retarget();
      this.invalidate();
    }
  };

  private onPointerCancel = (e: PointerEvent) => {
    if (this.backdrop?.id === e.pointerId) this.backdrop = null;
    if (this.leaf?.id === e.pointerId) this.leaf = null;
    if (this.drag?.id !== e.pointerId) return;
    this.drag = null;
    this.retarget();
    this.invalidate();
  };

  /**
   * Somewhere a mouse can take hold of a picked-up sheet to leaf it: the
   * margins of the front (its words are for selecting), or anywhere on the
   * back, which cannot be selected.
   */
  private isBarePaper(target: EventTarget | null): boolean {
    if (!(target instanceof Element) || target.closest("a, button, figure")) return false;
    if (target.closest(".verso-folha")) return true;
    return !target.closest(".verso, .cabecalho h2, .numeral, .rodape p, .margem, .tinta");
  }

  /**
   * A sideways movement on a picked-up sheet leafs it, if it was clearly
   * sideways, not someone selecting words, and (for a finger, which might be
   * scrolling) quick. A mouse holding the paper may take its time.
   */
  private leafed(dx: number, dy: number, ms: number, min: number, maxMs = 700) {
    // Words picked out by the drag (the back cannot be selected, but a click
    // there can still leave an empty range behind).
    const selecting = !!window.getSelection()?.toString().trim();
    if (!this.view.picked || selecting || ms > maxMs) return;
    if (Math.abs(dx) > min && Math.abs(dx) > Math.abs(dy) * 1.8) {
      this.events.onPage(dx < 0 ? 1 : -1);
    }
  }

  /** A sideways swipe on a picked-up sheet leafs it (touch). */
  private onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    this.touch =
      e.touches.length === 1 && this.view.picked && this.isOnTopSheet(e.target)
        ? { x: t.clientX, y: t.clientY, t: e.timeStamp }
        : null;
  };

  private onTouchEnd = (e: TouchEvent) => {
    const start = this.touch;
    this.touch = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    this.leafed(t.clientX - start.x, t.clientY - start.y, e.timeStamp - start.t, 56);
  };

  /**
   * A two-finger sideways swipe on a trackpad leafs a picked-up sheet once
   * per swipe: the swipe's momentum must die down before the next one counts.
   */
  private onWheel = (e: WheelEvent) => {
    if (!this.view.picked || e.ctrlKey) return;
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    // Sideways scrolling has nothing else to do on the desk.
    e.preventDefault();
    const w = this.wheel;
    if (e.timeStamp - w.t > 260) {
      w.dx = 0;
      w.spent = false;
    }
    w.t = e.timeStamp;
    if (w.spent) return;
    w.dx += e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
    if (Math.abs(w.dx) > 70) {
      w.spent = true;
      // Fingers moving left push the page on, like turning it.
      this.events.onPage(w.dx > 0 ? 1 : -1);
    }
  };

  /* ----------------------------------------------------------------- tilt */

  /**
   * On phones the lamp follows the tilt of the phone, with no switch. Android
   * just sends the readings. iOS asks the visitor first, and only in answer to
   * a tap, so there the question comes with the first tap anywhere. Until a
   * real reading arrives (or if the visitor says no) the finger leads the lamp.
   */
  private listenForTilt() {
    if (!("DeviceOrientationEvent" in window)) return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const api = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    const ask = api.requestPermission;
    if (typeof ask !== "function") {
      window.addEventListener("deviceorientation", this.onTilt);
      return;
    }
    this.askForTilt = () => {
      this.stopAskingForTilt();
      ask.call(api).then(
        (state) => {
          if (state === "granted" && !this.destroyed) {
            window.addEventListener("deviceorientation", this.onTilt);
          }
        },
        () => {},
      );
    };
    window.addEventListener("touchend", this.askForTilt);
    window.addEventListener("click", this.askForTilt);
  }

  private stopAskingForTilt() {
    if (!this.askForTilt) return;
    window.removeEventListener("touchend", this.askForTilt);
    window.removeEventListener("click", this.askForTilt);
    this.askForTilt = null;
  }

  private onTilt = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null || this.reduced) return;
    // Tilt is measured from however the phone was held at the first reading.
    if (!this.tilt) this.tilt = { beta: e.beta, gamma: e.gamma };
    this.tilting = true;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    this.pointLamp(
      this.vw / 2 + clamp((e.gamma - this.tilt.gamma) / 24) * this.vw * 0.5,
      this.pileY + clamp((e.beta - this.tilt.beta) / 24) * this.vh * 0.42,
    );
  };

  /* -------------------------------------------------------------- cleanup */

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    const { root, canvas } = this;
    root.removeEventListener("pointerdown", this.onPointerDown);
    root.removeEventListener("pointermove", this.onPointerMove);
    root.removeEventListener("pointerup", this.onPointerUp);
    root.removeEventListener("pointercancel", this.onPointerCancel);
    root.removeEventListener("touchstart", this.onTouchStart);
    root.removeEventListener("touchend", this.onTouchEnd);
    root.removeEventListener("wheel", this.onWheel);
    canvas.removeEventListener("webglcontextlost", this.onContextLost);
    canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    window.removeEventListener("deviceorientation", this.onTilt);
    this.stopAskingForTilt();
    this.motionQuery.removeEventListener("change", this.onMotionChange);
    this.resizer.disconnect();
    this.renderer?.dispose();
    this.renderer = null;
  }
}
