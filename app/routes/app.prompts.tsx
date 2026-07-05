import type { LoaderFunctionArgs } from "@remix-run/node";
import { Page, Layout, Card, Text, BlockStack } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

// Prompts & Citations — prompt CRUD + citation results land here in Phase 4/5.
export default function Prompts() {
  return (
    <Page>
      <TitleBar title="Prompts & Citations" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Tracked prompts
              </Text>
              <Text as="p" tone="subdued">
                Define the prompts you want to track across AI answer engines.
                Citation tracking is built in Phase 4.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
