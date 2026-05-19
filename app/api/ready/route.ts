import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * `/api/ready` — the k8s readiness probe endpoint. Returns 200 when the DB
 * answers `select 1`, 503 when it does not. The probe holds traffic off a
 * pod whose DB is unreachable, which is the safety net that lets the
 * boot-time schema check warn-and-continue rather than crash-loop the fleet
 * on a transient outage.
 *
 * `force-dynamic` because every probe must actually hit the DB — Next.js must
 * not cache a stale 200.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await db.execute(sql`select 1`);
    return new Response("ok", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return new Response(`db unreachable: ${reason}`, {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
