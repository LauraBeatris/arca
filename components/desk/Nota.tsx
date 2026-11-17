"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useStrings } from "@/components/Lingua";

/**
 * Margin notes: a word Laura marked with a note (`<Mark note="…">` in a
 * poem) is a button in the verse; pressing it opens the note on a slip of
 * paper in the margin beside the line, or rising from the bottom of the
 * screen on phones and touch screens.
 *
 * There is one slip for the whole desk, and it lives outside the verse, so
 * selecting, translating, sharing or copying lines never takes the note
 * along with them.
 */

const SLIP_ID = "nota-margem";
const GAP = 18;
const EDGE = 12;
const SLIP_WIDTH = 248;
/** Phones, tablets and narrow windows: the slip rises from the bottom. */
const BOTTOM_QUERY = "(max-width: 719px), (pointer: coarse)";

type OpenNote = {
  id: string;
  word: string;
  note: string;
  button: HTMLButtonElement;
  /** Opened from the keyboard: no entrance. */
  instant: boolean;
};

/* ------------------------------------------------------------------ store */

let open: OpenNote | null = null;
/** The slip on its way out after a pointer closed it (keys close at once). */
let leaving: OpenNote | null = null;
/** The marks on the page being read: the only ones that can be pressed. */
let live = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

const notes = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  current: () => open,
  leaving: () => leaving,
  isOpen: (id: string) => open?.id === id,
  isLive: (id: string) => live.has(id),
  toggle(next: OpenNote) {
    if (open?.id === next.id) return notes.close(false, !next.instant);
    open = next;
    leaving = null;
    emit();
  },
  /** `gently`: the slip leaves the way it came (a pointer closed it). */
  close(returnFocus: boolean, gently = false) {
    const was = open;
    if (!was) return;
    open = null;
    leaving = gently ? was : null;
    emit();
    if (returnFocus && was.button.isConnected) was.button.focus({ preventScroll: true });
  },
  /** The slip has left. */
  gone(note: OpenNote) {
    if (leaving !== note) return;
    leaving = null;
    emit();
  },
  setLive(ids: Set<string>) {
    live = ids;
    if (open && !ids.has(open.id)) open = null;
    emit();
  },
};

const never = () => false;
const nothing = () => null;

/* ------------------------------------------------------------------- mark */

/**
 * A marked word that carries a note. Rendered by `Mark` in components/mdx.tsx;
 * a mark without a note is only the ink and never reaches this file.
 */
export function NotedMark({
  word,
  note,
  como,
  ink,
  children,
}: {
  word: string;
  note: string;
  /** How the word is marked: underlined or circled (see Mao.tsx). */
  como: string;
  /** The pen's mark, drawn around the word. */
  ink: ReactNode;
  children: ReactNode;
}) {
  const t = useStrings();
  const id = useId();
  const isLive = useSyncExternalStore(notes.subscribe, () => notes.isLive(id), never);
  const expanded = useSyncExternalStore(notes.subscribe, () => notes.isOpen(id), never);
  return (
    <button
      type="button"
      className="tinta tinta-nota"
      lang={t.lang}
      aria-label={t.noteOn(word)}
      aria-expanded={expanded}
      aria-controls={SLIP_ID}
      // Only the marks on the page being read are in the tab order; on the
      // pile the word is just part of a sheet you can drag.
      tabIndex={isLive ? 0 : -1}
      data-nota-id={id}
      data-como={como}
      data-viva={isLive || undefined}
      onClick={(event) => {
        if (!notes.isLive(id)) return;
        notes.toggle({
          id,
          word,
          note,
          button: event.currentTarget,
          // A click with detail 0 came from Enter or Space.
          instant: event.detail === 0,
        });
      }}
    >
      <span lang="pt">{children}</span>
      {ink}
    </button>
  );
}

/* ------------------------------------------------------------------- slip */

type Spot =
  | { mode: "margem"; x: number; y: number; side: "right" | "left" }
  | { mode: "baixo" };

/** Where the slip stands, and for which note it was measured. */
type Place = Spot & { for: OpenNote };

/**
 * The slip. `poem` and `page` say which sheet is being read (the front of a
 * picked-up poem); when they change, or the sheet is put down or turned over,
 * the slip closes.
 */
export function MarginNote({
  rootRef,
  poem,
  page,
}: {
  rootRef: React.RefObject<HTMLElement | null>;
  poem: { slug: string } | null;
  page: number;
}) {
  const t = useStrings();
  const note = useSyncExternalStore(notes.subscribe, notes.current, nothing);
  const leaving = useSyncExternalStore(notes.subscribe, notes.leaving, nothing);
  // Closed by a pointer, the slip stays where it stood while it leaves.
  const shown = note ?? leaving;
  const exiting = !note && !!leaving;
  const slipRef = useRef<HTMLDivElement>(null);
  const [measured, setPlace] = useState<Place | null>(null);
  const place = measured && measured.for === shown ? measured : null;
  const slug = poem?.slug ?? null;

  // The marks on the sheet in view become pressable; any other slip closes.
  useEffect(() => {
    const sheet = slug
      ? rootRef.current
          ?.querySelector(".poema[data-pegado]")
          ?.querySelectorAll(".folha")[page]
      : null;
    const ids = new Set<string>();
    sheet?.querySelectorAll<HTMLElement>("[data-nota-id]").forEach((el) => {
      if (el.dataset.notaId) ids.add(el.dataset.notaId);
    });
    notes.setLive(ids);
  }, [rootRef, slug, page]);

  useEffect(() => () => notes.setLive(new Set()), []);

  /* ------------------------------------------------------------- placing */

  // The sheet can still be settling when the slip opens, so it follows the
  // word until it closes. Cheap: two rectangles a frame, and no render unless
  // something moved.
  useLayoutEffect(() => {
    const slip = slipRef.current;
    if (!note || !slip) return;
    let frame = 0;
    let last = "";
    const measure = () => {
      frame = requestAnimationFrame(measure);
      const sheet = note.button.closest(".folha");
      if (!sheet) return;
      const word = note.button.getBoundingClientRect();
      const paper = sheet.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let next: Spot = { mode: "baixo" };
      if (!window.matchMedia(BOTTOM_QUERY).matches) {
        const height = slip.offsetHeight;
        const y = Math.round(
          Math.min(Math.max(EDGE, word.top - 12), vh - EDGE - height),
        );
        // The candle stands beside the pile: the slip goes past it.
        const candle = document.querySelector(".vela")?.getBoundingClientRect();
        const right =
          candle && candle.left < paper.right + GAP && candle.bottom > y && candle.top < y + height
            ? Math.max(paper.right, candle.right)
            : paper.right;
        if (right + GAP + SLIP_WIDTH <= vw - EDGE) {
          next = { mode: "margem", x: Math.round(right + GAP), y, side: "right" };
        } else if (paper.left - GAP - SLIP_WIDTH >= EDGE) {
          next = {
            mode: "margem",
            x: Math.round(paper.left - GAP - SLIP_WIDTH),
            y,
            side: "left",
          };
        }
      }
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setPlace({ ...next, for: note });
      }
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [note]);

  // Into the slip once it is placed (and so visible), so a screen reader
  // reads the note at once. Only when a note opens, not each time it moves.
  const focusedFor = useRef<OpenNote | null>(null);
  useEffect(() => {
    if (!note || !place || focusedFor.current === note) return;
    focusedFor.current = note;
    slipRef.current?.focus({ preventScroll: true });
  }, [note, place]);

  /* ------------------------------------------------------------- closing */

  useEffect(() => {
    if (!note) return;
    const slip = slipRef.current;
    const onDown = (e: PointerEvent) => {
      const el = e.target as Node | null;
      // The word that opened it toggles it itself.
      if (slip?.contains(el) || note.button.contains(el)) return;
      // Another of her notes: the slip moves to it without leaving first.
      const other = el instanceof Element && el.closest(".tinta-nota[data-viva]");
      notes.close(false, !other);
    };
    // Capture, so Escape closes the slip before the desk sees it and puts
    // the sheet down; the desk skips keys that were already handled.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        const at = document.activeElement;
        notes.close(!at || at === document.body || !!slip?.contains(at) || at === note.button);
        return;
      }
      if (!slip?.contains(document.activeElement)) return;
      // Left and right would otherwise turn the page under the slip.
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") e.preventDefault();
      // Tabbing out of either end goes back to the word, in the verse.
      if (e.key === "Tab") {
        const stops = slip.querySelectorAll<HTMLElement>("button");
        const leaving = e.shiftKey
          ? document.activeElement === slip
          : document.activeElement === stops[stops.length - 1];
        if (leaving) {
          e.preventDefault();
          notes.close(true);
        }
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [note]);

  // Gone once its exit has played (or at once, if it never stood anywhere).
  useEffect(() => {
    if (!exiting || !leaving) return;
    const timer = setTimeout(() => notes.gone(leaving), place ? 400 : 0);
    return () => clearTimeout(timer);
  }, [exiting, leaving, place]);

  /* -------------------------------------------------------------- render */

  return (
    <div
      ref={slipRef}
      id={SLIP_ID}
      className="nota-margem"
      role="dialog"
      lang={t.lang}
      aria-label={note ? t.noteOn(note.word) : undefined}
      tabIndex={-1}
      hidden={!shown}
      inert={exiting || undefined}
      data-saindo={exiting || undefined}
      data-modo={place?.mode}
      data-lado={place?.mode === "margem" ? place.side : undefined}
      data-instantaneo={note?.instant || undefined}
      style={
        {
          left: place?.mode === "margem" ? place.x : undefined,
          top: place?.mode === "margem" ? place.y : undefined,
          visibility: place ? "visible" : "hidden",
        } as CSSProperties
      }
      onAnimationEnd={(e) => {
        if (exiting && leaving && e.target === e.currentTarget) notes.gone(leaving);
      }}
    >
      {shown && (
        <>
          <p className="nota-palavra" lang="pt">
            {shown.word}
          </p>
          <p className="nota-texto" lang="pt">
            {shown.note}
          </p>
          <button
            type="button"
            className="nota-fechar"
            aria-label={t.closeNote}
            title={t.closeNote}
            // A click with detail 0 came from Enter or Space: no exit.
            onClick={(event) => notes.close(true, event.detail !== 0)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M7 7l10 10M17 7L7 17" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
