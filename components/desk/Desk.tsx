"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { PoemMeta } from "@/lib/poems";
import { prefs, usePrefs } from "@/lib/prefs";
import { jitterFor } from "@/lib/seed";
import { formatDate, strings as t } from "@/lib/strings";
import { DeskEngine, type View } from "./engine";
import { SelectionMenu, type SelectionMenuHandle } from "./SelectionMenu";
import { DeskSound, SOUNDS, makeNoise, playRecipe, type SoundId } from "./sound";
import "./desk.css";

export type DeskPoem = Omit<PoemMeta, "sheetCount" | "source"> & {
  sheets: ReactNode[];
};

const poemPath = (slug: string) => `/poema/${slug}`;

function slugFromPath(pathname: string): string | null {
  const match = /^\/poema\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

const noSubscription = () => () => {};

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", notify);
      return () => media.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * The desk: a pile of loose sheets, one poem each, newest marked on top.
 *
 * Every poem is a real <article> with real text in reading order. Each
 * gesture (swipe aside, pick up, turn page, flip, put down) also has a
 * labelled button and a key, so nothing depends on dragging.
 *
 * Beside the pile stands a candle (a second, warm light that can be put out),
 * and the paper makes quiet sounds that can be turned off.
 */
export function Desk({ poems }: { poems: DeskPoem[] }) {
  const total = poems.length;
  const pathname = usePathname();
  const pickedIndex = poems.findIndex(
    (poem) => poem.slug === slugFromPath(pathname),
  );
  const picked = pickedIndex >= 0;
  const pickedSlug = picked ? poems[pickedIndex].slug : null;

  // The pile position is local state; the picked-up poem lives in the URL.
  const [topState, setTop] = useState(picked ? pickedIndex : 0);
  if (picked && topState !== pickedIndex) setTop(pickedIndex);
  const top = picked ? pickedIndex : topState;

  const [side, setSide] = useState({ slug: pickedSlug, page: 0, flipped: false });
  if (side.slug !== pickedSlug) {
    setSide({ slug: pickedSlug, page: 0, flipped: false });
  }
  const page = side.slug === pickedSlug ? side.page : 0;
  const flipped = side.slug === pickedSlug ? side.flipped : false;

  const [paper, setPaper] = useState(false);
  const [tilt, setTilt] = useState<"on" | "off" | "denied">("off");
  const [message, setMessage] = useState("");

  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const canTilt = useSyncExternalStore(
    noSubscription,
    () =>
      "DeviceOrientationEvent" in window &&
      window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );

  const current = poems[top];
  const sheetCount = current.sheets.length;

  /* ----------------------------------------------------------------- sound */

  const { sound: soundOn, candle: candleLit } = usePrefs();
  const soundRef = useRef<DeskSound | null>(null);
  // Sounds only play in answer to something the visitor just did.
  const play = useCallback((id: SoundId) => {
    if (!prefs.get().sound) return;
    soundRef.current ??= new DeskSound();
    soundRef.current.play(id);
  }, []);
  useEffect(() => () => soundRef.current?.dispose(), []);

  /* --------------------------------------------------------------- actions */

  const next = useCallback(() => {
    if (picked || top >= total - 1) return;
    setTop(top + 1);
    setMessage(t.poemPosition(poems[top + 1].title, top + 2, total));
    play("slide");
  }, [picked, top, total, poems, play]);

  const previous = useCallback(() => {
    if (picked || top <= 0) return;
    setTop(top - 1);
    setMessage(t.poemPosition(poems[top - 1].title, top, total));
    play("slideBack");
  }, [picked, top, total, poems, play]);

  // Picking a sheet up gives it its own URL. Next.js keeps `usePathname` in
  // sync with history.pushState, so this never leaves the page.
  const pickUp = useCallback(
    (index: number) => {
      if (picked && index === pickedIndex) return;
      window.history.pushState(null, "", poemPath(poems[index].slug));
      play("lift");
    },
    [picked, pickedIndex, poems, play],
  );

  const putDown = useCallback(() => {
    if (!picked) return;
    window.history.pushState(null, "", "/");
    setMessage(t.putDownDone);
    play("drop");
  }, [picked, play]);

  const turn = useCallback(
    (delta: 1 | -1) => {
      if (!picked || flipped) return;
      const to = Math.max(0, Math.min(sheetCount - 1, page + delta));
      if (to === page) return;
      setSide({ slug: pickedSlug, page: to, flipped: false });
      setMessage(t.pagePosition(to + 1, sheetCount));
      play(delta > 0 ? "page" : "pageBack");
    },
    [picked, flipped, page, sheetCount, pickedSlug, play],
  );

  const flip = useCallback(() => {
    if (!picked) return;
    setSide({ slug: pickedSlug, page, flipped: !flipped });
    play("flip");
  }, [picked, pickedSlug, page, flipped, play]);

  const toggleCandle = useCallback(() => {
    const lit = !prefs.get().candle;
    prefs.set({ candle: lit });
    play(lit ? "light" : "snuff");
  }, [play]);

  const toggleSound = useCallback(() => {
    const on = !prefs.get().sound;
    prefs.set({ sound: on });
    // Turning sound on answers with a sound, so it is clear it worked.
    if (on) play("lift");
  }, [play]);

  /* ---------------------------------------------------------------- engine */

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DeskEngine | null>(null);
  const view = useMemo<View>(
    () => ({ top, picked, page, flipped }),
    [top, picked, page, flipped],
  );
  const live = useRef({ view, next, previous, pickUp, putDown, turn, top, picked });
  useEffect(() => {
    live.current = { view, next, previous, pickUp, putDown, turn, top, picked };
  });

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const engine = new DeskEngine(
      root,
      canvas,
      poems.map((poem) => ({
        slug: poem.slug,
        paper: poem.paper,
        sheets: poem.sheets.length,
      })),
      {
        onDismiss: () => live.current.next(),
        onPickUp: () => live.current.pickUp(live.current.top),
        onPutDown: () => live.current.putDown(),
        onPage: (delta) => live.current.turn(delta),
        onPaper: setPaper,
        onTilt: setTilt,
      },
      live.current.view,
    );
    engineRef.current = engine;
    if (process.env.NODE_ENV !== "production") {
      // Handy in the console while developing: window.__arca, and the
      // sound recipes for rendering them offline: window.__arcaSound
      Object.assign(window, {
        __arca: engine,
        __arcaSound: { SOUNDS, makeNoise, playRecipe },
      });
    }
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [poems]);

  useEffect(() => {
    engineRef.current?.setView(view);
  }, [view]);

  useEffect(() => {
    engineRef.current?.setCandle(candleLit);
  }, [candleLit, poems]);

  /* ----------------------------------------------------------------- focus */

  const headings = useRef(new Map<string, HTMLElement>());
  const backHeadings = useRef(new Map<string, HTMLElement>());
  const pickUpButton = useRef<HTMLButtonElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const menu = useRef<SelectionMenuHandle>(null);
  // The poem whose verses the selection menu acts on (the front of a held sheet).
  const reading = useMemo(
    () => (picked && !flipped ? { slug: current.slug, title: current.title } : null),
    [picked, flipped, current.slug, current.title],
  );
  const before = useRef({ pickedSlug, flipped });

  useEffect(() => {
    const was = before.current;
    before.current = { pickedSlug, flipped };
    const focus = (el?: HTMLElement | null) => el?.focus({ preventScroll: true });
    if (was.pickedSlug !== pickedSlug) {
      // Picked up: go to the poem. Put down: back to where it was picked up.
      if (pickedSlug) focus(headings.current.get(pickedSlug));
      else focus(pickUpButton.current);
    } else if (was.flipped !== flipped && pickedSlug) {
      focus((flipped ? backHeadings : headings).current.get(pickedSlug));
    }
  }, [pickedSlug, flipped]);

  useEffect(() => {
    document.title = picked ? t.pageTitle(current.title) : t.siteTitle;
  }, [picked, current.title]);

  /* ------------------------------------------------------------------ keys */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const el = event.target as HTMLElement | null;
      if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? "")) {
        return;
      }
      const now = live.current;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          if (now.picked) now.turn(1);
          else now.next();
          break;
        case "ArrowLeft":
        case "ArrowUp":
          if (now.picked) now.turn(-1);
          else now.previous();
          break;
        case "Escape":
          if (!now.picked) return;
          now.putDown();
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------------------------------------------------------------- render */

  return (
    <div
      className="mesa"
      ref={rootRef}
      data-papel={paper ? "on" : "off"}
      data-pegada={picked || undefined}
    >
      <canvas className="mesa-papel" ref={canvasRef} aria-hidden="true" />

      <header className="mesa-topo">
        <h1>{t.siteTitle}</h1>
        <p>{t.tagline}</p>
      </header>

      <main>
        <section className="pilha" aria-label={t.pileLabel}>
          {poems.map((poem, i) => {
            const rank = i - top;
            const isPicked = picked && rank === 0;
            const count = poem.sheets.length;
            const jitter = jitterFor(poem.slug);
            return (
              <article
                key={poem.slug}
                className={`poema papel-${poem.paper}`}
                aria-labelledby={`titulo-${poem.slug}`}
                data-rank={rank < 0 ? "fora" : rank === 0 ? "topo" : "baixo"}
                data-pegado={isPicked || undefined}
                data-virado={(isPicked && flipped) || undefined}
                inert={picked && !isPicked}
                style={
                  {
                    "--rot": `${jitter.rot}deg`,
                    "--jx": `${jitter.dx}px`,
                    "--jy": `${jitter.dy}px`,
                    zIndex: total - i,
                  } as CSSProperties
                }
              >
                {poem.sheets.map((sheet, j) => (
                  <div
                    className="folha"
                    key={j}
                    data-passada={(isPicked && j < page) || undefined}
                    inert={isPicked && flipped}
                    style={{ "--j": j, zIndex: count - j } as CSSProperties}
                  >
                    <div className="folha-conteudo">
                      {j === 0 && (
                        <div className="cabecalho">
                          {poem.numeral && <p className="numeral">{poem.numeral}</p>}
                          <h2
                            id={`titulo-${poem.slug}`}
                            tabIndex={-1}
                            ref={(el) => {
                              if (el) headings.current.set(poem.slug, el);
                              else headings.current.delete(poem.slug);
                            }}
                          >
                            {isPicked ? (
                              poem.title
                            ) : (
                              <a
                                href={poemPath(poem.slug)}
                                tabIndex={rank === 0 ? 0 : -1}
                                draggable={false}
                                onClick={(event) => {
                                  event.preventDefault();
                                  pickUp(i);
                                }}
                              >
                                {poem.title}
                              </a>
                            )}
                          </h2>
                        </div>
                      )}
                      <div className="versos">{sheet}</div>
                      <div className="rodape">
                        {j === 0 && (
                          <>
                            <p className="marcado">
                              {t.markedOn}{" "}
                              <time dateTime={poem.markedAt}>
                                {formatDate(poem.markedAt)}
                              </time>
                            </p>
                            <p className="livro">
                              {t.author}, <cite>{t.bookName[poem.book]}</cite>
                            </p>
                          </>
                        )}
                        {count > 1 && (
                          <p className="folio">
                            <span aria-hidden="true">{j + 1}</span>
                            <span className="sr-only">
                              {t.pagePosition(j + 1, count)}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                <section
                  className="verso-folha"
                  aria-labelledby={`verso-${poem.slug}`}
                  inert={!(isPicked && flipped)}
                >
                  <div className="verso-conteudo">
                    <h3
                      id={`verso-${poem.slug}`}
                      tabIndex={-1}
                      ref={(el) => {
                        if (el) backHeadings.current.set(poem.slug, el);
                        else backHeadings.current.delete(poem.slug);
                      }}
                    >
                      <span className="sr-only">{t.backPrefix} </span>
                      {poem.title}
                    </h3>
                    <p className="verso-data">
                      {t.markedOn}{" "}
                      <time dateTime={poem.markedAt}>{formatDate(poem.markedAt)}</time>
                    </p>
                    <h4>{t.wordsHeading}</h4>
                    <dl className="palavras">
                      {poem.words.map((entry, k) => (
                        <div key={k}>
                          <dt>{entry.word}</dt>
                          <dd>{entry.meaning}</dd>
                        </div>
                      ))}
                    </dl>
                    <h4>{t.reflectionHeading}</h4>
                    <p className="reflexao">{poem.reflection}</p>
                  </div>
                </section>

                {count > 1 && (
                  <span className="clipe" aria-hidden="true">
                    <svg viewBox="0 0 28 78" focusable="false">
                      <path
                        className="clipe-arame"
                        d="M20 24 V60 a7.5 7.5 0 0 1 -15 0 V13 a5.5 5.5 0 0 1 11 0 V56 a2.2 2.2 0 0 1 -4.4 0 V24"
                      />
                      <path
                        className="clipe-brilho"
                        d="M20 24 V60 a7.5 7.5 0 0 1 -15 0 V13 a5.5 5.5 0 0 1 11 0 V56 a2.2 2.2 0 0 1 -4.4 0 V24"
                      />
                    </svg>
                  </span>
                )}
              </article>
            );
          })}
        </section>

        <div className="comandos" role="group" aria-label={t.controlsLabel}>
          {!picked ? (
            <>
              <div className="comandos-grupo">
                <DeskButton onPress={previous} disabled={top === 0}>
                  <span aria-hidden="true">←</span> {t.previousPoem}
                </DeskButton>
                <p className="posicao">
                  <span aria-hidden="true">{t.pageShort(top + 1, total)}</span>
                  <span className="sr-only">{t.poemCount(top + 1, total)}</span>
                </p>
                <DeskButton onPress={next} disabled={top === total - 1}>
                  {t.nextPoem} <span aria-hidden="true">→</span>
                </DeskButton>
              </div>
              <div className="comandos-grupo">
                <DeskButton primary ref={pickUpButton} onPress={() => pickUp(top)}>
                  {t.pickUp}
                </DeskButton>
              </div>
            </>
          ) : (
            <>
              {sheetCount > 1 && (
                <div className="comandos-grupo">
                  <DeskButton onPress={() => turn(-1)} disabled={flipped || page === 0}>
                    <span aria-hidden="true">←</span> {t.previousPage}
                  </DeskButton>
                  <p className="posicao">
                    <span aria-hidden="true">{t.pageShort(page + 1, sheetCount)}</span>
                    <span className="sr-only">
                      {t.pagePosition(page + 1, sheetCount)}
                    </span>
                  </p>
                  <DeskButton
                    onPress={() => turn(1)}
                    disabled={flipped || page === sheetCount - 1}
                  >
                    {t.nextPage} <span aria-hidden="true">→</span>
                  </DeskButton>
                </div>
              )}
              <div className="comandos-grupo">
                {!flipped && (
                  <DeskButton
                    ref={moreButton}
                    onPress={() => {
                      if (moreButton.current) menu.current?.toggleForSheet(moreButton.current);
                    }}
                  >
                    {t.moreActions}
                  </DeskButton>
                )}
                <DeskButton onPress={flip}>{flipped ? t.seeFront : t.seeBack}</DeskButton>
                <DeskButton primary onPress={putDown}>
                  {t.putDown}
                </DeskButton>
              </div>
            </>
          )}
        </div>

        {/* The candle is a real object on the desk and a real button: it
            keeps flickering, so there has to be a way to put it out. */}
        <button
          type="button"
          className="vela"
          data-acesa={candleLit}
          aria-label={candleLit ? t.candleOff : t.candleOn}
          title={candleLit ? t.candleOff : t.candleOn}
          onClick={toggleCandle}
        >
          <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <defs>
              <radialGradient id="vela-cera" cx="50%" cy="44%" r="58%">
                <stop offset="0" stopColor="#fff6dd" />
                <stop offset="0.5" stopColor="#f1e4c4" />
                <stop offset="1" stopColor="#cdb98e" />
              </radialGradient>
              <radialGradient id="vela-poca" cx="50%" cy="45%" r="60%">
                <stop offset="0" stopColor="#f6e6bd" />
                <stop offset="1" stopColor="#dcc796" />
              </radialGradient>
              <radialGradient id="vela-halo">
                <stop offset="0" stopColor="#ffd98a" stopOpacity="0.95" />
                <stop offset="0.45" stopColor="#ffb14a" stopOpacity="0.45" />
                <stop offset="1" stopColor="#ff9a2e" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="vela-fogo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ffb347" />
                <stop offset="0.6" stopColor="#ffe9a8" />
                <stop offset="1" stopColor="#fffaf0" />
              </linearGradient>
            </defs>
            <circle className="vela-corpo" cx="50" cy="50" r="33" fill="url(#vela-cera)" />
            <circle cx="50" cy="50" r="32.4" fill="none" stroke="#8a6c3c" strokeOpacity="0.35" strokeWidth="1.2" />
            <circle cx="50" cy="51" r="14" fill="url(#vela-poca)" />
            <circle className="vela-halo" cx="50" cy="48" r="30" fill="url(#vela-halo)" />
            <path d="M50 51 V45.5" stroke="#2b1c10" strokeWidth="1.7" strokeLinecap="round" />
            <path
              className="vela-chama"
              d="M50 29 C56.5 37.5 57 43 50 47.5 C43 43 43.5 37.5 50 29 Z"
              fill="url(#vela-fogo)"
            />
          </svg>
        </button>

        {canTilt && !reducedMotion && (
          <div className="canto canto-esquerdo">
            <DeskButton
              quiet
              onPress={() => {
                if (tilt === "on") engineRef.current?.disableTilt();
                else void engineRef.current?.enableTilt();
              }}
            >
              {tilt === "on" ? t.tiltOff : t.tiltOn}
            </DeskButton>
          </div>
        )}

        <div className="canto canto-direito">
          <DeskButton quiet onPress={toggleSound}>
            {soundOn ? t.soundOff : t.soundOn}
          </DeskButton>
        </div>

        <SelectionMenu
          ref={menu}
          rootRef={rootRef}
          poem={reading}
          page={page}
        />

        <p className="sr-only" role="status" aria-live="polite">
          {tilt === "denied" ? t.tiltDenied : message}
        </p>
      </main>
    </div>
  );
}

/**
 * A desk button. Unavailable buttons use `aria-disabled` rather than
 * `disabled` so keyboard focus is never thrown away when the end of the pile
 * is reached.
 */
function DeskButton({
  onPress,
  disabled,
  primary,
  quiet,
  ref,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  quiet?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      ref={ref}
      className="botao"
      data-variante={primary ? "principal" : quiet ? "discreto" : undefined}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onPress();
      }}
    >
      {children}
    </button>
  );
}
