# 📦 Client SDK

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

The Noxivo Engine provides a type-safe client for Node.js/TypeScript environments.

## Installation {#installation}

<Tabs>
  <TabItem value="npm" label="npm" default>
    ```bash
    npm install @noxivo/messaging-client
    ```
  </TabItem>
  <TabItem value="yarn" label="Yarn">
    ```bash
    yarn add @noxivo/messaging-client
    ```
  </TabItem>
  <TabItem value="pnpm" label="pnpm">
    ```bash
    pnpm add @noxivo/messaging-client
    ```
  </TabItem>
</Tabs>

## Usage {#usage}

### Importing the Client {#importing-the-client}

```typescript
import { MessagingSessionService } from '@noxivo/messaging-client';

// The client is designed to work with the Engine's proxy
const engineBaseUrl = 'https://api-workflow-engine.noxivo.app/api/v1';
const engineApiKey = 'your-engine-api-key';

// Example: Sending a message using the proxy
async function sendMessage(sessionName: string, chatId: string, text: string) {
  const response = await fetch(`${engineBaseUrl}/sendText`, {
    method: 'POST',
    headers: {
      'API-Key': engineApiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      session: sessionName,
      chatId: chatId,
      text: text
    })
  });
  
  return response.json();
}
```

---

## Shared Contracts {#shared-contracts}

You can also use our shared Zod schemas and TypeScript types:

<Tabs>
  <TabItem value="npm" label="npm" default>
    ```bash
    npm install @noxivo/contracts
    ```
  </TabItem>
  <TabItem value="yarn" label="Yarn">
    ```bash
    yarn add @noxivo/contracts
    ```
  </TabItem>
  <TabItem value="pnpm" label="pnpm">
    ```bash
    pnpm add @noxivo/contracts
    ```
  </TabItem>
</Tabs>

```typescript
import { SendMessageSchema } from '@noxivo/contracts';
```
