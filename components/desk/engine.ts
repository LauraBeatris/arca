import type { PaperId } from "@/lib/papers";
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

export type EnginePoem = { slug: string; paper: PaperId; sheets: number };

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
  /** A picked-up, clipped poem was swiped sideways. */
  onPage(delta: 1 | -1): void;
  /** WebGL paper became available or was lost. */
  onPaper(ready: boolean): void;
  onTilt(state: "on" | "off" | "denied"): void;
};

const DEG = Math.PI / 180;
const PERSPECTIVE = 2600;
const LAMP_HEIGHT = 300;
const REST_LIFT = 2;
const DRAG_LIFT = 16;
const PICKED_LIFT = 90;
const PILE_DIM = 0.36;
/** Where the clip grips the sheets, as fractions of the sheet size. */
const CLIP_X = 0.13;

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
  private styles = new WeakMap<HTMLElement, Record<string, string>>();
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
  private lampOn = 0;
  private lampMoved = false;
  private fade = 1;
  private fadeDir = 0;

  private drag: Drag | null = null;
  private backdrop: { id: number; x: number; y: number } | null = null;
  private touch: { x: number; y: number; t: number } | null = null;
  private reduced: boolean;
  private motionQuery: MediaQueryList;
  private resizer: ResizeObserver;
  private tilt: { beta: number; gamma: number } | null = null;
  private tilting = false;

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
        dir: i % 2 === 0 ? 1 : -1,
        mats: [],
        base: [],
        onScreen: true,
        flippedOver: false,
      };
    });

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
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    this.motionQuery.addEventListener("change", this.onMotionChange);
    this.resizer = new ResizeObserver(this.onResize);
    this.resizer.observe(root);

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
    const top = parseFloat(style.getPropertyValue("--topo")) || 64;
    const bar = parseFloat(style.getPropertyValue("--barra")) || 96;
    const sheet = this.poems[0]?.sheetEls[0];
    this.W = sheet?.offsetWidth || 400;
    this.H = sheet?.offsetHeight || 568;
    this.pileScale = Math.min(
      this.vw < 640 ? 0.9 : 0.8,
      (this.vh - top - bar - 12) / this.H,
      (this.vw - 28) / this.W,
    );
    this.pileX = this.vw / 2;
    this.pileY = top + (this.vh - top - bar) / 2;
    // Land the picked-up sheet on whole pixels so its text stays sharp.
    this.pickedY =
      Math.round(Math.max(8, (this.vh - bar - this.H) / 2 + 4)) + this.H / 2;
    this.renderer?.resize(
      this.vw,
      this.vh,
      Math.min(window.devicePixelRatio || 1, 2),
    );
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
    }

    if (this.renderer && this.lampOn < 1) {
      this.lampOn = this.reduced ? 1 : Math.min(1, this.lampOn + dt / 1.1);
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

    this.draw();
    if (active || this.drag) this.raf = requestAnimationFrame(this.frame);
  };

  /* ----------------------------------------------------------------- draw */

  private set(el: HTMLElement, prop: string, value: string) {
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
        });
      });
    }
    const deskDim = this.poems.reduce((min, s) => Math.min(min, s.dim.x), 1);
    this.renderer.render({
      width: this.vw,
      height: this.vh,
      light: lamp,
      lampOn: this.lampOn,
      deskDim: 0.55 + 0.45 * smooth(PILE_DIM, 1, deskDim),
      quads,
    });
  }

  /* ---------------------------------------------------------------- paper */

  private startPaper() {
    try {
      this.renderer = new PaperRenderer(this.canvas);
      this.renderer.onChange = () => this.invalidate();
      this.renderer.resize(this.vw, this.vh, Math.min(window.devicePixelRatio || 1, 2));
      if (this.reduced) this.lampOn = 1;
      this.events.onPaper(true);
    } catch (error) {
      this.renderer = null;
      this.events.onPaper(false);
      if (process.env.NODE_ENV !== "production") console.warn(error);
    }
  }

  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.renderer = null;
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
      this.lampOn = this.renderer ? 1 : 0;
      this.lampMoved = false;
      this.lampX.snap(this.restLamp()[0]);
      this.lampY.snap(this.restLamp()[1]);
      this.snapAll();
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
    if (!(e.target instanceof Element) || e.target.closest(".comandos, .mesa-topo")) return;
    const top = this.topPoem();
    if (!top || this.pendingView) return;
    const onTop = this.isOnTopSheet(e.target);

    if (this.view.picked) {
      this.backdrop = onTop ? null : { id: e.pointerId, x: e.clientX, y: e.clientY };
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
    if (this.drag?.id !== e.pointerId) return;
    this.drag = null;
    this.retarget();
    this.invalidate();
  };

  /** Sideways swipe on a picked-up, clipped poem turns its pages (touch only). */
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
    const top = this.topPoem();
    const t = e.changedTouches[0];
    if (!start || !t || !top || top.poem.sheets < 2 || this.view.flipped) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const quick = e.timeStamp - start.t < 600;
    const selecting = !window.getSelection()?.isCollapsed;
    if (quick && !selecting && Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 2) {
      this.events.onPage(dx < 0 ? 1 : -1);
    }
  };

  /* ----------------------------------------------------------------- tilt */

  /** Must be called from a tap: iOS only grants motion access on a gesture. */
  async enableTilt() {
    if (this.reduced) return;
    type Permissioned = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    const api = window.DeviceOrientationEvent as Permissioned | undefined;
    if (!api) return this.events.onTilt("denied");
    try {
      if (typeof api.requestPermission === "function") {
        if ((await api.requestPermission()) !== "granted") {
          return this.events.onTilt("denied");
        }
      }
    } catch {
      return this.events.onTilt("denied");
    }
    this.tilt = null;
    this.tilting = true;
    window.addEventListener("deviceorientation", this.onTilt);
    this.events.onTilt("on");
  }

  disableTilt() {
    this.tilting = false;
    window.removeEventListener("deviceorientation", this.onTilt);
    this.events.onTilt("off");
  }

  private onTilt = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null || this.reduced) return;
    // Tilt is measured from however the phone was held when tilt was turned on.
    if (!this.tilt) this.tilt = { beta: e.beta, gamma: e.gamma };
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
    canvas.removeEventListener("webglcontextlost", this.onContextLost);
    canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    window.removeEventListener("deviceorientation", this.onTilt);
    this.motionQuery.removeEventListener("change", this.onMotionChange);
    this.resizer.disconnect();
    this.renderer?.dispose();
    this.renderer = null;
  }
}
