"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import type { Facsimile } from "@/lib/poems";
import { useStrings } from "@/components/Lingua";
import "./facsimile.css";

/** A facsimile as the desk gets it: numbered in pile order, like a book's figures. */
export type DeskFacsimile = Facsimile & { figure: number };

/**
 * A scan of Pessoa's own page, set into the back of a sheet like a figure in
 * a book: a small picture with a numbered caption and a credit link. The
 * picture is a button that opens the page larger, in a modal dialog (Esc or
 * the close button put it away, and focus goes back to the picture).
 *
 * The scan is extra material: the poem's text stays real text on the front.
 * Nothing is fetched until the sheet is first picked up.
 */
export function FacsimileFigure({
  facsimile,
  title,
  active,
}: {
  facsimile: DeskFacsimile;
  title: string;
  /** The sheet is picked up, so its back can be seen. */
  active: boolean;
}) {
  const t = useStrings();
  const { src, source, caption, figure } = facsimile;
  const alt = t.facsimileAlt(title);

  // Load the scan once the sheet has been picked up, and keep it.
  const [wanted, setWanted] = useState(active);
  if (active && !wanted) setWanted(true);

  // The dialog is mounted on first open and then kept, so it can fade out.
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  if (open && !mounted) setMounted(true);
  // Put down (e.g. with the browser's back button) while enlarged: close it.
  if (open && !active) setOpen(false);

  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // The dialog would focus the first link; start on the close button.
      closer.current?.focus({ preventScroll: true });
    }
    if (!open && el.open) el.close();
    // Back to where the reader was.
    if (wasOpen.current && !open) opener.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open, mounted]);

  const credit = (
    <a className="fac-fonte" href={source} target="_blank" rel="noopener noreferrer">
      {t.facsimileSource}
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> {t.opensInNewTab}</span>
    </a>
  );
  const legend = (
    <>
      <span className="fac-numero">{t.facsimileFigure(figure)}</span>
      {caption && (
        <>
          {" — "}
          <span lang="pt">{caption}</span>
        </>
      )}
    </>
  );

  return (
    <figure className="fac">
      <button
        type="button"
        ref={opener}
        className="fac-abrir"
        aria-label={t.facsimileOpen(title)}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {wanted && (
          <Image
            src={src}
            alt={alt}
            fill
            sizes="(max-width: 639px) 34vw, 180px"
            draggable={false}
          />
        )}
      </button>
      <figcaption lang={t.lang}>
        {legend} {credit}
      </figcaption>

      {mounted &&
        createPortal(
          <dialog
            ref={dialog}
            className="fac-ampliado"
            aria-label={alt}
            onClose={() => setOpen(false)}
            // Keys stay here while the page is enlarged, so the desk's own
            // keys (Esc puts the sheet down) wait until it is closed.
            onKeyDown={(event: KeyboardEvent) => event.stopPropagation()}
            onClick={(event: MouseEvent) => {
              // A click anywhere but the caption bar puts the page away.
              if (!(event.target as Element).closest("figcaption")) setOpen(false);
            }}
          >
            <figure className="fac-ampliado-figura">
              <div className="fac-ampliado-pagina">
                <Image src={src} alt={alt} fill sizes="92vw" draggable={false} />
              </div>
              <figcaption lang={t.lang}>
                <span className="fac-ampliado-legenda">
                  {legend} {credit}
                </span>
                <button
                  type="button"
                  className="botao"
                  data-variante="principal"
                  ref={closer}
                  onClick={() => setOpen(false)}
                >
                  {t.facsimileClose}
                </button>
              </figcaption>
            </figure>
          </dialog>,
          document.body,
        )}
    </figure>
  );
}
