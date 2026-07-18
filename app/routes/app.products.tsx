import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  IndexTable,
  Select,
  EmptyState,
  Modal,
  ProgressBar,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shop.server";
import { listProducts, storeReadiness } from "../lib/products/query.server";
import type { ScoreBand } from "../lib/products/query.server";
import { syncCatalog } from "../lib/products/sync.server";

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
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);

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
    handle: p.handle,
    score: p.readinessScore,
    issueCount: p.issues.length,
    breakdown: p.scoreBreakdown as unknown as {
      rules?: { id: string; label: string; ratio: number; weight: number }[];
      issues?: { type: string; severity: string; message: string }[];
    },
  }));

  return { products, readiness, band };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const summary = await syncCatalog(admin, shop.id);
  return { synced: true, ...summary };
};

type LoadedProduct = ReturnType<
  typeof useLoaderData<typeof loader>
>["products"][number];

export default function Products() {
  const { products, readiness, band } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const syncing = navigation.state !== "idle" && navigation.formMethod === "POST";
  const [selected, setSelected] = useState<LoadedProduct | null>(null);

  const onSync = () => submit({}, { method: "POST" });
  const onBandChange = (value: string) =>
    submit({ band: value }, { method: "GET" });

  const hasAny = readiness.productCount > 0;

  return (
    <Page>
      <TitleBar title="Products" />
      <Layout>
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
                    onClick={() => setSelected(p)}
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

      <ProductDetail product={selected} onClose={() => setSelected(null)} />
    </Page>
  );
}

function severityTone(severity: string): Tone {
  if (severity === "HIGH") return "critical";
  return "attention";
}

function ProductDetail({
  product,
  onClose,
}: {
  product: LoadedProduct | null;
  onClose: () => void;
}) {
  if (!product) return null;
  const rules = product.breakdown.rules ?? [];
  const issues = product.breakdown.issues ?? [];

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
