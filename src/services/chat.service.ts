import { prisma } from '../lib/prisma';
import { ChatSession, ChatMessage } from '../types/chat.types';

export class ChatService {
  async createSession(
    merchantId: string,
    customerName: string,
    customerEmail?: string,
    customerId?: string
  ): Promise<ChatSession> {
    const session = await prisma.chatSession.create({
      data: {
        merchantId,
        customerId,
        customerName,
        customerEmail,
        status: 'active',
        aiEnabled: true,
        merchantTookOver: false
      }
    });

    return session as ChatSession;
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId }
    });

    return session as ChatSession | null;
  }

  async getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    const messages = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' }
    });

    return messages as ChatMessage[];
  }

  async getMerchantSessions(merchantId: string): Promise<ChatSession[]> {
    const sessions = await prisma.chatSession.findMany({
      where: { 
        merchantId,
        status: 'active'
      },
      orderBy: { updatedAt: 'desc' }
    });

    return sessions as ChatSession[];
  }

  async saveMessage(
    sessionId: string,
    content: string,
    senderType: 'customer' | 'merchant' | 'ai',
    senderId?: string
  ): Promise<ChatMessage> {
    const message = await prisma.chatMessage.create({
      data: {
        sessionId,
        senderId,
        senderType,
        content
      }
    });

    // Update session timestamp
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() }
    });

    return message as ChatMessage;
  }

  async merchantTakeover(sessionId: string): Promise<void> {
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        merchantTookOver: true,
        aiEnabled: false
      }
    });
  }

  async closeSession(sessionId: string): Promise<void> {
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { status: 'closed' }
    });
  }

  async toggleAI(sessionId: string, enabled: boolean): Promise<void> {
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { aiEnabled: enabled }
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }
}

export const chatService = new ChatService();
