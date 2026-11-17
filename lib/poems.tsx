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
import { FACSIMILE_HOSTS } from "@/lib/facsimiles";

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
 *   facsimile   optional, a scan of Pessoa's own page, shown on the back:
 *     src         "/facsimiles/<slug>.jpg" (a file in `public/`), or an
 *                 https URL on a host listed in `lib/facsimiles.ts`
 *     source      URL the scan comes from (BNP, Arquivo Pessoa), shown as
 *                 its credit
 *     caption     string, optional, in Portuguese
 *
 * Body: one stanza per paragraph, one line of verse per line. A line holding
 * only `---` starts a new sheet; a poem with several sheets is held by a clip.
 */

export type Word = { word: string; meaning: string };

/** A scan of Pessoa's manuscript or typescript page for this poem. */
export type Facsimile = { src: string; source: string; caption?: string };

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
  facsimile?: Facsimile;
  sheetCount: number;
};

export type Poem = PoemMeta & {
  /** Rendered verse, one entry per sheet. */
  sheets: ReactNode[];
  /** The verse as plain text, one entry per line, with the markup removed. */
  lines: string[];
  /** The whole poem as plain text: stanzas apart by a blank line, no markup. */
  text: string;
};

const POEMS_DIR = path.join(process.cwd(), "content", "poems");
const PUBLIC_DIR = path.join(process.cwd(), "public");
const IMAGE_FILE = /\.(jpe?g|png|webp|avif)$/i;
const SHEET_BREAK = /^[ \t]*---[ \t]*$/m;

function fail(file: string, message: string): never {
  throw new Error(`content/poems/${file}: ${message}`);
}

function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function readFacsimile(file: string, slug: string, value: unknown): Facsimile | undefined {
  if (value === undefined || value === null) return undefined;
  const shape = "`facsimile` must be a map with `src`, `source` and, optionally, `caption`";
  if (typeof value !== "object" || Array.isArray(value)) fail(file, shape);
  const { src, source, caption, ...rest } = value as Record<string, unknown>;
  const unknown = Object.keys(rest);
  if (unknown.length > 0) {
    fail(file, `${shape}; unknown field ${unknown.map((key) => `\`${key}\``).join(", ")}`);
  }

  const where = `a file in public/ (e.g. "/facsimiles/${slug}.jpg") or an https URL on a host listed in lib/facsimiles.ts (${FACSIMILE_HOSTS.join(", ") || "none yet"})`;
  if (typeof src !== "string" || !src.trim()) {
    fail(file, `\`facsimile.src\` is required: ${where}`);
  }
  const image = src.trim();
  if (image.startsWith("/") && !image.startsWith("//")) {
    const pathname = image.split(/[?#]/)[0];
    if (!IMAGE_FILE.test(pathname)) {
      fail(file, "`facsimile.src` must be a .jpg, .png, .webp or .avif image");
    }
    const onDisk = path.join(PUBLIC_DIR, pathname);
    if (path.relative(PUBLIC_DIR, onDisk).startsWith("..")) {
      fail(file, `\`facsimile.src\` must stay inside public/`);
    }
    // A deployed server function has no public/ folder (Vercel serves it from
    // the CDN), so the file is checked wherever the folder is: dev and build.
    if (fs.existsSync(PUBLIC_DIR) && !fs.existsSync(onDisk)) {
      fail(file, `\`facsimile.src\` points to public${pathname}, which does not exist`);
    }
  } else {
    let url: URL | undefined;
    try {
      url = new URL(image);
    } catch {}
    if (!url || url.protocol !== "https:" || !FACSIMILE_HOSTS.includes(url.hostname)) {
      fail(file, `\`facsimile.src\` must be ${where}`);
    }
  }

  if (typeof source !== "string" || !isWebUrl(source.trim())) {
    fail(
      file,
      "`facsimile.source` is required: the URL the scan comes from (BNP, Arquivo Pessoa), shown as its credit",
    );
  }
  if (caption !== undefined && (typeof caption !== "string" || !caption.trim())) {
    fail(file, "`facsimile.caption`, when given, must be text");
  }
  return {
    src: image,
    source: source.trim(),
    caption: typeof caption === "string" ? caption.trim() : undefined,
  };
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
  const facsimile = readFacsimile(file, slug, data.facsimile);
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
    facsimile,
    sheetCount: sheets.length,
    sheets,
    lines: content
      .replace(/<[^>]+>/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !SHEET_BREAK.test(line)),
    text: content
      .replace(/<[^>]+>/g, "")
      .split("\n")
      .map((line) => (SHEET_BREAK.test(line) ? "" : line.trim()))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
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
