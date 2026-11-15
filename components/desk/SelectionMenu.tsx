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
import { strings as t } from "@/lib/strings";

/**
 * A small floating card that opens over verses the reader selects on a
 * picked-up poem: translate them into English, hear them read aloud, look a
 * single word up in the dictionary, or share them.
 *
 * Selecting text needs a pointer, so the same card also opens from the
 * "more actions" button (keyboard and touch), acting on the whole sheet.
 */

export type SelectionMenuHandle = {
  /** Opens (or closes) the card for every verse on the sheet in view, above `from`. */
  toggleForSheet: (from: HTMLElement) => void;
};

type Box = { left: number; top: number; right: number; bottom: number };

type Target = {
  text: string;
  word: string | null;
  anchor: Box;
  via: "selection" | "button";
  returnFocus: HTMLElement | null;
};

type Translation =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; text: string }
  | { status: "error"; message: string };

const GAP = 10;
const EDGE = 12;

const noSubscription = () => () => {};
const canSpeak = () => "speechSynthesis" in window;
const canSpeakServer = () => false;

/** The verse inside `range`, one line per line of verse, stanzas apart. */
function versesIn(range: Range, container: Element): string {
  const stanzas: string[] = [];
  for (const stanza of container.querySelectorAll(".estrofe")) {
    const lines: string[] = [];
    for (const line of stanza.querySelectorAll(".verso")) {
      if (!range.intersectsNode(line)) continue;
      const part = document.createRange();
      part.selectNodeContents(line);
      if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) {
        part.setStart(range.startContainer, range.startOffset);
      }
      if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) {
        part.setEnd(range.endContainer, range.endOffset);
      }
      const text = part.toString().replace(/\s+/g, " ").trim();
      if (text) lines.push(text);
    }
    if (lines.length) stanzas.push(lines.join("\n"));
  }
  return stanzas.join("\n\n");
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
  const [target, setTarget] = useState<Target | null>(null);
  const [translation, setTranslation] = useState<Translation>({ status: "idle" });
  const [speaking, setSpeaking] = useState(false);
  const [notice, setNotice] = useState("");
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
    setNotice("");
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
      toggleForSheet: (from) => {
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
          returnFocus: from,
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
      open({ text, word: singleWord(text), anchor, via: "selection", returnFocus: null });
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
      if (!card?.contains(document.activeElement)) return;
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
      request.current?.abort();
      if (canSpeak()) window.speechSynthesis.cancel();
    },
    [],
  );

  /* -------------------------------------------------------------- placing */

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!target || !card) return;
    const { width, height } = card.getBoundingClientRect();
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
    setPlace((was) =>
      was && was.x === x && was.y === y && was.side === side ? was : { x, y, side },
    );
  }, [target, translation, notice, speaking]);

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
    const url = `${window.location.origin}/poema/${poem.slug}`;
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
      setNotice(t.shareCopied);
    } catch {
      setNotice(t.shareFailed);
    }
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
            >
              <IconTranslate />
              <span>{translation.status === "loading" ? t.translating : t.translate}</span>
            </button>
          </li>
        )}
        {speakable && (
          <li>
            <button type="button" onClick={listen} aria-pressed={speaking}>
              {speaking ? <IconStop /> : <IconListen />}
              <span>{speaking ? t.stopListening : t.listen}</span>
            </button>
          </li>
        )}
        {word && (
          <li>
            <a
              href={`https://dicionario.priberam.org/${encodeURIComponent(word.toLocaleLowerCase("pt"))}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t.dictionary(word)}
            >
              <IconBook />
              <span>{t.dictionaryShort}</span>
            </a>
          </li>
        )}
        <li className="menu-separador" aria-hidden="true" />
        <li>
          <button type="button" onClick={share}>
            <IconShare />
            <span>{t.share}</span>
          </button>
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
        {notice && <p className="menu-aviso">{notice}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ icons */

const iconProps = {
  width: 20,
  height: 20,
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

function IconShare() {
  return (
    <svg {...iconProps}>
      <path d="M12 3.5v11M8 7.5l4-4 4 4" />
      <path d="M7 11H6a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 18 11h-1" />
    </svg>
  );
}
