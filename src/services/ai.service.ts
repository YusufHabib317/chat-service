import axios from 'axios';
import { contextService } from './context.service';
import { ChatMessage } from '../types/chat.types';
import logger from '../lib/logger';

// Fallback messages when AI fails to respond
const FALLBACK_MESSAGES = {
  ar: 'عذراً، حدث خطأ في معالجة طلبك. يرجى المحاولة مرة أخرى أو انتظار أحد ممثلي خدمة العملاء.',
  en: "I'm sorry, I encountered an error processing your request. Please try again or wait for a customer service representative.",
};

export class AIService {
  /**
   * Get AI API key from environment (not stored in memory)
   */
  private getApiKey(): string | undefined {
    return process.env.AI_API_KEY;
  }

  /**
   * Get AI model from environment
   */
  private getModel(): string {
    return process.env.AI_MODEL || 'gpt-4';
  }

  /**
   * Check if AI is enabled via environment
   */
  private isEnabled(): boolean {
    return process.env.AI_ENABLED === 'true';
  }

  private getFallbackMessage(): string {
    return FALLBACK_MESSAGES.ar;
  }

  async generateResponse(merchantId: string, conversationHistory: ChatMessage[]): Promise<string> {
    const apiKey = this.getApiKey();

    if (!this.isEnabled() || !apiKey) {
      return this.getFallbackMessage();
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
          model: this.getModel(),
          messages,
          temperature: 0.7,
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.CORS_ORIGIN || 'http://localhost:3000',
            'X-Title': 'MerchantHub Chat',
          },
        }
      );

      const aiContent = response.data.choices[0]?.message?.content;

      if (!aiContent || aiContent.trim() === '') {
        logger.warn('AI returned empty response, using fallback message', { merchantId });
        return this.getFallbackMessage();
      }

      return aiContent;
    } catch (error) {
      logger.error('Error generating AI response', error, { merchantId });
      return this.getFallbackMessage();
    }
  }

  isAIEnabled(): boolean {
    return this.isEnabled() && !!this.getApiKey();
  }
}

export const aiService = new AIService();
