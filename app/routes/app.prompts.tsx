import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Banner,
  Button,
  TextField,
  Box,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ensureShop } from "../lib/shop.server";
import { resolveAndStorePlan } from "../lib/billing/plan.server";
import {
  promptLimit,
  competitorLimit,
  assertWithinPromptLimit,
  assertWithinCompetitorLimit,
} from "../lib/billing/enforce";
import { citationEnginesConfigured } from "../lib/citations/index.server";
import { runAllScans, brandTermsFor } from "../lib/citations/scan.server";
import { aggregateSamples } from "../lib/citations/aggregate";
import type { CitationParseResult } from "../lib/citations/parse";
import { PLANS } from "../config";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const plan = await resolveAndStorePlan(billing, shop.id);

  const [prompts, competitors] = await Promise.all([
    prisma.trackedPrompt.findMany({
      where: { shopId: shop.id },
      include: { scanResults: { orderBy: { createdAt: "desc" }, take: 9 } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.competitor.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const promptViews = prompts.map((p) => {
    const results: CitationParseResult[] = p.scanResults.map((r) => ({
      brandMentioned: r.brandMentioned,
      productsMentioned: (r.productsMentioned as string[]) ?? [],
      competitorsMentioned: (r.competitorsMentioned as string[]) ?? [],
      citedDomains: (r.citedDomains as string[]) ?? [],
      ambiguous: [],
      empty: false,
    }));
    const agg = aggregateSamples(results);
    return {
      id: p.id,
      text: p.text,
      scanned: results.length > 0,
      brandVisibility: Math.round(agg.brandVisibility * 100),
      competitorsMentioned: agg.competitorsMentioned,
      citedDomains: agg.citedDomains,
      lastScanned: p.scanResults[0]?.createdAt ?? null,
    };
  });

  const brandAliases = brandTermsFor(shop.domain, shop.settings).join(", ");

  return {
    plan,
    planName: PLANS[plan].name,
    promptViews,
    competitors: competitors.map((c) => ({
      id: c.id,
      name: c.name,
      domain: c.domain,
    })),
    brandAliases,
    limits: { prompt: promptLimit(plan), competitor: competitorLimit(plan) },
    enginesConfigured: citationEnginesConfigured(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const plan = await resolveAndStorePlan(billing, shop.id);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  try {
    if (intent === "addPrompt") {
      const text = String(form.get("text") ?? "").trim();
      if (!text) return { ok: false, error: "Enter a prompt." };
      const count = await prisma.trackedPrompt.count({
        where: { shopId: shop.id },
      });
      assertWithinPromptLimit(plan, count);
      await prisma.trackedPrompt.create({
        data: { shopId: shop.id, text, engineList: ["openai", "gemini"] },
      });
      return { ok: true, intent };
    }
    if (intent === "deletePrompt") {
      await prisma.trackedPrompt.deleteMany({
        where: { id: String(form.get("id")), shopId: shop.id },
      });
      return { ok: true, intent };
    }
    if (intent === "addCompetitor") {
      const name = String(form.get("name") ?? "").trim();
      const domain = String(form.get("domain") ?? "").trim();
      if (!name) return { ok: false, error: "Enter a competitor name." };
      const count = await prisma.competitor.count({
        where: { shopId: shop.id },
      });
      assertWithinCompetitorLimit(plan, count);
      await prisma.competitor.create({
        data: { shopId: shop.id, name, domain },
      });
      return { ok: true, intent };
    }
    if (intent === "deleteCompetitor") {
      await prisma.competitor.deleteMany({
        where: { id: String(form.get("id")), shopId: shop.id },
      });
      return { ok: true, intent };
    }
    if (intent === "saveAliases") {
      const aliases = String(form.get("aliases") ?? "")
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      const settings = (shop.settings as Record<string, unknown>) ?? {};
      await prisma.shop.update({
        where: { id: shop.id },
        data: { settings: { ...settings, brandAliases: aliases } },
      });
      return { ok: true, intent };
    }
    if (intent === "runScan") {
      const outcome = await runAllScans(shop.id);
      return {
        ok: true,
        intent,
        stoppedByCap: outcome.stoppedByCap,
        engines: outcome.engines.join(", "),
      };
    }
    return { ok: false, error: "Unknown action." };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
};

export default function Prompts() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const busy = navigation.state !== "idle";
  const busyIntent = navigation.formData?.get("intent");

  const [promptText, setPromptText] = useState("");
  const [compName, setCompName] = useState("");
  const [compDomain, setCompDomain] = useState("");
  const [aliases, setAliases] = useState(data.brandAliases);
  const [dismissed, setDismissed] = useState(false);

  const post = (fields: Record<string, string>) => {
    setDismissed(false);
    submit(fields, { method: "POST" });
  };

  const promptFull = data.promptViews.length >= data.limits.prompt;
  const compFull = data.competitors.length >= data.limits.competitor;
  const errorMsg =
    actionData && !actionData.ok
      ? ((actionData as { error?: string }).error ?? "Please try again.")
      : null;
  const scan =
    actionData &&
    actionData.ok &&
    (actionData as { intent?: string }).intent === "runScan"
      ? (actionData as { stoppedByCap?: boolean; engines?: string })
      : null;
  const showScan = Boolean(scan) && !busy && !dismissed;

  return (
    <Page>
      <TitleBar title="Prompts & Citations" />
      <Layout>
        {showScan && scan && (
          <Layout.Section>
            <Banner
              tone={scan.stoppedByCap ? "warning" : "success"}
              title={
                scan.stoppedByCap ? "Scan stopped at cost cap" : "Scan complete"
              }
              onDismiss={() => setDismissed(true)}
            >
              <p>
                {scan.stoppedByCap
                  ? "The daily cost cap was reached; results so far are saved."
                  : `Scanned across: ${scan.engines}.`}
              </p>
            </Banner>
          </Layout.Section>
        )}
        {errorMsg && !busy && !dismissed && (
          <Layout.Section>
            <Banner
              tone="critical"
              title="Something went wrong"
              onDismiss={() => setDismissed(true)}
            >
              <p>{errorMsg}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Tracked prompts
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    {data.promptViews.length}/{data.limits.prompt} used ·{" "}
                    {data.planName} plan
                  </Text>
                </BlockStack>
                <Button
                  variant="primary"
                  loading={busy && busyIntent === "runScan"}
                  disabled={data.promptViews.length === 0}
                  onClick={() => post({ intent: "runScan" })}
                >
                  Run scan now
                </Button>
              </InlineStack>

              {!data.enginesConfigured && (
                <Banner tone="info">
                  <p>
                    No AI engine keys set — scans run against a mock engine so you
                    can try the flow. Add <code>OPENAI_API_KEY</code> and{" "}
                    <code>GOOGLE_AI_API_KEY</code> for real ChatGPT/Gemini
                    results.
                  </p>
                </Banner>
              )}

              <InlineStack gap="200" blockAlign="end">
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Add a prompt"
                    labelHidden
                    autoComplete="off"
                    placeholder='e.g. "best wool beanie for winter"'
                    value={promptText}
                    onChange={setPromptText}
                    disabled={promptFull}
                  />
                </div>
                <Button
                  loading={busy && busyIntent === "addPrompt"}
                  disabled={promptFull || !promptText.trim()}
                  onClick={() => {
                    post({ intent: "addPrompt", text: promptText });
                    setPromptText("");
                  }}
                >
                  Add
                </Button>
              </InlineStack>
              {promptFull && (
                <Text as="p" tone="subdued" variant="bodySm">
                  You’ve reached your plan’s prompt limit. Upgrade to track more.
                </Text>
              )}

              <Divider />

              {data.promptViews.length === 0 ? (
                <Text as="p" tone="subdued">
                  No prompts yet. Add the questions your buyers ask AI engines.
                </Text>
              ) : (
                <BlockStack gap="300">
                  {data.promptViews.map((p) => (
                    <Box
                      key={p.id}
                      padding="300"
                      borderColor="border"
                      borderWidth="025"
                      borderRadius="200"
                    >
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="span" fontWeight="semibold">
                            {p.text}
                          </Text>
                          <Button
                            variant="plain"
                            tone="critical"
                            onClick={() =>
                              post({ intent: "deletePrompt", id: p.id })
                            }
                          >
                            Delete
                          </Button>
                        </InlineStack>
                        {p.scanned ? (
                          <BlockStack gap="100">
                            <InlineStack gap="200" blockAlign="center">
                              <Badge
                                tone={
                                  p.brandVisibility >= 50
                                    ? "success"
                                    : p.brandVisibility > 0
                                      ? "attention"
                                      : "critical"
                                }
                              >
                                {`Brand visibility ${p.brandVisibility}%`}
                              </Badge>
                              {p.competitorsMentioned.length > 0 && (
                                <Text as="span" variant="bodySm" tone="subdued">
                                  Competitors:{" "}
                                  {p.competitorsMentioned.join(", ")}
                                </Text>
                              )}
                            </InlineStack>
                            {p.citedDomains.length > 0 && (
                              <Text as="span" variant="bodySm" tone="subdued">
                                Cited domains:{" "}
                                {p.citedDomains.slice(0, 6).join(", ")}
                              </Text>
                            )}
                            <Text as="span" variant="bodySm" tone="subdued">
                              Last scanned{" "}
                              {p.lastScanned
                                ? new Date(p.lastScanned).toLocaleString()
                                : "—"}{" "}
                              · AI answers vary between runs.
                            </Text>
                          </BlockStack>
                        ) : (
                          <Text as="span" variant="bodySm" tone="subdued">
                            Not scanned yet.
                          </Text>
                        )}
                      </BlockStack>
                    </Box>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Competitors */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Competitors
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {data.competitors.length}/{data.limits.competitor} used — tracked
                for share-of-voice in scan results.
              </Text>
              <InlineStack gap="200" blockAlign="end">
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Name"
                    labelHidden
                    autoComplete="off"
                    placeholder="Competitor name"
                    value={compName}
                    onChange={setCompName}
                    disabled={compFull}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Domain"
                    labelHidden
                    autoComplete="off"
                    placeholder="competitor.com"
                    value={compDomain}
                    onChange={setCompDomain}
                    disabled={compFull}
                  />
                </div>
                <Button
                  disabled={compFull || !compName.trim()}
                  loading={busy && busyIntent === "addCompetitor"}
                  onClick={() => {
                    post({
                      intent: "addCompetitor",
                      name: compName,
                      domain: compDomain,
                    });
                    setCompName("");
                    setCompDomain("");
                  }}
                >
                  Add
                </Button>
              </InlineStack>
              {compFull && data.limits.competitor === 0 && (
                <Text as="p" tone="subdued" variant="bodySm">
                  Competitor tracking is available on paid plans.
                </Text>
              )}
              {data.competitors.map((c) => (
                <InlineStack
                  key={c.id}
                  align="space-between"
                  blockAlign="center"
                >
                  <Text as="span">
                    {c.name}{" "}
                    <Text as="span" tone="subdued">
                      {c.domain}
                    </Text>
                  </Text>
                  <Button
                    variant="plain"
                    tone="critical"
                    onClick={() =>
                      post({ intent: "deleteCompetitor", id: c.id })
                    }
                  >
                    Delete
                  </Button>
                </InlineStack>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Brand aliases */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Brand names
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Comma-separated names/spellings the scanner treats as “you” (brand
                + key product names).
              </Text>
              <TextField
                label="Brand names"
                labelHidden
                autoComplete="off"
                value={aliases}
                onChange={setAliases}
                helpText="e.g. Acme, Acme Beanie, AcmeCo"
              />
              <InlineStack>
                <Button
                  loading={busy && busyIntent === "saveAliases"}
                  onClick={() => post({ intent: "saveAliases", aliases })}
                >
                  Save
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
