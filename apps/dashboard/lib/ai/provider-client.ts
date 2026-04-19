export type SupportedLlmProvider = 'openai' | 'anthropic';

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderGenerationInput {
  systemPrompt: string;
  messages: ProviderMessage[];
}

export interface ProviderGenerationResult {
  text: string;
  provider: SupportedLlmProvider;
  model: string;
}

interface ResolvedProviderConfig {
  provider: SupportedLlmProvider;
  apiKey: string;
  model: string;
  endpoint: string;
}

function resolveProviderConfig(): ResolvedProviderConfig {
  const provider = (process.env.LLM_PROVIDER ?? 'openai').trim().toLowerCase() as SupportedLlmProvider;

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider');
    }

    return {
      provider,
      apiKey,
      model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-3-5-sonnet-20241022',
      endpoint: process.env.ANTHROPIC_API_URL?.trim() || 'https://api.anthropic.com/v1/messages'
    };
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY?.trim();

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAI provider');
    }

    return {
      provider,
      apiKey,
      model: process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini',
      endpoint: process.env.OPENAI_API_URL?.trim() || 'https://api.openai.com/v1/chat/completions'
    };
  }

  throw new Error(`Unsupported LLM provider: ${provider}`);
}

async function generateWithOpenAi(
  config: ResolvedProviderConfig,
  input: ProviderGenerationInput
): Promise<ProviderGenerationResult> {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: input.systemPrompt },
        ...input.messages
      ],
      temperature: 0.3
    })
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

  return {
    text,
    provider: 'openai',
    model: config.model
  };
}

async function generateWithAnthropic(
  config: ResolvedProviderConfig,
  input: ProviderGenerationInput
): Promise<ProviderGenerationResult> {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
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
          content: message.content
        }))
    })
  });

  const payload = await response.json() as {
    error?: { message?: string };
    content?: Array<{ type?: string; text?: string }>;
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || 'Anthropic request failed');
  }

  const text = payload.content?.find((item) => item.type === 'text')?.text?.trim();

  if (!text) {
    throw new Error('Anthropic response did not include text content');
  }

  return {
    text,
    provider: 'anthropic',
    model: config.model
  };
}

export async function generateInboxReply(input: ProviderGenerationInput): Promise<ProviderGenerationResult> {
  const config = resolveProviderConfig();

  if (config.provider === 'anthropic') {
    return generateWithAnthropic(config, input);
  }

  return generateWithOpenAi(config, input);
}
