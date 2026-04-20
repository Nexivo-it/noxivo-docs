import { generateInboxReply, ProviderGenerationInput } from './provider-client';

export interface CatalogItemContext {
  itemType: string;
  name?: string;
  currentDescription?: string;
  industry?: string;
}

export class CatalogAssistant {
  static async suggestMetadata(context: CatalogItemContext) {
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

    const input: ProviderGenerationInput = {
      systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    };

    try {
      const result = await generateInboxReply(input); // Using the existing generation logic
      return JSON.parse(result.text);
    } catch (error) {
      console.error('Catalog Assistant Error:', error);
      throw new Error('Failed to generate AI suggestions');
    }
  }

  static async refineSEO(context: { title: string; description: string; name: string }) {
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

    const input: ProviderGenerationInput = {
      systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    };

    try {
      const result = await generateInboxReply(input);
      return JSON.parse(result.text);
    } catch (error) {
      console.error('Catalog SEO Assistant Error:', error);
      throw new Error('Failed to refine SEO');
    }
  }
}
