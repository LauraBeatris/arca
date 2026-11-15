import { Children, Fragment, isValidElement, type ReactNode } from "react";

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
 *
 * v1 only settles the format. It renders as plain text, with the note kept in
 * the markup. A later version draws it as cobalt ink with the note written in
 * the margin.
 */
export function Mark({
  note,
  children,
}: {
  note?: string;
  children: ReactNode;
}) {
  return (
    <span className="marca" data-nota={note}>
      {children}
    </span>
  );
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

/** A stanza: each source line becomes one line of verse. */
function Stanza({ children }: { children?: ReactNode }) {
  return (
    <p className="estrofe">
      {toLines(children).map((line, i) => (
        <span className="verso" key={i}>
          {line.map((node, j) => (
            <Fragment key={j}>{node}</Fragment>
          ))}
        </span>
      ))}
    </p>
  );
}

export const mdxComponents = {
  p: Stanza,
  Mark,
};
