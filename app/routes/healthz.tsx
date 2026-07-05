import { json } from "@remix-run/node";

import prisma from "../db.server";

// Public, unauthenticated liveness/readiness probe (brief §3 observability).
// Returns 200 when the app can reach the database, 503 otherwise.
export const loader = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return json({ status: "ok", db: "up" });
  } catch {
    return json({ status: "degraded", db: "down" }, { status: 503 });
  }
};
