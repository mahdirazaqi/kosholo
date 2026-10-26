import { connection } from "next/server";
import { db } from "@/lib/db";

// GET /api/health: 200 { ok: true } when the database answers, 503 otherwise.
// Used by the Docker HEALTHCHECK and scripts/deploy.sh. Public (see proxy.ts).
export async function GET() {
  // Request time only: never prerendered at build (no database there).
  await connection();
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
