import { PAPERS, type PaperId, type PaperMaterial } from "@/lib/papers";
import {
  BAKE_PAPER_FRAG,
  BAKE_VERT,
  BAKE_WOOD_FRAG,
  DESK_FRAG,
  DESK_VERT,
  QUAD_VERT,
  SHADOW_FRAG,
  SHEET_FRAG,
} from "./shaders";

/**
 * The paper layer: one WebGL canvas under the HTML text that draws the desk,
 * every sheet of paper and their shadows, lit by the lamp.
 *
 * It knows nothing about poems. Each frame the engine hands it a list of
 * quads (already in draw order) and the lamp position.
 */

/** A 4×4 matrix, column-major, exactly as CSS `matrix3d()` takes it. */
export type Mat4 = number[];

export type SheetQuad = {
  /** Local px (origin at the sheet centre) → css px, perspective included. */
  screen: Mat4;
  /** Local px → world px (no perspective). */
  world: Mat4;
  halfW: number;
  halfH: number;
  paper: PaperId;
  /** 0..1, stable per sheet: drives every per-sheet variation. */
  seed: number;
  alpha: number;
  dim: number;
  /** Height above the desk in px: sets the shadow's reach and softness. */
  lift: number;
  /** True when the viewer sees the back of this sheet. */
  back: boolean;
  /** Draw a wide, soft contact shadow under this sheet as well. */
  ground: boolean;
};

export type Frame = {
  width: number;
  height: number;
  light: [number, number, number];
  lampOn: number;
  deskDim: number;
  quads: SheetQuad[];
};

type Material = { albedo: WebGLTexture; relief: WebGLTexture };

type Program = {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
};

/** One paper tile covers this many local px of a sheet. */
const PAPER_TILE_PX = 640;
/** One wood tile covers this many css px of desk. */
const WOOD_TILE_PX = 1500;

const frac = (n: number) => n - Math.floor(n);
/** Cheap deterministic stream of numbers from one seed. */
const rand = (seed: number, salt: number) =>
  frac(Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453);

export class PaperRenderer {
  private gl: WebGL2RenderingContext;
  private quadVao: WebGLVertexArrayObject;
  private desk: Program;
  private sheet: Program;
  private shadow: Program;
  private wood: Material;
  private papers = new Map<PaperId, Material>();
  private dpr = 1;
  private width = 0;
  private height = 0;

  /** Throws when WebGL2 is unavailable; the caller falls back to flat CSS paper. */
  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;

    const buffer = gl.createBuffer();
    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.desk = this.link(DESK_VERT, DESK_FRAG);
    this.sheet = this.link(QUAD_VERT, SHEET_FRAG);
    this.shadow = this.link(QUAD_VERT, SHADOW_FRAG);

    // Big sheets on dense screens get the larger bake.
    const large =
      Math.min(window.innerWidth, window.innerHeight) > 600 &&
      (window.devicePixelRatio || 1) > 1.25;
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const paperSize = Math.min(large ? 2048 : 1024, maxSize);
    const woodSize = Math.min(large ? 2048 : 1024, maxSize);

    this.wood = this.bake(BAKE_WOOD_FRAG, woodSize, {});
    for (const id of Object.keys(PAPERS) as PaperId[]) {
      const material = PAPERS[id];
      this.papers.set(
        id,
        this.bake(BAKE_PAPER_FRAG, paperSize, { uKind: material.procedural }),
      );
      if (material.scan) this.loadScan(id, material);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  private link(vertSource: string, fragSource: string): Program {
    const gl = this.gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader failed to compile: ${log}`);
      }
      return shader;
    };
    const program = gl.createProgram()!;
    const vert = compile(gl.VERTEX_SHADER, vertSource);
    const frag = compile(gl.FRAGMENT_SHADER, fragSource);
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.bindAttribLocation(program, 0, "aPos");
    gl.linkProgram(program);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program failed to link: ${gl.getProgramInfoLog(program)}`);
    }
    const uniforms: Program["uniforms"] = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      if (info) uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    return { program, uniforms };
  }

  private texture(size: number): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(
      gl.TEXTURE_2D,
      Math.floor(Math.log2(size)) + 1,
      gl.RGBA8,
      size,
      size,
    );
    this.sampling();
    return texture;
  }

  private sampling() {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  /** Runs a generator once and keeps its albedo and relief maps. */
  private bake(
    fragSource: string,
    size: number,
    uniforms: Record<string, number>,
  ): Material {
    const gl = this.gl;
    const program = this.link(BAKE_VERT, fragSource);
    const albedo = this.texture(size);
    const relief = this.texture(size);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, albedo, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, relief, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, size, size);
    gl.disable(gl.BLEND);
    gl.useProgram(program.program);
    gl.uniform1f(program.uniforms.uTexel, 1 / size);
    for (const [name, value] of Object.entries(uniforms)) {
      gl.uniform1f(program.uniforms[name], value);
    }
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteProgram(program.program);
    for (const texture of [albedo, relief]) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    return { albedo, relief };
  }

  /** Swaps a paper's procedural maps for scanned ones once they have loaded. */
  private loadScan(id: PaperId, material: PaperMaterial) {
    const gl = this.gl;
    const load = (url: string) =>
      new Promise<WebGLTexture>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const texture = gl.createTexture()!;
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          this.sampling();
          gl.generateMipmap(gl.TEXTURE_2D);
          resolve(texture);
        };
        image.onerror = reject;
        image.src = url;
      });
    Promise.all([load(material.scan!.albedo), load(material.scan!.relief)])
      .then(([albedo, relief]) => {
        this.papers.set(id, { albedo, relief });
        this.onChange?.();
      })
      .catch(() => {
        // Keep the procedural paper if a scan fails to load.
      });
  }

  /** Called when textures change after start-up, so the engine can redraw. */
  onChange?: () => void;

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(frame: Frame) {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    const falloff = Math.max(620, Math.min(this.width, this.height) * 0.95);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindVertexArray(this.quadVao);

    // The desk.
    gl.disable(gl.BLEND);
    gl.useProgram(this.desk.program);
    const du = this.desk.uniforms;
    gl.uniform2f(du.uViewport, this.width, this.height);
    gl.uniform1f(du.uDpr, this.dpr);
    gl.uniform1f(du.uTilePx, WOOD_TILE_PX);
    gl.uniform1f(du.uDim, frame.deskDim);
    gl.uniform3fv(du.uLight, frame.light);
    gl.uniform1f(du.uLampOn, frame.lampOn);
    gl.uniform1f(du.uFalloff, falloff);
    this.bind(this.wood, du);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Sheets, bottom to top, each over its own shadow.
    gl.enable(gl.BLEND);
    for (const quad of frame.quads) {
      if (quad.alpha <= 0.002) continue;
      this.drawShadow(quad, frame);
      this.drawSheet(quad, frame, falloff);
    }
  }

  private bind(material: Material, uniforms: Program["uniforms"]) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, material.albedo);
    gl.uniform1i(uniforms.uAlbedo, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, material.relief);
    gl.uniform1i(uniforms.uRelief, 1);
  }

  private drawShadow(quad: SheetQuad, frame: Frame) {
    const gl = this.gl;
    const u = this.shadow.uniforms;
    gl.useProgram(this.shadow.program);
    gl.uniform2f(u.uViewport, this.width, this.height);
    gl.uniform2f(u.uHalf, quad.halfW, quad.halfH);
    gl.uniformMatrix4fv(u.uWorld, false, quad.world);

    // The shadow slides away from the lamp, further the higher the sheet is.
    const [lx, ly, lz] = frame.light;
    const cx = quad.world[12];
    const cy = quad.world[13];
    const reach = quad.lift / Math.max(lz - quad.lift, 60);
    const ox = Math.max(-70, Math.min(70, (cx - lx) * reach));
    const oy = Math.max(-70, Math.min(70, (cy - ly) * reach));
    const scale = Math.hypot(quad.world[0], quad.world[1]) || 1;

    const passes: [blur: number, strength: number, spread: number][] = [
      [2.2 + quad.lift * 0.38, 0.5 / (1 + quad.lift * 0.012), 1],
    ];
    if (quad.ground) passes.unshift([34 + quad.lift * 0.3, 0.3, 0.4]);

    for (const [blur, strength, spread] of passes) {
      const s = quad.screen.slice();
      // Pre-multiply by a screen-space translation (works with perspective too).
      const tx = ox * spread;
      const ty = oy * spread + (spread < 1 ? 6 : 0);
      for (let col = 0; col < 4; col++) {
        s[col * 4] += tx * s[col * 4 + 3];
        s[col * 4 + 1] += ty * s[col * 4 + 3];
      }
      gl.uniformMatrix4fv(u.uScreen, false, s);
      gl.uniform1f(u.uMargin, blur / scale + 2);
      gl.uniform1f(u.uBlur, blur / scale);
      gl.uniform1f(u.uStrength, strength * quad.alpha * (0.4 + 0.6 * frame.lampOn));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  private drawSheet(quad: SheetQuad, frame: Frame, falloff: number) {
    const gl = this.gl;
    const material = PAPERS[quad.paper];
    const maps = this.papers.get(quad.paper)!;
    const u = this.sheet.uniforms;
    // The back of a sheet is its own surface: different patch, different seed.
    const seed = quad.back ? frac(quad.seed + 0.37) : quad.seed;

    gl.useProgram(this.sheet.program);
    gl.uniform2f(u.uViewport, this.width, this.height);
    gl.uniform2f(u.uHalf, quad.halfW, quad.halfH);
    gl.uniform1f(u.uMargin, 2);
    gl.uniformMatrix4fv(u.uScreen, false, quad.screen);
    gl.uniformMatrix4fv(u.uWorld, false, quad.world);
    const w = quad.world;
    gl.uniformMatrix3fv(u.uNrm, false, [w[0], w[1], w[2], w[4], w[5], w[6], w[8], w[9], w[10]]);

    gl.uniform4f(
      u.uUv,
      rand(seed, 1),
      rand(seed, 2),
      1 / PAPER_TILE_PX,
      rand(seed, 3) > 0.5 ? 1 : -1,
    );
    const shade = 0.975 + 0.05 * rand(seed, 4);
    const warmth = (rand(seed, 5) - 0.5) * 0.03;
    gl.uniform3f(u.uTint, shade + warmth, shade, shade - warmth);
    gl.uniform1f(u.uSeed, seed);
    gl.uniform1f(u.uReliefK, material.relief);
    gl.uniform1f(u.uDeckle, material.deckle);
    gl.uniform1f(u.uBevel, material.bevel);
    gl.uniform1f(u.uAge, material.age * (0.75 + 0.5 * rand(seed, 6)));

    const creased = rand(quad.seed, 7) < material.creaseChance;
    const side = quad.back ? -1 : 1;
    gl.uniform4f(
      u.uCrease,
      (rand(quad.seed, 8) - 0.5) * quad.halfH * 0.16,
      creased ? side * (0.55 + 0.4 * rand(quad.seed, 9)) : 0,
      (rand(quad.seed, 10) - 0.5) * quad.halfW * 0.2,
      creased && rand(quad.seed, 11) > 0.6 ? side * 0.35 : 0,
    );

    gl.uniform1f(u.uDim, quad.dim);
    gl.uniform1f(u.uAlpha, quad.alpha);
    gl.uniform1f(u.uBack, quad.back ? 1 : 0);
    gl.uniform3fv(u.uLight, frame.light);
    gl.uniform1f(u.uLampOn, frame.lampOn);
    gl.uniform1f(u.uFalloff, falloff);
    this.bind(maps, u);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  get lost() {
    return this.gl.isContextLost();
  }

  /** Frees GPU objects but keeps the context, so the canvas can be reused. */
  dispose() {
    const gl = this.gl;
    for (const program of [this.desk, this.sheet, this.shadow]) {
      gl.deleteProgram(program.program);
    }
    for (const material of [this.wood, ...this.papers.values()]) {
      gl.deleteTexture(material.albedo);
      gl.deleteTexture(material.relief);
    }
    this.papers.clear();
  }
}
