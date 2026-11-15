import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { evaluateSync } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import type { ReactNode } from "react";
import { mdxComponents } from "@/components/mdx";
import {
  BOOKS,
  BOOK_PAPER,
  PAPER_IDS,
  type Book,
  type PaperId,
} from "@/lib/papers";

/**
 * Poems live in `content/poems/<slug>.mdx`.
 *
 * Frontmatter:
 *   title       string
 *   numeral     string, optional (the poem's number in its book, e.g. "X")
 *   book        "mensagem" | "cancioneiro"
 *   paper       "carta" | "maquina", optional (overrides the book's paper)
 *   markedAt    "YYYY-MM-DD", the day Laura marked the poem
 *   source      URL the text was taken from, optional
 *   words       list of { word, meaning }
 *   reflection  string
 *
 * Body: one stanza per paragraph, one line of verse per line. A line holding
 * only `---` starts a new sheet; a poem with several sheets is held by a clip.
 */

export type Word = { word: string; meaning: string };

export type PoemMeta = {
  slug: string;
  title: string;
  numeral?: string;
  book: Book;
  paper: PaperId;
  markedAt: string;
  source?: string;
  words: Word[];
  reflection: string;
  sheetCount: number;
};

export type Poem = PoemMeta & {
  /** Rendered verse, one entry per sheet. */
  sheets: ReactNode[];
};

const POEMS_DIR = path.join(process.cwd(), "content", "poems");
const SHEET_BREAK = /^[ \t]*---[ \t]*$/m;

function fail(file: string, message: string): never {
  throw new Error(`content/poems/${file}: ${message}`);
}

function readPoem(file: string): Poem {
  const slug = file.replace(/\.mdx$/, "");
  const raw = fs.readFileSync(path.join(POEMS_DIR, file), "utf8");
  const { data, content } = matter(raw);

  if (typeof data.title !== "string" || !data.title.trim()) {
    fail(file, "`title` is required");
  }
  if (!BOOKS.includes(data.book)) {
    fail(file, `\`book\` must be one of ${BOOKS.join(", ")}`);
  }
  if (data.paper !== undefined && !PAPER_IDS.includes(data.paper)) {
    fail(file, `\`paper\` must be one of ${PAPER_IDS.join(", ")}`);
  }
  const markedAt =
    data.markedAt instanceof Date
      ? data.markedAt.toISOString().slice(0, 10)
      : String(data.markedAt ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(markedAt)) {
    fail(file, "`markedAt` must be a date written as YYYY-MM-DD");
  }
  const words: Word[] = Array.isArray(data.words)
    ? data.words.map((entry: Partial<Word>) => ({
        word: String(entry?.word ?? ""),
        meaning: String(entry?.meaning ?? ""),
      }))
    : [];

  const sheets = content
    .split(SHEET_BREAK)
    .map((source) => source.trim())
    .filter(Boolean)
    .map((source, i) => {
      const { default: Content } = evaluateSync(source, runtime);
      return <Content key={i} components={mdxComponents} />;
    });
  if (sheets.length === 0) fail(file, "the poem has no text");

  const book = data.book as Book;
  return {
    slug,
    title: data.title.trim(),
    numeral: data.numeral ? String(data.numeral) : undefined,
    book,
    paper: (data.paper as PaperId | undefined) ?? BOOK_PAPER[book],
    markedAt,
    source: data.source ? String(data.source) : undefined,
    words,
    reflection: String(data.reflection ?? ""),
    sheetCount: sheets.length,
    sheets,
  };
}

let cached: Poem[] | undefined;

/** Every poem, in pile order: the most recently marked on top. */
export function getPoems(): Poem[] {
  if (cached && process.env.NODE_ENV === "production") return cached;
  cached = fs
    .readdirSync(POEMS_DIR)
    .filter((file) => file.endsWith(".mdx"))
    .map(readPoem)
    .sort(
      (a, b) =>
        b.markedAt.localeCompare(a.markedAt) || a.slug.localeCompare(b.slug),
    );
  return cached;
}

export function getPoem(slug: string): Poem | undefined {
  return getPoems().find((poem) => poem.slug === slug);
}
