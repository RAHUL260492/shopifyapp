// Citation scan orchestration. For each configured engine, run a prompt N times
// (default 3, to smooth non-determinism), parse each answer, persist
// ScanRun/ScanResult, log cost, and enforce a hard per-shop daily cap. An engine
// failure is isolated so one engine being down doesn't block the others.

import prisma from "../../db.server";
import type { Competitor } from "./parse";
import { parseCitationResponse } from "./parse";
import { getCitationProviders } from "./index.server";
import {
  callCostCents,
  wouldExceedCap,
  DEFAULT_DAILY_CAP_CENTS,
} from "./cost";

const SAMPLES = 3;

/** Cents spent on citation scans for this shop since local midnight. */
export async function spentTodayCents(shopId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const agg = await prisma.llmUsage.aggregate({
    where: { shopId, purpose: "citation_scan", createdAt: { gte: start } },
    _sum: { costCents: true },
  });
  return agg._sum.costCents ?? 0;
}

/** Brand terms for matching: merchant aliases (settings) or a domain fallback. */
export function brandTermsFor(
  domain: string,
  settings: unknown,
): string[] {
  const aliases = (settings as { brandAliases?: unknown })?.brandAliases;
  if (Array.isArray(aliases)) {
    const cleaned = aliases
      .map((a) => String(a).trim())
      .filter((a) => a.length > 0);
    if (cleaned.length > 0) return cleaned;
  }
  // Fallback: the store handle (e.g. "acme" from acme.myshopify.com).
  return [domain.replace(/\.myshopify\.com$/, "").replace(/-/g, " ")];
}

export interface ScanOutcome {
  stoppedByCap: boolean;
  engines: string[];
  costCents: number;
}

/** Run all configured engines for one prompt. */
export async function runScanForPrompt(
  shopId: string,
  prompt: { id: string; text: string },
  brandTerms: string[],
  competitors: Competitor[],
  capCents = DEFAULT_DAILY_CAP_CENTS,
): Promise<ScanOutcome> {
  const providers = getCitationProviders();
  let spent = await spentTodayCents(shopId);
  let totalCost = 0;
  let stoppedByCap = false;
  const engines: string[] = [];

  for (const provider of providers) {
    engines.push(provider.engine);
    const scanRun = await prisma.scanRun.create({
      data: {
        shopId,
        engine: provider.engine,
        status: "RUNNING",
        startedAt: new Date(),
      },
    });
    let runCost = 0;
    let failed = false;

    try {
      for (let i = 0; i < SAMPLES; i++) {
        if (spent >= capCents) {
          stoppedByCap = true;
          break;
        }
        const res = await provider.query(prompt.text);
        const cost = callCostCents(
          res.model,
          res.usage.inputTokens,
          res.usage.outputTokens,
        );
        spent += cost;
        runCost += cost;
        totalCost += cost;

        await prisma.llmUsage.create({
          data: {
            shopId,
            provider: provider.engine,
            model: res.model,
            tokensIn: res.usage.inputTokens,
            tokensOut: res.usage.outputTokens,
            costCents: cost,
            purpose: "citation_scan",
          },
        });

        const parsed = parseCitationResponse({
          response: res.text,
          brandTerms,
          competitors,
        });
        await prisma.scanResult.create({
          data: {
            scanRunId: scanRun.id,
            promptId: prompt.id,
            rawResponse: res.text,
            brandMentioned: parsed.brandMentioned,
            productsMentioned: parsed.productsMentioned,
            competitorsMentioned: parsed.competitorsMentioned,
            citedDomains: parsed.citedDomains,
          },
        });

        if (wouldExceedCap(spent, 0, capCents)) {
          stoppedByCap = true;
          break;
        }
      }
    } catch (e) {
      // Engine adapter failure — isolate: fail this run, continue other engines.
      failed = true;
      console.error(`Citation engine ${provider.engine} failed:`, e);
    }

    await prisma.scanRun.update({
      where: { id: scanRun.id },
      data: {
        status: failed ? "FAILED" : "COMPLETED",
        finishedAt: new Date(),
        costCents: runCost,
      },
    });

    if (stoppedByCap) {
      console.warn(
        `Citation scan hit the daily cost cap for shop ${shopId} — stopping.`,
      );
      break;
    }
  }

  return { stoppedByCap, engines, costCents: totalCost };
}

/** Run scans for every active prompt of a shop. */
export async function runAllScans(shopId: string): Promise<ScanOutcome> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new Error("Shop not found.");

  const [prompts, competitors] = await Promise.all([
    prisma.trackedPrompt.findMany({ where: { shopId, active: true } }),
    prisma.competitor.findMany({ where: { shopId } }),
  ]);

  const brandTerms = brandTermsFor(shop.domain, shop.settings);
  const comps: Competitor[] = competitors.map((c) => ({
    name: c.name,
    domain: c.domain,
  }));

  let stoppedByCap = false;
  const engines = new Set<string>();
  let costCents = 0;

  for (const prompt of prompts) {
    const outcome = await runScanForPrompt(
      shopId,
      { id: prompt.id, text: prompt.text },
      brandTerms,
      comps,
    );
    outcome.engines.forEach((e) => engines.add(e));
    costCents += outcome.costCents;
    if (outcome.stoppedByCap) {
      stoppedByCap = true;
      break;
    }
  }

  return { stoppedByCap, engines: [...engines], costCents };
}
