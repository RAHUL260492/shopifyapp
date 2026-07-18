import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
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
  Box,
  List,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shop.server";
import {
  auditRobotsTxt,
  buildRobotsFixLiquid,
  AI_CRAWLERS,
} from "../lib/robots/audit";
import type { CrawlerAuditResult } from "../lib/robots/audit";
import {
  resolveAndStorePlan,
  managedPricingUrl,
} from "../lib/billing/plan.server";
import { PLANS } from "../config";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const shopDomain = session.shop;

  const plan = await resolveAndStorePlan(billing, shop.id);
  const pricingUrl = managedPricingUrl(shopDomain);

  const llmsTxtUrl = `https://${shopDomain}/apps/cited/llms.txt`;

  let audit: CrawlerAuditResult[] | null = null;
  let robotsError: string | null = null;
  try {
    const res = await fetch(`https://${shopDomain}/robots.txt`, {
      headers: { "User-Agent": "Cited-Audit/1.0" },
    });
    if (res.ok) {
      audit = auditRobotsTxt(await res.text());
    } else {
      robotsError = `Could not read robots.txt (HTTP ${res.status}).`;
    }
  } catch {
    robotsError = "Could not reach the storefront to read robots.txt.";
  }

  const blocked = (audit ?? []).filter((c) => c.blocked);
  const fixLiquid =
    blocked.length > 0
      ? buildRobotsFixLiquid(
          blocked.map((c) => ({ name: c.name, userAgent: c.userAgent })),
        )
      : null;

  return {
    shopDomain,
    llmsTxtUrl,
    audit,
    robotsError,
    fixLiquid,
    plan,
    planName: PLANS[plan].name,
    priceUsd: PLANS[plan].priceUsd,
    pricingUrl,
  };
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <Box
      background="bg-surface-secondary"
      padding="300"
      borderRadius="200"
      overflowX="scroll"
    >
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        <code>{children}</code>
      </pre>
    </Box>
  );
}

export default function Settings() {
  const {
    llmsTxtUrl,
    audit,
    robotsError,
    fixLiquid,
    planName,
    priceUsd,
    pricingUrl,
  } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  const rows =
    audit ?? AI_CRAWLERS.map((c) => ({ ...c, blocked: false }));

  return (
    <Page>
      <TitleBar title="Settings" />
      <Layout>
        {/* Plan */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Plan
              </Text>
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone={priceUsd > 0 ? "success" : "info"}>
                    {planName}
                  </Badge>
                  <Text as="span" tone="subdued">
                    {priceUsd > 0 ? `$${priceUsd}/mo` : "Free"}
                  </Text>
                </InlineStack>
                <Button url={pricingUrl} target="_blank" variant="primary">
                  Manage plan
                </Button>
              </InlineStack>
              <Text as="p" tone="subdued" variant="bodySm">
                Plans and billing are managed by Shopify — charges appear on your
                Shopify invoice with a 7-day free trial.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* llms.txt */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                llms.txt
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                A live index of your published catalog for AI answer engines,
                served from your store and always up to date with your catalog.
              </Text>
              <CodeBlock>{llmsTxtUrl}</CodeBlock>
              <InlineStack gap="200">
                <CopyButton text={llmsTxtUrl} label="Copy URL" />
                <Button url={llmsTxtUrl} target="_blank" variant="plain">
                  Open
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* robots.txt audit */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  AI crawler access (robots.txt)
                </Text>
                <Button
                  loading={revalidator.state === "loading"}
                  onClick={() => revalidator.revalidate()}
                >
                  Re-check
                </Button>
              </InlineStack>

              {robotsError ? (
                <Banner tone="warning">
                  <p>{robotsError}</p>
                </Banner>
              ) : (
                <BlockStack gap="200">
                  {rows.map((c) => (
                    <InlineStack
                      key={c.userAgent}
                      align="space-between"
                      blockAlign="center"
                    >
                      <Text as="span">
                        {c.name}{" "}
                        <Text as="span" tone="subdued">
                          ({c.userAgent})
                        </Text>
                      </Text>
                      <Badge tone={c.blocked ? "critical" : "success"}>
                        {c.blocked ? "Blocked" : "Allowed"}
                      </Badge>
                    </InlineStack>
                  ))}
                </BlockStack>
              )}

              {fixLiquid && (
                <BlockStack gap="300">
                  <Banner tone="critical" title="Some AI crawlers are blocked">
                    <p>
                      Shopify only allows robots.txt changes via a{" "}
                      <code>templates/robots.txt.liquid</code> file. Copy the
                      snippet below into that template (Online Store → Edit code →
                      add a new template <code>robots.txt.liquid</code>) to allow
                      these crawlers.
                    </p>
                  </Banner>
                  <CodeBlock>{fixLiquid}</CodeBlock>
                  <InlineStack>
                    <CopyButton
                      text={fixLiquid}
                      label="Copy robots.txt.liquid"
                    />
                  </InlineStack>
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* JSON-LD */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Structured data (JSON-LD)
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                The “Cited SEO Schema” theme app embed adds Product, Offer,
                AggregateRating, Organization, and FAQ structured data to your
                storefront — helping AI engines and search understand your
                products. It adds no render-blocking weight.
              </Text>
              <List type="number">
                <List.Item>Online Store → Themes → Customize.</List.Item>
                <List.Item>
                  Open <b>App embeds</b> and enable <b>Cited SEO Schema</b>.
                </List.Item>
                <List.Item>
                  Save, then validate a product page with Google’s Rich Results
                  Test.
                </List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
