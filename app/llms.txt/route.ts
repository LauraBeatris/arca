import { llmsTxt } from "@/lib/llms";

/** GET /llms.txt: the site and its poems, for AI agents. Built with the site. */
export function GET() {
  return new Response(llmsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
