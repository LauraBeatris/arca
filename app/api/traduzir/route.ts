import Anthropic from "@anthropic-ai/sdk";
import { getPoem } from "@/lib/poems";

/**
 * POST /api/traduzir  { slug, text }  →  { translation }
 *
 * A machine translation into English of lines a reader selected on a poem.
 * Only text that is really in that poem is accepted, so this is not an open
 * door to the model. The page labels the result as a machine translation.
 *
 * Needs ANTHROPIC_API_KEY in the environment (set it in Vercel for the live
 * site). Without it the route answers 503 and the menu says translation is
 * unavailable.
 */

const MAX_CHARS = 1500;
const cache = new Map<string, string>();

const SYSTEM = `You translate Portuguese poetry by Fernando Pessoa into English.

You receive the whole poem for context, then the lines a reader selected. Translate only the selected lines. Keep the same line breaks: one English line for each Portuguese line, and a blank line wherever there is one in the selection. If the selection starts or ends partway through a line, translate just that part.

Aim for a faithful, readable translation that keeps the tone of the original. Do not rhyme at the cost of meaning. Reply with the translation only: no title, quotation marks, notes or commentary.`;

const normalize = (text: string) =>
  text.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt");

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
  const selected = text.normalize("NFC").trim();
  if (!poem || !selected || selected.length > MAX_CHARS) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  // Every selected line has to be (part of) a line of this poem or its title.
  const known = [poem.title, ...poem.lines].map(normalize);
  const inPoem = selected
    .split("\n")
    .map(normalize)
    .filter(Boolean)
    .every((line) => known.some((poemLine) => poemLine.includes(line)));
  if (!inPoem) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const key = `${slug}\n${selected}`;
  const hit = cache.get(key);
  if (hit) return Response.json({ translation: hit });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      // If the model declines, the API retries on a fallback model by itself.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `<poem title="${poem.title}">\n${poem.lines.join("\n")}\n</poem>\n\n<selection>\n${selected}\n</selection>`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ error: "failed" }, { status: 502 });
    }
    const translation = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();
    if (!translation) {
      return Response.json({ error: "failed" }, { status: 502 });
    }
    cache.set(key, translation);
    return Response.json({ translation });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("traduzir: the Anthropic API key was rejected");
      return Response.json({ error: "unavailable" }, { status: 503 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "busy" }, { status: 429 });
    }
    console.error("traduzir:", error);
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
