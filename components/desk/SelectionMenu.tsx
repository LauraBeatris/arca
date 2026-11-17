"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type Ref,
} from "react";
import { useLang, useStrings } from "@/components/Lingua";
import { positionPath, versesHash, type Verses } from "@/lib/lang";

/**
 * A small floating card that opens over verses the reader selects on a
 * picked-up poem: translate them into English, hear them read aloud, look a
 * single word up in the dictionary, or share them.
 *
 * Selecting text needs a pointer, so the same card also opens from the
 * "more actions" button (keyboard and touch), acting on the whole sheet.
 */

export type SelectionMenuHandle = {
  /**
   * Opens (or closes) the card for every verse on the sheet in view, above
   * `from`. `instant` when a key opened it: then it appears with no entrance.
   */
  toggleForSheet: (from: HTMLElement, instant?: boolean) => void;
};

type Box = { left: number; top: number; right: number; bottom: number };

type Target = {
  text: string;
  word: string | null;
  anchor: Box;
  via: "selection" | "button";
  /** The lines selected, numbered across the poem; null for the whole sheet. */
  verses: Verses | null;
  returnFocus: HTMLElement | null;
  /** Opened from the keyboard: no entrance animation. */
  instant: boolean;
};

type Translation =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; text: string }
  | { status: "error"; message: string };

const GAP = 10;
const EDGE = 12;
/** The same curve as --ease-out in globals.css (WAAPI cannot read CSS variables). */
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const SLIDE_MS = 200;

const noSubscription = () => () => {};
const canSpeak = () => "speechSynthesis" in window;
const canSpeakServer = () => false;

/** The part of one line of verse inside `range`, or "" when none of it is. */
function lineIn(range: Range, line: Element): string {
  if (!range.intersectsNode(line)) return "";
  const part = document.createRange();
  part.selectNodeContents(line);
  if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) {
    part.setStart(range.startContainer, range.startOffset);
  }
  if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) {
    part.setEnd(range.endContainer, range.endOffset);
  }
  return part.toString().replace(/\s+/g, " ").trim();
}

/** The verse inside `range`, one line per line of verse, stanzas apart. */
function versesIn(range: Range, container: Element): string {
  const stanzas: string[] = [];
  for (const stanza of container.querySelectorAll(".estrofe")) {
    const lines: string[] = [];
    for (const line of stanza.querySelectorAll(".verso")) {
      const text = lineIn(range, line);
      if (text) lines.push(text);
    }
    if (lines.length) stanzas.push(lines.join("\n"));
  }
  return stanzas.join("\n\n");
}

/** The lines of the poem in `article` that `range` takes in, counted from 1. */
function versesTouched(range: Range, article: Element): Verses | null {
  const touched: number[] = [];
  article.querySelectorAll(".folha .verso").forEach((line, i) => {
    if (lineIn(range, line)) touched.push(i + 1);
  });
  return touched.length ? { from: touched[0], to: touched[touched.length - 1] } : null;
}

/** "fingidor," → "fingidor"; anything with a space in it → null. */
function singleWord(text: string): string | null {
  const word = text.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
  return /^[\p{L}\p{M}'’-]+$/u.test(word) ? word : null;
}

const toBox = (rect: DOMRect): Box => ({
  left: rect.left,
  top: rect.top,
  right: rect.right,
  bottom: rect.bottom,
});

export function SelectionMenu({
  ref,
  rootRef,
  poem,
  page,
}: {
  ref?: Ref<SelectionMenuHandle>;
  rootRef: React.RefObject<HTMLElement | null>;
  /** The poem being read, or null when none is picked up or it is turned over. */
  poem: { slug: string; title: string } | null;
  page: number;
}) {
  const t = useStrings();
  const lang = useLang();
  const [target, setTarget] = useState<Target | null>(null);
  const [translation, setTranslation] = useState<Translation>({ status: "idle" });
  const [speaking, setSpeaking] = useState(false);
  // What the share button says for a moment after it copied (or failed to).
  const [shared, setShared] = useState<"idle" | "copied" | "failed">("idle");
  const sharedTimer = useRef(0);
  const [place, setPlace] = useState<{ x: number; y: number; side: "above" | "below" } | null>(
    null,
  );
  const cardRef = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const speakable = useSyncExternalStore(noSubscription, canSpeak, canSpeakServer);
  const shown = useRef<Target | null>(null);
  useEffect(() => {
    shown.current = target;
  });

  const article = useCallback(
    () => rootRef.current?.querySelector<HTMLElement>(".poema[data-pegado]") ?? null,
    [rootRef],
  );

  const open = useCallback((next: Target) => {
    request.current?.abort();
    if (canSpeak()) window.speechSynthesis.cancel();
    setSpeaking(false);
    setTranslation({ status: "idle" });
    window.clearTimeout(sharedTimer.current);
    setShared("idle");
    setPlace(null);
    setTarget(next);
  }, []);

  const close = useCallback(() => {
    request.current?.abort();
    if (canSpeak()) window.speechSynthesis.cancel();
    setSpeaking(false);
    setTarget((was) => {
      // Only hand focus back if it was inside the card when it closed.
      if (was?.returnFocus && cardRef.current?.contains(document.activeElement)) {
        was.returnFocus.focus({ preventScroll: true });
      }
      return null;
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      toggleForSheet: (from, instant = false) => {
        if (shown.current?.via === "button") {
          close();
          return;
        }
        const sheet = article()?.querySelectorAll(".folha")[page];
        if (!sheet) return;
        const range = document.createRange();
        range.selectNodeContents(sheet);
        const text = versesIn(range, sheet);
        if (!text) return;
        window.getSelection()?.removeAllRanges();
        open({
          text,
          word: null,
          anchor: toBox(from.getBoundingClientRect()),
          via: "button",
          verses: null,
          returnFocus: from,
          instant,
        });
      },
    }),
    [article, page, open, close],
  );

  /* ------------------------------------------------- open over a selection */

  useEffect(() => {
    if (!poem) return;
    let pointerDown = false;
    let timer = 0;

    const read = () => {
      const selection = window.getSelection();
      const holder = article();
      if (!selection || selection.isCollapsed || !selection.rangeCount || !holder) return;
      const range = selection.getRangeAt(0);
      if (!holder.contains(range.commonAncestorContainer)) return;
      const text = versesIn(range, holder);
      if (!text) return;
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
      const anchor = rects.length
        ? {
            left: Math.min(...rects.map((r) => r.left)),
            top: Math.min(...rects.map((r) => r.top)),
            right: Math.max(...rects.map((r) => r.right)),
            bottom: Math.max(...rects.map((r) => r.bottom)),
          }
        : toBox(range.getBoundingClientRect());
      // The same selection only moves the card; a new one starts it afresh.
      const was = shown.current;
      if (was?.via === "selection" && was.text === text) {
        setTarget({ ...was, anchor });
        return;
      }
      open({
        text,
        word: singleWord(text),
        anchor,
        via: "selection",
        verses: versesTouched(range, holder),
        returnFocus: null,
        instant: false,
      });
    };

    const onDown = (e: PointerEvent) => {
      if (cardRef.current?.contains(e.target as Node)) return;
      pointerDown = true;
    };
    const onUp = () => {
      if (!pointerDown) return;
      pointerDown = false;
      window.clearTimeout(timer);
      // Let the browser settle the selection (a click collapses it) first.
      timer = window.setTimeout(read, 10);
    };
    const onChange = () => {
      // While a mouse is dragging out a selection, wait for it to let go.
      if (pointerDown) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(read, 280);
    };

    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
    document.addEventListener("selectionchange", onChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
      document.removeEventListener("selectionchange", onChange);
    };
  }, [poem, article, open]);

  /* ---------------------------------------------------------------- close */

  // Turning a page, turning the sheet over or putting it down closes the card.
  const slug = poem?.slug ?? null;
  const [shownFor, setShownFor] = useState({ slug, page });
  if (shownFor.slug !== slug || shownFor.page !== page) {
    setShownFor({ slug, page });
    if (target) setTarget(null);
  }

  useEffect(() => {
    if (!target) return;
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (cardRef.current?.contains(el)) return;
      // The button that opened the card toggles it itself.
      if (target.returnFocus?.contains(el)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      const card = cardRef.current;
      if (!card) return;
      // A letter runs the action it names, wherever focus is.
      if (!e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
        const action = card.querySelector<HTMLElement>(
          `[data-atalho="${CSS.escape(e.key.toLowerCase())}"]`,
        );
        if (action) {
          e.preventDefault();
          action.click();
          return;
        }
      }
      if (!card.contains(document.activeElement)) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") {
        // Left and right would otherwise turn the page under the card.
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") e.preventDefault();
        return;
      }
      const items = Array.from(
        card.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"),
      );
      const at = items.indexOf(document.activeElement as HTMLElement);
      const step = e.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
      e.preventDefault();
    };
    const onResize = () => close();
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
    };
  }, [target, close]);

  useEffect(
    () => () => {
      window.clearTimeout(sharedTimer.current);
      request.current?.abort();
      if (canSpeak()) window.speechSynthesis.cancel();
    },
    [],
  );

  /* -------------------------------------------------------------- placing */

  // Where the card was last placed, and where it stood on screen just before
  // it moved, so it can slide to its new place instead of jumping (a
  // translation arriving makes it taller, and above a selection it grows up).
  const placed = useRef(place);
  const slideFrom = useRef<{ x: number; y: number } | null>(null);
  const slide = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    placed.current = place;
  }, [place]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!target || !card) return;
    // Layout size, unaffected by the card's own entrance or slide.
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const a = target.anchor;
    // On touch screens the system's own selection bar sits above the text,
    // so the card goes below it there.
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const fitsAbove = a.top - GAP - height >= EDGE;
    const fitsBelow = a.bottom + GAP + height <= vh - EDGE;
    const preferBelow = coarse && target.via === "selection";
    const side =
      (preferBelow ? fitsBelow || !fitsAbove : !fitsAbove && fitsBelow) ? "below" : "above";
    const y =
      side === "above"
        ? Math.max(EDGE, a.top - GAP - height)
        : Math.min(vh - EDGE - height, a.bottom + GAP);
    const x = Math.min(
      Math.max(EDGE, (a.left + a.right) / 2 - width / 2),
      Math.max(EDGE, vw - EDGE - width),
    );
    const was = placed.current;
    if (was && was.x === x && was.y === y && was.side === side) return;
    if (was) {
      const box = card.getBoundingClientRect();
      slideFrom.current = { x: box.left, y: box.top };
    }
    setPlace({ x, y, side });
  }, [target, translation, shared, speaking]);

  // FLIP: put the card back where it was seen, then let it glide home. Starts
  // from wherever it is on screen, so a second move mid-slide carries on.
  useLayoutEffect(() => {
    const from = slideFrom.current;
    slideFrom.current = null;
    const card = cardRef.current;
    if (!from || !card || !place) return;
    slide.current?.cancel();
    slide.current = null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = card.getBoundingClientRect();
    const dx = from.x - box.left;
    const dy = from.y - box.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    slide.current = card.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
      { duration: SLIDE_MS, easing: EASE_OUT },
    );
  }, [place]);

  // Opened from the button, focus goes into the card. Opened over a
  // selection, it stays put so the reader can keep adjusting it.
  const focusOnOpen = useRef<Target | null>(null);
  useEffect(() => {
    if (!target || target.via !== "button" || focusOnOpen.current === target) return;
    if (!place) return;
    focusOnOpen.current = target;
    cardRef.current?.querySelector<HTMLElement>("button, a[href]")?.focus();
  }, [target, place]);

  /* -------------------------------------------------------------- actions */

  const translate = async () => {
    if (!target || !poem || translation.status === "loading") return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setTranslation({ status: "loading" });
    try {
      const response = await fetch("/api/traduzir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: poem.slug, text: target.text }),
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as {
        translation?: string;
        error?: string;
      };
      if (response.ok && data.translation) {
        setTranslation({ status: "done", text: data.translation });
      } else {
        setTranslation({
          status: "error",
          message:
            data.error === "unavailable"
              ? t.translationUnavailable
              : data.error === "busy"
                ? t.translationBusy
                : t.translationFailed,
        });
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      setTranslation({ status: "error", message: t.translationFailed });
    }
  };

  const listen = () => {
    if (!target || !canSpeak()) return;
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(target.text);
    utterance.lang = "pt-PT";
    const voices = synth.getVoices();
    const voice =
      voices.find((v) => /^pt[-_]PT$/i.test(v.lang)) ??
      voices.find((v) => /^pt\b/i.test(v.lang));
    if (voice) utterance.voice = voice;
    utterance.rate = 0.9;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utterance);
  };

  const share = async () => {
    if (!target || !poem) return;
    // The link opens the poem on this sheet with these lines inked.
    const at = positionPath(lang, { slug: poem.slug, sheet: page, back: false });
    const url = `${window.location.origin}${at}${target.verses ? versesHash(target.verses) : ""}`;
    const text = t.shareQuote(target.text, poem.title);
    if (navigator.share) {
      try {
        await navigator.share({ title: poem.title, text, url });
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n\n${url}`);
      setShared("copied");
    } catch {
      setShared("failed");
    }
    window.clearTimeout(sharedTimer.current);
    sharedTimer.current = window.setTimeout(() => setShared("idle"), 1800);
  };

  /* --------------------------------------------------------------- render */

  if (!target || !poem) return null;
  const word = target.word;

  return (
    <div
      ref={cardRef}
      className="menu-selecao"
      role="dialog"
      aria-label={target.via === "button" ? t.wholeSheetMenu : t.selectionMenu}
      data-lado={place?.side ?? "above"}
      data-instantaneo={target.instant || undefined}
      style={
        {
          left: place?.x ?? 0,
          top: place?.y ?? 0,
          visibility: place ? "visible" : "hidden",
        } as CSSProperties
      }
      // Pressing a button must not clear the reader's selection.
      onMouseDown={(e) => {
        if (!(e.target as Element).closest("a")) e.preventDefault();
      }}
    >
      <ul className="menu-acoes">
        {translation.status !== "done" && (
          <li>
            <button
              type="button"
              onClick={translate}
              aria-disabled={translation.status === "loading" || undefined}
              {...shortcut(t.shortcuts.translate)}
            >
              <IconTranslate />
              <span>{translation.status === "loading" ? t.translating : t.translate}</span>
              <Key letter={t.shortcuts.translate} />
            </button>
          </li>
        )}
        {speakable && (
          <li>
            <button
              type="button"
              onClick={listen}
              aria-pressed={speaking}
              {...shortcut(t.shortcuts.listen)}
            >
              {speaking ? <IconStop /> : <IconListen />}
              <span>{speaking ? t.stopListening : t.listen}</span>
              <Key letter={t.shortcuts.listen} />
            </button>
          </li>
        )}
        {word && (
          <li>
            <a
              href={t.dictionaryUrl(word)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t.dictionary(word)}
              {...shortcut(t.shortcuts.dictionary)}
            >
              <IconBook />
              <span>{t.dictionaryShort}</span>
              <Key letter={t.shortcuts.dictionary} />
            </a>
          </li>
        )}
        <li className="menu-separador" aria-hidden="true" />
        <li>
          <button
            type="button"
            onClick={share}
            data-estado={shared === "idle" ? undefined : shared}
            {...shortcut(t.shortcuts.share)}
          >
            {/* Keyed, so the check is a new element and fades into place. */}
            <span className="menu-icone" key={shared === "copied" ? "check" : "share"}>
              {shared === "copied" ? <IconCheck /> : <IconShare />}
            </span>
            <span>
              {shared === "copied" ? t.shareCopied : shared === "failed" ? t.shareFailed : t.share}
            </span>
            <Key letter={t.shortcuts.share} />
          </button>
          {/* The button's label changes quietly; this says it out loud. */}
          <span className="sr-only" role="status">
            {shared === "copied" ? t.shareCopiedLong : shared === "failed" ? t.shareFailed : ""}
          </span>
        </li>
      </ul>

      <div className="menu-traducao" aria-live="polite">
        {translation.status === "done" && (
          <section aria-label={t.translationHeading}>
            <h3>{t.translationHeading}</h3>
            <p className="menu-traducao-texto" lang="en">
              {translation.text}
            </p>
            <p className="menu-nota">{t.translationNote}</p>
          </section>
        )}
        {translation.status === "error" && (
          <p className="menu-erro">
            {translation.message}{" "}
            {translation.message !== t.translationUnavailable && (
              <button type="button" className="menu-ligacao" onClick={translate}>
                {t.tryAgain}
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- shortcuts */

/** Marks an action as the one a letter runs, for the key handler and for screen readers. */
const shortcut = (letter: string) => ({
  "data-atalho": letter,
  "aria-keyshortcuts": letter.toUpperCase(),
});

/** The letter shown at the end of a row. Screen readers get it from aria-keyshortcuts. */
function Key({ letter }: { letter: string }) {
  return (
    <kbd className="menu-atalho" aria-hidden="true">
      {letter}
    </kbd>
  );
}

/* ------------------------------------------------------------------ icons */

const iconProps = {
  width: 17,
  height: 17,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

function IconTranslate() {
  return (
    <svg {...iconProps}>
      <path d="M4 5h9M8.5 3v2M11 5c-.8 3.6-3.3 6.4-7 8" />
      <path d="M6.5 8.5c1.1 1.8 2.7 3.2 4.5 4" />
      <path d="M13 21l4-9 4 9M14.4 18h5.2" />
    </svg>
  );
}

function IconListen() {
  return (
    <svg {...iconProps}>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg {...iconProps}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
    </svg>
  );
}

function IconBook() {
  return (
    <svg {...iconProps}>
      <path d="M12 6.5C10 5 7.5 4.5 4 4.8v13c3.5-.3 6 .2 8 1.7 2-1.5 4.5-2 8-1.7v-13c-3.5-.3-6 .2-8 1.7z" />
      <path d="M12 6.5v13" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg {...iconProps}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function IconShare() {
  return (
    <svg {...iconProps}>
      <path d="M12 3.5v11M8 7.5l4-4 4 4" />
      <path d="M7 11H6a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 18 11h-1" />
    </svg>
  );
}
