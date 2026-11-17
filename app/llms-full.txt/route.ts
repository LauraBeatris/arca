import { llmsFullTxt } from "@/lib/llms";

/** GET /llms-full.txt: `/llms.txt` with every poem's text. Built with the site. */
export function GET() {
  return new Response(llmsFullTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
