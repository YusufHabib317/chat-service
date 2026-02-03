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

  async releaseTakeover(sessionId: string): Promise<void> {
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        merchantTookOver: false,
        aiEnabled: true
      }
    });
  }

  async findOrCreateSession(
    merchantId: string,
    customerId: string,
    customerName: string,
    customerEmail?: string
  ): Promise<ChatSession> {
    // Try to find an active session for this customer and merchant
    const existingSession = await prisma.chatSession.findFirst({
      where: {
        merchantId,
        customerId,
        status: 'active'
      },
      orderBy: { updatedAt: 'desc' }
    });

    if (existingSession) {
      // Update customer info in case it changed
      const updated = await prisma.chatSession.update({
        where: { id: existingSession.id },
        data: {
          customerName,
          customerEmail,
          updatedAt: new Date()
        }
      });
      return updated as ChatSession;
    }

    // Create new session if none exists
    return await this.createSession(merchantId, customerName, customerEmail, customerId);
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
