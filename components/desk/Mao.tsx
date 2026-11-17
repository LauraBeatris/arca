"use client";

import { Children, isValidElement, type CSSProperties, type ReactNode } from "react";
import { useStrings } from "@/components/Lingua";
import { RISCO, SETA, circlePath, underlinePath } from "@/components/desk/caneta";
import { hash01 } from "@/lib/seed";

/**
 * Laura's hand on the page: her pen marks around words, and notes in her own
 * handwriting in the margins (`app/fonts/laura-mao.woff2`, a font made from
 * her letters).
 *
 * Notes are real text. They never sit inside a line of verse, so selecting,
 * translating, sharing or copying lines leaves them out.
 */

export type MarkStyle = "sublinhado" | "circulo";

/** The ink of a marked word: a loop around it, or a line under it. */
export function Tinta({ como, seed }: { como: MarkStyle; seed: string }) {
  if (como === "circulo") {
    return (
      <svg
        className="risco risco-circulo"
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path d={circlePath(seed)} />
      </svg>
    );
  }
  const d = underlinePath(seed);
  return (
    <svg
      className="risco risco-sublinhado"
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
      {/* Where the pen lands it presses harder. */}
      <path className="risco-peso" d={d.split(" C38")[0]} />
    </svg>
  );
}

/** A word she wrote and scribbled out. What it was is not legible. */
export function Risco() {
  const t = useStrings();
  return (
    <span className="mao-riscado" role="img" aria-label={t.crossedOut} lang={t.lang}>
      <svg viewBox={`0 0 ${RISCO.width} ${RISCO.height}`} aria-hidden="true" focusable="false">
        <path d={RISCO.d} />
      </svg>
    </span>
  );
}

/**
 * The words of a note, each set down a little on its own, as a hand does:
 * a slight turn and lift per word, the same every time for the same note.
 */
export function Escrita({ children, seed }: { children: ReactNode; seed: string }) {
  let k = 0;
  const words = (node: ReactNode): ReactNode[] =>
    Children.toArray(node).flatMap((child) => {
      if (typeof child !== "string") {
        return isValidElement(child) ? [child] : [];
      }
      return child.split(/(\s+)/).map((part) => {
        if (!part || /^\s+$/.test(part)) return part ? " " : "";
        const i = k++;
        const r = hash01(`${seed}:${i}:r`);
        const y = hash01(`${seed}:${i}:y`);
        return (
          <span
            className="mao-palavra"
            key={`p${i}`}
            style={
              {
                "--r": `${((r - 0.5) * 2.6).toFixed(2)}deg`,
                "--y": `${((y - 0.5) * 0.12).toFixed(3)}em`,
              } as CSSProperties
            }
          >
            {part}
          </span>
        );
      });
    });
  return <>{words(children)}</>;
}

function plain(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      typeof child === "string"
        ? child
        : isValidElement<{ children?: ReactNode }>(child)
          ? plain(child.props.children)
          : "",
    )
    .join("");
}

export type MarginProps = {
  /** Where the note is written: beside the line before it, or under the poem. */
  lado?: "direita" | "esquerda" | "baixo";
  /** Nudges, in ems of the sheet's type: right (or, on the left, outwards) and down. */
  x?: number;
  y?: number;
  /** How wide she wrote it, in ems. */
  largura?: number;
  /** How much the note leans, in degrees. */
  inclina?: number;
  children: ReactNode;
};

/**
 * A note in Laura's hand in the margin of a poem:
 *
 *   Sem existir nos bastou.<Margem largura={6}>será que algo…</Margem>
 *
 * Written at the end of a line, it starts beside that line; on a paragraph of
 * its own after the last stanza, with `lado="baixo"`, it goes under the poem.
 */
export function Margem({ lado = "direita", x = 0, y = 0, largura, inclina, children }: MarginProps) {
  const t = useStrings();
  const seed = plain(children);
  return (
    <span
      className="margem"
      data-lado={lado}
      role="note"
      style={
        {
          "--mx": `${x}em`,
          "--my": `${y}em`,
          ...(largura ? { "--mw": `${largura}em` } : {}),
          ...(inclina !== undefined ? { "--mr": `${inclina}deg` } : {}),
        } as CSSProperties
      }
    >
      <span className="sr-only" lang={t.lang}>
        {t.handNote}{" "}
      </span>
      <Escrita seed={seed}>{children}</Escrita>
    </span>
  );
}

/** A note beside the title, reached by her curved arrow (`titleNote`). */
export function NotaTitulo({ text }: { text: string }) {
  const t = useStrings();
  return (
    <span className="margem margem-titulo" role="note">
      <svg
        className="mao-seta"
        viewBox={`0 0 ${SETA.width} ${SETA.height}`}
        aria-hidden="true"
        focusable="false"
      >
        <path d={SETA.d} />
      </svg>
      <span className="margem-titulo-texto" lang="pt">
        <span className="sr-only" lang={t.lang}>
          {t.handNote}{" "}
        </span>
        <Escrita seed={text}>{text}</Escrita>
      </span>
    </span>
  );
}
