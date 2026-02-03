import axios from 'axios';
import { contextService } from './context.service';
import { ChatMessage } from '../types/chat.types';

const { AI_API_KEY } = process.env;
const AI_MODEL = process.env.AI_MODEL || 'gpt-4';
const AI_ENABLED = process.env.AI_ENABLED === 'true';

export class AIService {
  async generateResponse(
    merchantId: string,
    conversationHistory: ChatMessage[]
  ): Promise<string | null> {
    if (!AI_ENABLED || !AI_API_KEY) {
      return null;
    }

    try {
      // Get merchant context
      const context = await contextService.getMerchantContext(merchantId);

      if (!context) {
        return "I'm sorry, I'm having trouble accessing the product information right now.";
      }

      // Format context for AI
      const systemPrompt = contextService.formatContextForAI(context);

      // Format conversation history
      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-10).map((msg) => ({
          role: msg.senderType === 'customer' ? 'user' : 'assistant',
          content: msg.content,
        })),
      ];

      // Call OpenRouter API
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: AI_MODEL,
          messages,
          temperature: 0.7,
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${AI_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.CORS_ORIGIN || 'http://localhost:3000',
            'X-Title': 'MerchantHub Chat',
          },
        }
      );

      return response.data.choices[0]?.message?.content || null;
    } catch (error) {
      console.error('Error generating AI response:', error);
      return null;
    }
  }

  isAIEnabled(): boolean {
    return AI_ENABLED && !!AI_API_KEY;
  }
}

export const aiService = new AIService();
