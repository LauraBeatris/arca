import Anthropic from "@anthropic-ai/sdk";
import { getVercelOidcToken } from "@vercel/oidc";
import { getPoem, type Poem } from "@/lib/poems";

/**
 * POST /api/traduzir  { slug, text }  →  { translation }
 *
 * A machine translation into English of lines a reader selected on a poem.
 * The page labels the result as a machine translation.
 *
 * The route is public and every model call costs money, so:
 * - Only text that is really in that poem is accepted, and the selection is
 *   rebuilt from the poem's own text before it is used. Case or spacing
 *   variants of a line become the same request, so they share one cache entry
 *   and only the poem's words ever reach the model.
 * - Identical requests already in flight share one model call.
 * - Model calls are limited per visitor, per instance per hour, and in how many
 *   run at once. Over a limit the route answers 429 and the menu says "busy".
 *   These limits live in memory, so each server instance counts on its own:
 *   they cap what one instance can spend, not the whole deployment. A Vercel
 *   Firewall rate limit on this path and an AI Gateway spend limit are the
 *   shared caps.
 *
 * Claude is reached through Vercel AI Gateway. On Vercel each request is
 * signed with the deployment's OIDC token, so the project holds no API key.
 * Locally, put AI_GATEWAY_API_KEY in .env.local. Without a credential the
 * route answers 503 and the menu says translation is unavailable.
 */

const MAX_CHARS = 1500;

/** Model calls one visitor (by IP) may start per window. */
const PER_CLIENT = { limit: 20, windowMs: 10 * 60_000 };
/** Model calls one instance may start per window, across all visitors. */
const PER_INSTANCE = { limit: 300, windowMs: 60 * 60_000 };
/** Model calls one instance may have running at once. */
const MAX_IN_FLIGHT = 4;
/** Entries kept in the translation cache and the per-visitor table. */
const MAX_CACHE = 1000;
const MAX_CLIENTS = 10_000;

const SYSTEM = `You translate Portuguese poetry by Fernando Pessoa into English.

You receive the whole poem for context, then the lines a reader selected. Translate only the selected lines. Keep the same line breaks: one English line for each Portuguese line, and a blank line wherever there is one in the selection. If the selection starts or ends partway through a line, translate just that part.

Aim for a faithful, readable translation that keeps the tone of the original. Do not rhyme at the cost of meaning. Reply with the translation only: no title, quotation marks, notes or commentary.`;

/* ------------------------------------------------- matching the selection */

/**
 * A line folded for comparison (NFC, runs of whitespace as one space, trimmed,
 * lower case), with the span of the source each folded character came from,
 * so a match in the folded text can be cut back out of the source.
 */
type Folded = { source: string; text: string; start: number[]; end: number[] };

function fold(line: string): Folded {
  const source = line.normalize("NFC");
  let text = "";
  const start: number[] = [];
  const end: number[] = [];
  let space = false;
  let at = 0;
  for (const char of source) {
    const from = at;
    at += char.length;
    if (/\s/u.test(char)) {
      space = text.length > 0;
      continue;
    }
    if (space) {
      text += " ";
      start.push(from);
      end.push(from);
      space = false;
    }
    const lower = char.toLocaleLowerCase("pt");
    for (let unit = 0; unit < lower.length; unit++) {
      start.push(from);
      end.push(at);
    }
    text += lower;
  }
  return { source, text, start, end };
}

const foldedPoems = new Map<string, Folded[]>();

function foldedLines(poem: Poem): Folded[] {
  let lines = foldedPoems.get(poem.slug);
  if (!lines) {
    lines = [poem.title, ...poem.lines].map(fold);
    foldedPoems.set(poem.slug, lines);
  }
  return lines;
}

/**
 * The selection rewritten in the poem's own text: each selected line replaced
 * by the stretch of the poem line it matches, runs of blank lines as one.
 * Null when any selected line is not (part of) a line of the poem or its title.
 */
function canonicalSelection(poem: Poem, text: string): string | null {
  const lines = foldedLines(poem);
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const wanted = fold(raw).text;
    if (!wanted) {
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      continue;
    }
    let found: string | null = null;
    for (const line of lines) {
      const index = line.text.indexOf(wanted);
      if (index === -1) continue;
      const last = index + wanted.length - 1;
      found = line.source.slice(line.start[index], line.end[last]);
      break;
    }
    if (found === null) return null;
    out.push(found);
  }
  while (out[out.length - 1] === "") out.pop();
  return out.length > 0 ? out.join("\n") : null;
}

/* ------------------------------------------------------------- limiting */

type Window = { count: number; resetAt: number };

const clients = new Map<string, Window>();
const instance: Window = { count: 0, resetAt: 0 };
let inFlight = 0;

/** Counts one call against a window; false when the window is already full. */
function take(window: Window, limit: number, windowMs: number, now: number) {
  if (now >= window.resetAt) {
    window.count = 0;
    window.resetAt = now + windowMs;
  }
  if (window.count >= limit) return false;
  window.count += 1;
  return true;
}

function clientWindow(ip: string, now: number): Window | null {
  let window = clients.get(ip);
  if (window) return window;
  if (clients.size >= MAX_CLIENTS) {
    for (const [key, entry] of clients) {
      if (now >= entry.resetAt) clients.delete(key);
    }
    // Still full of live windows: refuse new visitors rather than forget limits.
    if (clients.size >= MAX_CLIENTS) return null;
  }
  window = { count: 0, resetAt: 0 };
  clients.set(ip, window);
  return window;
}

/** Vercel sets x-forwarded-for to the visitor's address and drops any sent. */
function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

/* ---------------------------------------------------------- translating */

type Outcome =
  | { translation: string }
  | { error: "unavailable" | "failed" | "busy"; status: number };

const cache = new Map<string, string>();
const pending = new Map<string, Promise<Outcome>>();

function remember(key: string, translation: string) {
  cache.set(key, translation);
  if (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/**
 * The AI Gateway credential: an explicit key wins (local dev); on Vercel the
 * OIDC token arrives with each request and rotates, so it is read per request.
 */
async function gatewayKey(): Promise<string | null> {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  try {
    return await getVercelOidcToken();
  } catch {
    return null;
  }
}

async function translate(
  poem: Poem,
  selection: string,
  apiKey: string,
): Promise<Outcome> {
  try {
    const client = new Anthropic({
      apiKey,
      baseURL: "https://ai-gateway.vercel.sh",
    });
    const response = await client.beta.messages.create({
      model: "anthropic/claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      // If the model declines, the API retries on a fallback model by itself.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `<poem title="${poem.title}">\n${poem.lines.join("\n")}\n</poem>\n\n<selection>\n${selection}\n</selection>`,
        },
      ],
      // Anthropic only: the refusal fallback above is an Anthropic API feature
      // that Bedrock and Vertex don't have.
      ...{ providerOptions: { gateway: { only: ["anthropic"] } } },
    });

    if (response.stop_reason === "refusal") {
      return { error: "failed", status: 502 };
    }
    const translation = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();
    if (!translation) return { error: "failed", status: 502 };
    return { translation };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("traduzir: AI Gateway rejected the credentials");
      return { error: "unavailable", status: 503 };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { error: "busy", status: 429 };
    }
    console.error("traduzir:", error);
    return { error: "failed", status: 502 };
  }
}

function reply(outcome: Outcome) {
  if ("translation" in outcome) {
    return Response.json({ translation: outcome.translation });
  }
  return Response.json({ error: outcome.error }, { status: outcome.status });
}

function busy(retryAfterMs: number) {
  return Response.json(
    { error: "busy" },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) },
    },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const { slug, text } = (body ?? {}) as { slug?: unknown; text?: unknown };
  if (typeof slug !== "string" || typeof text !== "string") {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const poem = getPoem(slug);
  if (!poem || !text.trim() || text.length > MAX_CHARS) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const selection = canonicalSelection(poem, text);
  if (!selection) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const key = `${slug}\n${selection}`;
  const hit = cache.get(key);
  if (hit) return Response.json({ translation: hit });
  const joining = pending.get(key);
  if (joining) return reply(await joining);

  const apiKey = await gatewayKey();
  if (!apiKey) {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }

  const now = Date.now();
  const visitor = clientWindow(clientIp(request), now);
  if (!visitor) return busy(60_000);
  if (!take(visitor, PER_CLIENT.limit, PER_CLIENT.windowMs, now)) {
    return busy(visitor.resetAt - now);
  }
  if (inFlight >= MAX_IN_FLIGHT) return busy(5_000);
  if (!take(instance, PER_INSTANCE.limit, PER_INSTANCE.windowMs, now)) {
    return busy(instance.resetAt - now);
  }

  inFlight += 1;
  const call = translate(poem, selection, apiKey).finally(() => {
    inFlight -= 1;
    pending.delete(key);
  });
  pending.set(key, call);
  const outcome = await call;
  if ("translation" in outcome) remember(key, outcome.translation);
  return reply(outcome);
}
