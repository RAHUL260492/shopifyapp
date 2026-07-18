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
  ButtonGroup,
  IndexTable,
  Select,
  EmptyState,
  Modal,
  ProgressBar,
  Divider,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shop.server";
import { listProducts, storeReadiness } from "../lib/products/query.server";
import type { ScoreBand } from "../lib/products/query.server";
import { syncCatalog } from "../lib/products/sync.server";
import { isEnrichmentConfigured } from "../lib/llm/index.server";
import { generateEnrichment } from "../lib/enrichment/generate.server";
import {
  applyDraft,
  approveDraft,
  rejectDraft,
  rollbackDraft,
} from "../lib/enrichment/apply.server";
import {
  resolveAndStorePlan,
  managedPricingUrl,
} from "../lib/billing/plan.server";
import { assertCanEnrich, canEnrich } from "../lib/billing/enforce";

type Tone = "success" | "attention" | "critical";

function scoreTone(score: number | null): Tone {
  if (score === null) return "attention";
  if (score >= 80) return "success";
  if (score >= 50) return "attention";
  return "critical";
}

const BAND_OPTIONS: { label: string; value: ScoreBand }[] = [
  { label: "All products", value: "all" },
  { label: "Needs work (under 50)", value: "needs_work" },
  { label: "Fair (50–79)", value: "fair" },
  { label: "Good (80+)", value: "good" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const plan = await resolveAndStorePlan(billing, shop.id);

  const url = new URL(request.url);
  const bandParam = url.searchParams.get("band") as ScoreBand | null;
  const band: ScoreBand = BAND_OPTIONS.some((o) => o.value === bandParam)
    ? (bandParam as ScoreBand)
    : "all";

  const [rows, readiness] = await Promise.all([
    listProducts(shop.id, band),
    storeReadiness(shop.id),
  ]);

  const products = rows.map((p) => ({
    id: p.id,
    title: p.title || "(untitled product)",
    score: p.readinessScore,
    issueCount: p.issues.length,
    breakdown: p.scoreBreakdown as unknown as {
      rules?: { id: string; label: string; ratio: number; weight: number }[];
      issues?: { type: string; severity: string; message: string }[];
    },
    drafts: p.enrichmentDrafts.map((d) => ({
      id: d.id,
      field: d.field,
      status: d.status,
      aiValue: d.aiValue,
    })),
  }));

  return {
    products,
    readiness,
    band,
    enrichmentConfigured: isEnrichmentConfigured(),
    plan,
    canEnrich: canEnrich(plan),
    pricingUrl: managedPricingUrl(session.shop),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "sync");

  try {
    if (intent === "sync") {
      const summary = await syncCatalog(admin, shop.id);
      return { ok: true, intent, ...summary };
    }
    if (intent === "generate") {
      // Server-side tier gate — enforced even against a direct API call (QA-7).
      assertCanEnrich(await resolveAndStorePlan(billing, shop.id));
      await generateEnrichment(admin, shop.id, String(form.get("productId")));
      return { ok: true, intent };
    }
    if (intent === "approve") {
      assertCanEnrich(await resolveAndStorePlan(billing, shop.id));
      // Explicit approval, then write-back (passes the approval gate).
      const draftId = String(form.get("draftId"));
      await approveDraft(shop.id, draftId);
      await applyDraft(admin, shop.id, draftId);
      return { ok: true, intent };
    }
    if (intent === "reject") {
      await rejectDraft(shop.id, String(form.get("draftId")));
      return { ok: true, intent };
    }
    if (intent === "rollback") {
      await rollbackDraft(admin, shop.id, String(form.get("draftId")));
      return { ok: true, intent };
    }
    return { ok: false, intent, error: "Unknown action." };
  } catch (e) {
    return { ok: false, intent, error: (e as Error).message };
  }
};

export default function Products() {
  const { products, readiness, band, enrichmentConfigured, canEnrich, pricingUrl } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const busy = navigation.state !== "idle" && navigation.formMethod === "POST";
  const busyIntent = navigation.formData?.get("intent");
  const syncing = busy && busyIntent === "sync";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const selected = products.find((p) => p.id === selectedId) ?? null;

  const post = (fields: Record<string, string>) => {
    setBannerDismissed(false);
    submit(fields, { method: "POST" });
  };
  const onSync = () => post({ intent: "sync" });
  const onBandChange = (value: string) =>
    submit({ band: value }, { method: "GET" });

  const hasAny = readiness.productCount > 0;
  const showSynced =
    actionData?.ok && actionData.intent === "sync" && !busy && !bannerDismissed;
  const errorMessage =
    actionData && !actionData.ok
      ? ((actionData as { error?: string }).error ?? "Please try again.")
      : null;
  const showError = Boolean(errorMessage) && !busy && !bannerDismissed;

  return (
    <Page>
      <TitleBar title="Products" />
      <Layout>
        {showSynced && "productCount" in actionData && (
          <Layout.Section>
            <Banner
              tone="success"
              title="Catalog synced"
              onDismiss={() => setBannerDismissed(true)}
            >
              <p>
                Scored {actionData.productCount}{" "}
                {actionData.productCount === 1 ? "product" : "products"} · store
                score {actionData.storeScore}/100.
              </p>
            </Banner>
          </Layout.Section>
        )}
        {showError && (
          <Layout.Section>
            <Banner
              tone="critical"
              title="Something went wrong"
              onDismiss={() => setBannerDismissed(true)}
            >
              <p>{errorMessage}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Product readiness
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    {hasAny
                      ? `${readiness.productCount} products · store score ${readiness.storeScore}/100`
                      : "Sync your catalog to score every product for AI search visibility."}
                  </Text>
                </BlockStack>
                <Button variant="primary" loading={syncing} onClick={onSync}>
                  {hasAny ? "Re-sync catalog" : "Sync catalog"}
                </Button>
              </InlineStack>

              {hasAny && (
                <Box maxWidth="260px">
                  <Select
                    label="Filter by score"
                    labelHidden
                    options={BAND_OPTIONS}
                    value={band}
                    onChange={onBandChange}
                  />
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          {!hasAny ? (
            <Card>
              <EmptyState
                heading="No products synced yet"
                action={{
                  content: "Sync catalog",
                  onAction: onSync,
                  loading: syncing,
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Pull your catalog to score each product on the attributes AI
                  answer engines rely on — titles, descriptions, GTINs, images,
                  price, availability, and more.
                </p>
              </EmptyState>
            </Card>
          ) : products.length === 0 ? (
            <Card>
              <Box padding="400">
                <Text as="p" tone="subdued">
                  No products in this score band.
                </Text>
              </Box>
            </Card>
          ) : (
            <Card padding="0">
              <IndexTable
                resourceName={{ singular: "product", plural: "products" }}
                itemCount={products.length}
                selectable={false}
                headings={[
                  { title: "Product" },
                  { title: "Score" },
                  { title: "Issues" },
                ]}
              >
                {products.map((p, index) => (
                  <IndexTable.Row
                    id={p.id}
                    key={p.id}
                    position={index}
                    onClick={() => {
                      setBannerDismissed(true);
                      setSelectedId(p.id);
                    }}
                  >
                    <IndexTable.Cell>
                      <Text as="span" fontWeight="semibold">
                        {p.title}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={scoreTone(p.score)}>
                        {p.score === null ? "—" : `${p.score}/100`}
                      </Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {p.issueCount === 0 ? (
                        <Badge tone="success">No issues</Badge>
                      ) : (
                        <Text as="span">
                          {p.issueCount}{" "}
                          {p.issueCount === 1 ? "issue" : "issues"}
                        </Text>
                      )}
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            </Card>
          )}
        </Layout.Section>
      </Layout>

      <ProductDetail
        product={selected}
        enrichmentConfigured={enrichmentConfigured}
        canEnrich={canEnrich}
        pricingUrl={pricingUrl}
        busy={busy}
        onClose={() => setSelectedId(null)}
        onGenerate={() =>
          selected && post({ intent: "generate", productId: selected.id })
        }
        onDraftAction={(intent, draftId) => post({ intent, draftId })}
      />
    </Page>
  );
}

type LoadedProduct = ReturnType<
  typeof useLoaderData<typeof loader>
>["products"][number];

function severityTone(severity: string): Tone {
  return severity === "HIGH" ? "critical" : "attention";
}

function draftStatusTone(status: string): Tone {
  if (status === "APPLIED") return "success";
  if (status === "REJECTED") return "critical";
  return "attention";
}

function fieldLabel(field: string): string {
  if (field === "description") return "Description rewrite";
  if (field === "faq") return "FAQ block";
  if (field === "attributes") return "Attribute suggestions";
  return field;
}

function preview(aiValue: string): string {
  const text = aiValue.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 220 ? `${text.slice(0, 220)}…` : text;
}

function ProductDetail({
  product,
  enrichmentConfigured,
  canEnrich,
  pricingUrl,
  busy,
  onClose,
  onGenerate,
  onDraftAction,
}: {
  product: LoadedProduct | null;
  enrichmentConfigured: boolean;
  canEnrich: boolean;
  pricingUrl: string;
  busy: boolean;
  onClose: () => void;
  onGenerate: () => void;
  onDraftAction: (intent: "approve" | "reject" | "rollback", id: string) => void;
}) {
  if (!product) return null;
  const rules = product.breakdown.rules ?? [];
  const issues = product.breakdown.issues ?? [];
  const activeDrafts = product.drafts.filter((d) => d.status !== "REJECTED");

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title={product.title}
      secondaryActions={[{ content: "Close", onAction: onClose }]}
    >
      <Modal.Section>
        <InlineStack gap="200" blockAlign="center">
          <Text as="span" variant="headingLg">
            {product.score ?? "—"}
          </Text>
          <Text as="span" tone="subdued">
            / 100 AI readiness
          </Text>
        </InlineStack>
      </Modal.Section>

      {issues.length > 0 && (
        <Modal.Section>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Fix list
            </Text>
            {issues.map((issue, i) => (
              <InlineStack
                key={`${issue.type}-${i}`}
                gap="200"
                blockAlign="center"
              >
                <Badge tone={severityTone(issue.severity)}>
                  {issue.severity}
                </Badge>
                <Text as="span">{issue.message}</Text>
              </InlineStack>
            ))}
          </BlockStack>
        </Modal.Section>
      )}

      <Modal.Section>
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h3" variant="headingSm">
              AI enrichment
            </Text>
            {enrichmentConfigured && canEnrich && (
              <Button loading={busy} onClick={onGenerate}>
                {activeDrafts.length > 0 ? "Regenerate" : "Generate improvements"}
              </Button>
            )}
          </InlineStack>

          {!enrichmentConfigured ? (
            <Banner tone="info">
              <p>
                Set <code>ANTHROPIC_API_KEY</code> to enable one-click,
                Claude-generated improvements. All output is reviewed and
                approved by you before anything is written to your store.
              </p>
            </Banner>
          ) : !canEnrich ? (
            <Banner tone="warning" title="Available on Growth & Pro">
              <BlockStack gap="200">
                <p>
                  AI enrichment (description rewrites, FAQ, and attribute
                  suggestions with one-click write-back) is included on the
                  Growth and Pro plans.
                </p>
                <InlineStack>
                  <Button url={pricingUrl} target="_blank" variant="primary">
                    Upgrade plan
                  </Button>
                </InlineStack>
              </BlockStack>
            </Banner>
          ) : activeDrafts.length === 0 ? (
            <Text as="p" tone="subdued" variant="bodySm">
              Generate AI-suggested improvements (description, FAQ, attributes).
              Nothing is written to your store until you approve it.
            </Text>
          ) : (
            <BlockStack gap="300">
              {activeDrafts.map((d) => (
                <Box
                  key={d.id}
                  padding="300"
                  borderColor="border"
                  borderWidth="025"
                  borderRadius="200"
                >
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="span" fontWeight="semibold">
                        {fieldLabel(d.field)}
                      </Text>
                      <Badge tone={draftStatusTone(d.status)}>
                        {d.status === "APPLIED"
                          ? "Applied"
                          : d.status === "APPROVED"
                            ? "Approved"
                            : "AI-generated draft"}
                      </Badge>
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {preview(d.aiValue)}
                    </Text>
                    <Divider />
                    <ButtonGroup>
                      {d.status === "DRAFT" && (
                        <>
                          <Button
                            variant="primary"
                            loading={busy}
                            onClick={() => onDraftAction("approve", d.id)}
                          >
                            Approve &amp; apply
                          </Button>
                          <Button
                            loading={busy}
                            onClick={() => onDraftAction("reject", d.id)}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {d.status === "APPLIED" && (
                        <Button
                          tone="critical"
                          loading={busy}
                          onClick={() => onDraftAction("rollback", d.id)}
                        >
                          Roll back
                        </Button>
                      )}
                    </ButtonGroup>
                  </BlockStack>
                </Box>
              ))}
            </BlockStack>
          )}
        </BlockStack>
      </Modal.Section>

      <Modal.Section>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            Score breakdown
          </Text>
          {rules.map((rule) => (
            <BlockStack key={rule.id} gap="100">
              <InlineStack align="space-between">
                <Text as="span">{rule.label}</Text>
                <Text as="span" tone="subdued">
                  {Math.round(rule.ratio * rule.weight)} / {rule.weight}
                </Text>
              </InlineStack>
              <ProgressBar
                progress={Math.round(rule.ratio * 100)}
                size="small"
                tone={
                  rule.ratio >= 0.8
                    ? "success"
                    : rule.ratio >= 0.5
                      ? "primary"
                      : "critical"
                }
              />
            </BlockStack>
          ))}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
