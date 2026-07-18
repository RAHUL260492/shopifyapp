// Read-side helpers for the Products dashboard. Kept out of the route so the
// score-band logic is reusable (Overview reuses the store aggregate).

import prisma from "../../db.server";

export type ScoreBand = "all" | "needs_work" | "fair" | "good";

/** Prisma `where` fragment for a score band. */
function bandFilter(band: ScoreBand) {
  switch (band) {
    case "needs_work":
      return { readinessScore: { lt: 50 } };
    case "fair":
      return { readinessScore: { gte: 50, lt: 80 } };
    case "good":
      return { readinessScore: { gte: 80 } };
    default:
      return {};
  }
}

export async function listProducts(shopId: string, band: ScoreBand) {
  return prisma.product.findMany({
    where: { shopId, ...bandFilter(band) },
    include: { issues: true },
    orderBy: [{ readinessScore: "asc" }, { title: "asc" }],
  });
}

export interface StoreReadiness {
  productCount: number;
  storeScore: number;
  lastSyncedAt: Date | null;
}

/** Store-level rollup: product count, mean readiness score, and last sync time. */
export async function storeReadiness(shopId: string): Promise<StoreReadiness> {
  const agg = await prisma.product.aggregate({
    where: { shopId },
    _count: { _all: true },
    _avg: { readinessScore: true },
    _max: { syncedAt: true },
  });

  return {
    productCount: agg._count._all,
    storeScore: agg._avg.readinessScore
      ? Math.round(agg._avg.readinessScore)
      : 0,
    lastSyncedAt: agg._max.syncedAt ?? null,
  };
}
