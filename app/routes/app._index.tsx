import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  InlineStack,
  Badge,
  Button,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shop.server";
import { storeReadiness } from "../lib/products/query.server";
import { APP_NAME } from "../config";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const readiness = await storeReadiness(shop.id);
  return { readiness };
};

type Tone = "success" | "attention" | "critical";

function scoreTone(score: number): Tone {
  if (score >= 80) return "success";
  if (score >= 50) return "attention";
  return "critical";
}

export default function Overview() {
  const { readiness } = useLoaderData<typeof loader>();
  const scored = readiness.productCount > 0;

  return (
    <Page>
      <TitleBar title={`${APP_NAME} — Overview`} />
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  AI Readiness score
                </Text>
                {scored ? (
                  <>
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" variant="heading2xl">
                        {readiness.storeScore}
                      </Text>
                      <Text as="span" tone="subdued">
                        / 100
                      </Text>
                      <Badge tone={scoreTone(readiness.storeScore)}>
                        {`${readiness.productCount} products`}
                      </Badge>
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Mean readiness across your synced catalog.
                    </Text>
                    <InlineStack>
                      <Button url="/app/products">Review products</Button>
                    </InlineStack>
                  </>
                ) : (
                  <>
                    <Badge tone="info">Not scored yet</Badge>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Sync your catalog to see a store-level readiness score.
                    </Text>
                    <InlineStack>
                      <Button variant="primary" url="/app/products">
                        Sync catalog
                      </Button>
                    </InlineStack>
                  </>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  AI Visibility score
                </Text>
                <Badge tone="info">No scans yet</Badge>
                <Text as="p" variant="bodySm" tone="subdued">
                  Add tracked prompts to start measuring AI visibility.
                  Citation tracking arrives in a later phase.
                </Text>
                <InlineStack>
                  <Button url="/app/prompts">Set up prompts</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
