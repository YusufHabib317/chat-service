// Merchant-Customer Chat Types

export interface ChatSession {
  id: string;
  merchantId: string;
  customerId?: string;
  customerName: string;
  customerEmail?: string;
  status: 'active' | 'closed';
  aiEnabled: boolean;
  merchantTookOver: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  senderId?: string;
  senderType: 'customer' | 'merchant' | 'ai';
  content: string;
  createdAt: Date;
}

export interface MerchantContext {
  merchantId: string;
  name: string;
  description?: string;
  products: Array<{
    id: string;
    name: string;
    description?: string;
    priceUSD: number;
    priceSYP: number;
    category?: string;
  }>;
}

// Socket Event Types

export interface ServerToClientEvents {
  'message:receive': (message: ChatMessage) => void;
  'ai:response': (message: ChatMessage) => void;
  'merchant:online': (data: { merchantId: string }) => void;
  'merchant:offline': (data: { merchantId: string }) => void;
  'merchant:takeover': (data: { sessionId: string }) => void;
  'merchant:release_takeover': (data: { sessionId: string }) => void;
  'typing:start': (data: { senderType: 'customer' | 'merchant' }) => void;
  'typing:stop': (data: { senderType: 'customer' | 'merchant' }) => void;
  'session:created': (session: ChatSession) => void;
  'session:history': (messages: ChatMessage[]) => void;
  'error': (error: { message: string }) => void;
}

export interface ClientToServerEvents {
  'customer:join': (data: {
    merchantId: string;
    customerName: string;
    customerEmail?: string;
    customerId?: string;
  }) => void;
  'merchant:join': (data: { merchantId: string }) => void;
  'message:send': (data: {
    sessionId: string;
    content: string;
    senderType: 'customer' | 'merchant';
  }) => void;
  'merchant:takeover': (data: { sessionId: string }) => void;
  'merchant:release_takeover': (data: { sessionId: string }) => void;
  'typing:start': (data: { sessionId: string }) => void;
  'typing:stop': (data: { sessionId: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId?: string;
  userType?: 'customer' | 'merchant';
  merchantId?: string;
  sessionId?: string;
}
