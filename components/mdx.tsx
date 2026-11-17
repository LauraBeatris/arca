import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { NotedMark } from "@/components/desk/Nota";
import { Margem, Risco, Tinta, type MarkStyle } from "@/components/desk/Mao";

/**
 * Components available inside poem `.mdx` files.
 *
 * Poem text always renders as real HTML text: one <p> per stanza, one
 * <span class="verso"> per line of verse, in reading order.
 */

/**
 * A word or phrase Laura marked, with an optional margin note:
 *
 *   Quem quer passar além do <Mark note="cabo, no Saara Ocidental">Bojador</Mark>
 *   <Mark como="circulo" note="…">Dolente</Mark>
 *
 * The word is underlined in her pen, or circled with `como="circulo"` (the
 * words she looked up). With a note it is also a button that opens the note
 * on a slip in the margin (components/desk/Nota.tsx); without one it is only
 * the ink. The note never sits inside the verse, so selecting or copying
 * lines leaves it out.
 */
export function Mark({
  note,
  como = "sublinhado",
  children,
}: {
  note?: string;
  como?: MarkStyle;
  children: ReactNode;
}) {
  const text = note?.trim();
  const word = plainText(children);
  const ink = <Tinta como={como} seed={word} />;
  if (!text) {
    return (
      <span className="tinta" data-como={como}>
        {children}
        {ink}
      </span>
    );
  }
  return (
    <NotedMark word={word} note={text} como={como} ink={ink}>
      {children}
    </NotedMark>
  );
}

/** The words inside a bit of markup, for labels. */
function plainText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? plainText(child.props.children)
          : "",
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits a paragraph's children into lines of verse at each line break. */
function toLines(children: ReactNode): ReactNode[][] {
  const lines: ReactNode[][] = [[]];
  for (const child of Children.toArray(children)) {
    if (typeof child === "string") {
      const parts = child.split("\n");
      parts.forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part) lines[lines.length - 1].push(part);
      });
    } else if (isValidElement(child) && child.type === "br") {
      lines.push([]);
    } else {
      lines[lines.length - 1].push(child);
    }
  }
  return lines.filter((line) => line.length > 0);
}

const isNote = (node: ReactNode) => isValidElement(node) && node.type === Margem;

/**
 * A stanza: each source line becomes one line of verse. A margin note
 * written at the end of a line comes out of it and follows the line, so it
 * is never part of the verse.
 */
function Stanza({ children }: { children?: ReactNode }) {
  return (
    <p className="estrofe">
      {toLines(children).map((line, i) => {
        const verse = line.filter((node) => !isNote(node));
        const notes = line.filter(isNote);
        return (
          <Fragment key={i}>
            {verse.length > 0 && (
              <span className="verso">
                {verse.map((node, j) => (
                  <Fragment key={j}>{node}</Fragment>
                ))}
              </span>
            )}
            {notes.map((node, j) => (
              <Fragment key={`n${j}`}>{node}</Fragment>
            ))}
          </Fragment>
        );
      })}
    </p>
  );
}

export const mdxComponents = {
  p: Stanza,
  Mark,
  Margem,
  Risco,
};
