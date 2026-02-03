import { prisma } from '../lib/prisma';
import { MerchantContext } from '../types/chat.types';

interface CacheEntry {
  context: MerchantContext;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class ContextService {
  private cache = new Map<string, CacheEntry>();

  async getMerchantContext(merchantId: string): Promise<MerchantContext | null> {
    // Check cache
    const cached = this.cache.get(merchantId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.context;
    }

    try {
      const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId },
        include: {
          products: {
            select: {
              id: true,
              name: true,
              description: true,
              priceUSD: true,
              priceSYP: true,
              category: true
            }
          }
        }
      });

      if (!merchant) return null;

      const context: MerchantContext = {
        merchantId: merchant.id,
        name: merchant.name,
        description: merchant.description || undefined,
        products: merchant.products.map(p => ({
          ...p,
          description: p.description || undefined,
          category: p.category || undefined
        }))
      };

      // Update cache
      this.cache.set(merchantId, {
        context,
        timestamp: Date.now()
      });

      return context;
    } catch (error) {
      console.error('Error fetching merchant context:', error);
      return null;
    }
  }

  formatContextForAI(context: MerchantContext): string {
    const { name, description, products } = context;
    
    let prompt = `You are a helpful AI assistant for ${name}.`;
    
    if (description) {
      prompt += `\n\nAbout the business: ${description}`;
    }
    
    prompt += `\n\nAvailable products:\n`;
    
    products.forEach((product, index) => {
      prompt += `\n${index + 1}. ${product.name}`;
      if (product.description) {
        prompt += ` - ${product.description}`;
      }
      prompt += `\n   Price: $${product.priceUSD} USD / ${product.priceSYP.toLocaleString()} SYP`;
      if (product.category) {
        prompt += `\n   Category: ${product.category}`;
      }
    });
    
    prompt += `\n\nIMPORTANT INSTRUCTIONS:
- Only answer questions about the products listed above
- Be helpful and friendly
- If asked about products not in the list, politely say they're not available
- Provide accurate pricing information
- Do not make up information about products
- Keep responses concise and helpful`;
    
    return prompt;
  }
}

export const contextService = new ContextService();
