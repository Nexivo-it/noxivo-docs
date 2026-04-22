---
slug: /
---
# Introduction

Welcome to the **Noxivo Engine Developer Documentation**.

Noxivo is a high-performance, headless workflow engine designed to automate WhatsApp interactions at scale. Our architecture is built for decoupling, security, and "Agentic Intelligence."

## 🚀 Getting Started

To start using the Noxivo Engine API, you must first connect your WhatsApp account through our dashboard.

1.  **Log in to the Dashboard**: Go to [https://noxivo.app](https://noxivo.app).
2.  **Connect WhatsApp**: Navigate to the **Connection** tab and scan the QR code with your mobile device.
3.  **Generate API Key**: Go to **Settings > API Keys** and generate a **Scoped API Key**.
4.  **Authorized Access**: Use this key in the `API-Key` header for all requests.

---

## 🛠️ Public API Capabilities

Once connected, you can use our API to:
- **Send & Receive Messages**: Full support for text, media, and interactive elements.
- **Manage Contacts**: Sync and retrieve your WhatsApp contact list.
- **Messaging History**: Pull synchronized chat logs for a complete Team Inbox experience.
- **Webhooks**: Get real-time notifications for every new message or delivery update.

---

## 📦 Installation

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

## Core Features

- **Agentic Memory**: Persistent contact facts injected into AI prompts for hyper-contextual automation.
- **Visual DAG Builder**: Design complex automation flows using a modern drag-and-drop interface.
- **messaging Native Support**: Native handling of WhatsApp interactive payloads (Buttons and Lists).

## Integration Paths

Are you an agency or developer looking to connect external tools?

- Check out our [n8n Integration Guide](./integrations/n8n-guide.md) to start connecting your workflows to external services like Make, Zapier, or custom backends.

## API Security

All requests to the Noxivo Engine must be authenticated using the `API-Key` header.

To obtain your API key, log in to your **Noxivo Dashboard** at [https://noxivo.app](https://noxivo.app) and follow these steps:
1. Navigate to **Settings** in the sidebar.
2. Select the **API Keys** tab.
3. Click **Generate New Key**.
4. Securely store your `ENGINE_API_KEY`. It will only be shown once.

For more details on key types, see our [Authentication Guide](./api-reference/api-master-guide.md#1-global-authentication).
