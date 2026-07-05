import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  Badge,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import { APP_NAME } from "../config";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

// Overview — store-level scores + trends land here in Phase 5.
export default function Overview() {
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
                <Badge tone="info">Not scored yet</Badge>
                <Text as="p" variant="bodySm" tone="subdued">
                  Sync your catalog to see a store-level readiness score.
                </Text>
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
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
