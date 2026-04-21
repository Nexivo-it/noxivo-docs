type SupportedLlmProvider = 'openai' | 'anthropic';

type ProviderMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ProviderGenerationInput = {
  systemPrompt: string;
  messages: ProviderMessage[];
};

type ProviderGenerationResult = {
  text: string;
};

type CatalogItemContext = {
  itemType: string;
  name?: string;
  currentDescription?: string;
  industry?: string;
};

type SeoRefineContext = {
  title: string;
  description: string;
  name: string;
};

type ResolvedProviderConfig = {
  provider: SupportedLlmProvider;
  apiKey: string;
  model: string;
  endpoint: string;
};

function resolveProviderConfig(): ResolvedProviderConfig {
  const provider = (process.env.LLM_PROVIDER ?? 'openai').trim().toLowerCase();

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider');
    }

    return {
      provider: 'anthropic',
      apiKey,
      model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-3-5-sonnet-20241022',
      endpoint: process.env.ANTHROPIC_API_URL?.trim() || 'https://api.anthropic.com/v1/messages',
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for OpenAI provider');
  }

  return {
    provider: 'openai',
    apiKey,
    model: process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini',
    endpoint: process.env.OPENAI_API_URL?.trim() || 'https://api.openai.com/v1/chat/completions',
  };
}

async function generateWithOpenAi(
  config: ResolvedProviderConfig,
  input: ProviderGenerationInput,
): Promise<ProviderGenerationResult> {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'system', content: input.systemPrompt }, ...input.messages],
      temperature: 0.3,
    }),
  });

  const payload = await response.json() as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || 'OpenAI request failed');
  }

  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('OpenAI response did not include message content');
  }

  return { text };
}

async function generateWithAnthropic(
  config: ResolvedProviderConfig,
  input: ProviderGenerationInput,
): Promise<ProviderGenerationResult> {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 300,
      temperature: 0.3,
      system: input.systemPrompt,
      messages: input.messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
        })),
    }),
  });

  const payload = await response.json() as {
    error?: { message?: string };
    content?: Array<{ type?: string; text?: string }>;
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || 'Anthropic request failed');
  }

  const text = payload.content?.find((entry) => entry.type === 'text')?.text?.trim();
  if (!text) {
    throw new Error('Anthropic response did not include text content');
  }

  return { text };
}

async function generate(input: ProviderGenerationInput): Promise<ProviderGenerationResult> {
  const config = resolveProviderConfig();
  if (config.provider === 'anthropic') {
    return generateWithAnthropic(config, input);
  }

  return generateWithOpenAi(config, input);
}

export async function suggestCatalogMetadata(context: CatalogItemContext): Promise<unknown> {
  const systemPrompt = `You are an expert e-commerce and SEO strategist for a SaaS platform called Noxivo.
Your goal is to help users optimize their catalog items (services or products).
Provide high-quality, professional, and persuasive suggestions for:
1. Optimized Name
2. Professional Description (short and long)
3. SEO Title (max 60 chars)
4. SEO Description (max 160 chars)
5. SEO Keywords (comma separated)

Keep the tone premium, trustworthy, and conversion-oriented.
Return ONLY a JSON object with the following structure:
{
  "name": "...",
  "shortDescription": "...",
  "longDescription": "...",
  "seoTitle": "...",
  "seoDescription": "...",
  "seoKeywords": ["...", "..."]
}`;

  const userPrompt = `Context:
Category/Type: ${context.itemType}
Current Name: ${context.name || 'Untitled'}
Industry: ${context.industry || 'General'}
Current Description: ${context.currentDescription || 'None provided'}

Please provide optimized metadata for this item.`;

  const result = await generate({
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return JSON.parse(result.text);
}

export async function refineCatalogSeo(context: SeoRefineContext): Promise<unknown> {
  const systemPrompt = `You are an SEO expert. Refine the given SEO metadata for a product/service to maximize search engine visibility and click-through rate.
Return ONLY a JSON object:
{
  "seoTitle": "...",
  "seoDescription": "...",
  "seoKeywords": ["...", "..."]
}`;

  const userPrompt = `Item Name: ${context.name}
Current SEO Title: ${context.title}
Current SEO Description: ${context.description}

Please refine these for better performance.`;

  const result = await generate({
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return JSON.parse(result.text);
}
