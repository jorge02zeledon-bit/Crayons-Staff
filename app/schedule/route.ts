import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

/** GET /schedule: the plain-JS schedule app that lives in public/s/. */
export async function GET() {
  const html = await fs.readFile(path.join(process.cwd(), "public", "s", "index.html"), "utf8");
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
