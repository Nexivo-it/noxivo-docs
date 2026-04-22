---
slug: /
---
# Introduction

Welcome to the **Noxivo Engine Developer Documentation**.

Noxivo is a high-performance, headless workflow engine designed to automate WhatsApp interactions at scale. Our architecture is built for decoupling, security, and "Agentic Intelligence."

## 🚀 Getting Started {#-getting-started}

To begin using the Noxivo Engine, you will need an API Key and an active WhatsApp session.

1. **Get your API Key**: Log in to the [Client Dashboard](https://noxivo.app/dashboard/settings) and navigate to the **API Keys** section.
2. **Connect WhatsApp**: Use the [Dashboard Settings](https://noxivo.app/dashboard/settings) to scan the QR code and link your WhatsApp account.
3. **Internal Administration**: Platform administrators can manage system-wide infrastructure at [admin.noxivo.app](https://admin.noxivo.app/).

---

## 🛠️ Public API Capabilities {#️-public-api-capabilities}

Once connected, you can use our API to:
- **Send & Receive Messages**: Full support for text, media, and interactive elements.
- **Manage Contacts**: Sync and retrieve your WhatsApp contact list.
- **Messaging History**: Pull synchronized chat logs for a complete Team Inbox experience.
- **Webhooks**: Get real-time notifications for every new message or delivery update.

---

## 📦 Installation {#-installation}

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs>
  <TabItem value="npm" label="npm" default>
    ```bash
    npm install @noxivo/engine-client
    ```
  </TabItem>
  <TabItem value="yarn" label="Yarn">
    ```bash
    yarn add @noxivo/engine-client
    ```
  </TabItem>
  <TabItem value="pnpm" label="pnpm">
    ```bash
    pnpm add @noxivo/engine-client
    ```
  </TabItem>
  <TabItem value="npx" label="npx">
    ```bash
    npx @noxivo/engine-client help
    ```
  </TabItem>
</Tabs>

## Core Features {#core-features}

- **Agentic Memory**: Persistent contact facts injected into AI prompts for hyper-contextual automation.
- **Visual DAG Builder**: Design complex automation flows using a modern drag-and-drop interface.
- **messaging Native Support**: Native handling of WhatsApp interactive payloads (Buttons and Lists).

## Integration Paths {#integration-paths}

Are you an agency or developer looking to connect external tools?

- Check out our [n8n Integration Guide](./integrations/n8n-guide.md) to start connecting your workflows to external services like Make, Zapier, or custom backends.

## API Security {#api-security}

All requests to the Noxivo Engine must be authenticated using the `API-Key` header.

To obtain your API key, log in to your **Noxivo Dashboard** at [https://noxivo.app](https://noxivo.app) and follow these steps:
1. Navigate to **Settings** in the sidebar.
2. Select the **API Keys** tab.
3. Click **Generate New Key**.
4. Securely store your `ENGINE_API_KEY`. It will only be shown once.

For more details on key types, see our [Authentication Guide](./api-reference/api-master-guide.md#1-authentication).
