import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { NotedMark } from "@/components/desk/Nota";

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
 * The word is underlined in cobalt ink. With a note it is also a button that
 * opens the note on a slip in the margin (components/desk/Nota.tsx); without
 * one it is only the ink. The note never sits inside the verse, so selecting
 * or copying lines leaves it out.
 */
export function Mark({
  note,
  children,
}: {
  note?: string;
  children: ReactNode;
}) {
  const text = note?.trim();
  if (!text) return <span className="tinta">{children}</span>;
  return (
    <NotedMark word={plainText(children)} note={text}>
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
