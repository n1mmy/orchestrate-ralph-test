/**
 * Kubernetes readiness probe.
 *
 * 200 when the DB answers `SELECT 1`; 503 otherwise. `force-dynamic` so this
 * is never cached — every probe must hit the live DB. A 503 keeps traffic off
 * the pod until the DB is reachable; this is what makes the boot-time
 * "DB unreachable" branch safe (see `lib/schema-check.ts`).
 */
import { NextResponse } from "next/server";

import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ready: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ready: false, error: message },
      { status: 503 },
    );
  }
}
