/**
 * Records the link previews: a short, silent video of the real desk for
 * every page (`og:video`), and one still from it (`og:image`).
 *
 *   pnpm build && pnpm start --port 3211
 *   pnpm og                      # every page, in both languages
 *   pnpm og isto                 # only some: "home" and/or poem slugs
 *
 * It opens the site in headless Chromium with a fake clock, so the engine's
 * springs, the lamp and the candle advance exactly one frame between
 * screenshots, however long each screenshot takes. The pointer is moved by
 * hand to steer the lamp. Nothing in the app knows it is being recorded:
 * the buttons are hidden with a stylesheet added to the page.
 *
 * Writes `public/og/<lang>/<name>.mp4` and `.jpg`, and lists the pages that
 * have them in `lib/og.json` (`lib/og.ts` gives a poem with none yet the home
 * preview). Run it again after adding a poem or changing how the desk looks.
 * Needs ffmpeg, and a Mac: WebGL is drawn on the GPU through Metal.
 */

import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.OG_BASE ?? "http://localhost:3211";
const OUT = path.resolve("public/og");
const MANIFEST = path.resolve("lib/og.json");
/** Each language's URL prefix, and a browser locale that `proxy.ts` leaves on it. */
const LANGS = {
  pt: { prefix: "", locale: "pt-PT" },
  en: { prefix: "/en", locale: "en-US" },
};
const W = 1200;
const H = 630;
/** Rendered at twice the size and scaled down, for clean text and edges. */
const SCALE = 2;
const FPS = 30;
const SECONDS = 6;
const FRAMES = FPS * SECONDS;
const STEP = 1000 / FPS;

// Only the desk and the logo: no tagline, no buttons, no sound or language
// switch. The layout is left as it is (the engine keeps the buttons' strip
// free, the candle sits in it); `placeLogo` then moves the logo down.
const RECORDING_CSS = `
  .mesa-topo p, .comandos, button:has(.icone-som), .mesa a[hreflang], nextjs-portal {
    display: none !important;
  }
  /* The logo now sits where a picked-up sheet rises to, and the paper is
     drawn under all the HTML: it goes at once rather than fading over it. */
  .mesa[data-pegada] .mesa-topo { opacity: 0 !important; transition: none !important; }
  * { cursor: none !important; caret-color: transparent !important; }
`;

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const lerp = (a, b, t) => a + (b - a) * t;

async function poemSlugs() {
  const files = await readdir("content/poems");
  return files.filter((f) => f.endsWith(".mdx")).map((f) => f.replace(/\.mdx$/, ""));
}

/** Where the top sheet of the pile is on screen. */
async function topSheetBox(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.poema[data-rank="topo"] .folha');
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  });
}

/** Space between the logo and the top of the pile, in CSS px. */
const LOGO_GAP = 22;

/**
 * Without the tagline, the logo alone at the top of the frame is far from
 * the pile: bring it down to sit just above the sheets.
 */
async function placeLogo(page) {
  await page.evaluate((gap) => {
    const pile = Array.from(
      document.querySelectorAll('.poema:not([data-rank="fora"]) .folha'),
    ).map((sheet) => sheet.getBoundingClientRect().top);
    const header = document.querySelector(".mesa-topo");
    const { top, bottom } = header.getBoundingClientRect();
    const y = top + Math.min(...pile) - gap - bottom;
    header.style.setProperty("top", `${y}px`, "important");
  }, LOGO_GAP);
}

/**
 * The pile, lit by a lamp that circles slowly over it. The path is a closed
 * loop and is walked once before recording, so the video loops cleanly.
 */
function homeScene() {
  return {
    path: "",
    async prepare() {},
    pointer(t, box) {
      const a = t * Math.PI * 2;
      return {
        x: box.x + Math.cos(a + 2.3) * box.w * 0.85,
        y: box.y + Math.sin(a + 2.3) * box.h * 0.32 - box.h * 0.12,
      };
    },
    preroll: true,
  };
}

/**
 * The pile with this poem on top. The lamp drifts over to it, the sheet is
 * picked up, and the lamp settles over the verses.
 */
function poemScene(slug) {
  const PICK_AT = 0.27;
  let pile;
  let pickedBox;
  return {
    path: `/poema/${slug}`,
    async prepare(page) {
      // The poem's URL opens with it picked up: put it down on the pile.
      await page.keyboard.press("Escape");
      await advance(page, 2500);
      pile = await topSheetBox(page);
    },
    pointer(t, box) {
      const start = { x: pile.x - pile.w * 1.15, y: pile.y - pile.h * 0.55 };
      if (t <= PICK_AT) {
        const k = ease(t / PICK_AT);
        return { x: lerp(start.x, pile.x, k), y: lerp(start.y, pile.y - pile.h * 0.1, k) };
      }
      const k = ease(Math.min(1, (t - PICK_AT) / (1 - PICK_AT)));
      const b = pickedBox ?? box;
      return {
        x: lerp(pile.x, b.x - b.w * 0.18, k),
        y: lerp(pile.y - pile.h * 0.1, b.y - b.h * 0.28, k),
      };
    },
    async at(page, t, frame) {
      if (frame === Math.round(PICK_AT * FRAMES)) {
        await page.mouse.down();
        await page.mouse.up();
      }
      if (frame === Math.round((PICK_AT + 0.25) * FRAMES)) {
        pickedBox = await topSheetBox(page);
      }
    },
    preroll: false,
  };
}

/**
 * Moves the page on by `ms` of fake time, a frame at a time. The fake clock
 * drives the engine; CSS transitions and animations run on the browser's own
 * clock, so they are paused and stepped here by the same amount.
 */
async function advance(page, ms) {
  for (let left = ms; left > 0; left -= STEP) {
    const step = Math.min(STEP, left);
    await page.clock.runFor(step);
    await page.evaluate((step) => {
      const seen = (window.__ogAnimations ??= new WeakMap());
      for (const animation of document.getAnimations()) {
        if (!seen.has(animation)) {
          animation.pause();
          seen.set(animation, Number(animation.currentTime) || 0);
        }
        const time = seen.get(animation) + step;
        seen.set(animation, time);
        animation.currentTime = time;
      }
    }, step);
  }
}

function encode(frameDir, file) {
  const mp4 = `${file}.mp4`;
  const args = [
    "-y",
    "-loglevel", "error",
    "-framerate", String(FPS),
    "-i", path.join(frameDir, "%04d.jpg"),
    "-vf", `scale=${W}:${H}:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "26",
    "-profile:v", "high",
    "-movflags", "+faststart",
    "-an",
    mp4,
  ];
  return run("ffmpeg", args);
}

function poster(frameDir, frame, file) {
  return run("ffmpeg", [
    "-y",
    "-loglevel", "error",
    "-i", path.join(frameDir, `${String(frame).padStart(4, "0")}.jpg`),
    "-vf", `scale=${W}:${H}:flags=lanczos`,
    "-q:v", "3",
    `${file}.jpg`,
  ]);
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)),
    );
  });
}

async function record(browser, lang, name, scene) {
  const file = path.join(OUT, lang, name);
  const frameDir = path.join(OUT, `.frames-${lang}-${name}`);
  await rm(frameDir, { recursive: true, force: true });
  await mkdir(frameDir, { recursive: true });

  const { prefix, locale } = LANGS[lang];
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: SCALE,
    reducedMotion: "no-preference",
    colorScheme: "dark",
    locale,
  });
  await page.clock.install();
  await page.goto(BASE + (prefix + scene.path || "/"), { waitUntil: "networkidle" });
  await page.addStyleTag({ content: RECORDING_CSS });
  await page.evaluate(() => document.fonts.ready);
  // Let the lamp warm up and everything settle.
  await advance(page, 2500);
  await page.mouse.move(0, 0);
  await scene.prepare(page);
  await placeLogo(page);

  const box = await topSheetBox(page);
  if (scene.preroll) {
    for (let i = 0; i < FRAMES; i++) {
      const p = scene.pointer(i / FRAMES, box);
      await page.mouse.move(p.x, p.y);
      await advance(page, STEP);
    }
  } else {
    const p = scene.pointer(0, box);
    await page.mouse.move(p.x, p.y);
    await advance(page, 1500);
  }

  for (let i = 0; i < FRAMES; i++) {
    const t = i / FRAMES;
    const p = scene.pointer(t, box);
    await page.mouse.move(p.x, p.y);
    await scene.at?.(page, t, i);
    await advance(page, STEP);
    await page.screenshot({
      path: path.join(frameDir, `${String(i).padStart(4, "0")}.jpg`),
      animations: "allow",
      quality: 95,
    });
  }
  await page.close();

  await encode(frameDir, file);
  await poster(frameDir, scene.posterFrame ?? FRAMES - 1, file);
  await rm(frameDir, { recursive: true, force: true });
  console.log(`og: ${lang}/${name}.mp4, ${lang}/${name}.jpg`);
}

const slugs = await poemSlugs();
const wanted = process.argv.slice(2);
const targets = [
  ["home", homeScene],
  ...slugs.map((slug) => [slug, () => poemScene(slug)]),
].filter(([name]) => wanted.length === 0 || wanted.includes(name));

const browser = await chromium.launch({
  // The GPU, through Metal: software WebGL takes seconds a frame.
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
try {
  for (const lang of Object.keys(LANGS)) {
    await mkdir(path.join(OUT, lang), { recursive: true });
    for (const [name, scene] of targets) await record(browser, lang, name, scene());
  }
} finally {
  await browser.close();
}

// Which pages have a preview, for `lib/og.ts`. Recording some keeps the rest.
const recorded = JSON.parse(await readFile(MANIFEST, "utf8").catch(() => "[]"));
const names = [...new Set([...recorded, ...targets.map(([name]) => name)])].sort();
await writeFile(MANIFEST, JSON.stringify(names, null, 2) + "\n");
