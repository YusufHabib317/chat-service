# Chat Server

Real-time chat server for MerchantHub with AI-powered customer support.

## Features

- **Real-time Communication**: Socket.IO for instant messaging
- **AI Assistant**: Automated responses using OpenAI GPT
- **Merchant Takeover**: Merchants can take control from AI
- **Session Management**: Persistent chat sessions with PostgreSQL
- **Typing Indicators**: Real-time typing status
- **Context-Aware AI**: AI responses based on merchant products

## Tech Stack

- **Express.js**: Web server
- **Socket.IO**: Real-time bidirectional communication
- **Prisma**: Database ORM
- **PostgreSQL**: Database (shared with merchant-hub)
- **OpenAI API**: AI response generation
- **TypeScript**: Type safety

## Setup

### 1. Install Dependencies

```bash
yarn install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```env
PORT=4000
CORS_ORIGIN=http://localhost:3000

# Database (same as merchant-hub)
DATABASE_URL="postgresql://user:password@localhost:5432/merchanthub"

# AI Configuration
AI_API_KEY=your-openai-api-key
AI_MODEL=gpt-4
AI_ENABLED=true

# Next.js API URL for fetching merchant context
NEXT_API_URL=http://localhost:3000
```

### 3. Setup Database

The chat server uses the same database as merchant-hub. Run migrations:

```bash
npx prisma generate
npx prisma db push
```

### 4. Start Server

Development mode:
```bash
yarn dev
```

Production mode:
```bash
yarn build
yarn start
```

## Socket Events

### Customer Events

**Emit:**
- `customer:join` - Join a merchant's chat
- `message:send` - Send a message
- `typing:start` - Start typing
- `typing:stop` - Stop typing

**Listen:**
- `session:created` - Session created successfully
- `session:history` - Previous messages
- `message:receive` - New message received
- `ai:response` - AI generated response
- `merchant:online` - Merchant came online
- `merchant:offline` - Merchant went offline
- `merchant:takeover` - Merchant took over from AI
- `typing:start` - Someone started typing
- `typing:stop` - Someone stopped typing
- `error` - Error occurred

### Merchant Events

**Emit:**
- `merchant:join` - Join as merchant
- `message:send` - Send a message
- `merchant:takeover` - Take over from AI
- `typing:start` - Start typing
- `typing:stop` - Stop typing

**Listen:**
- Same as customer events

## API Endpoints

### GET /health
Health check endpoint

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "aiEnabled": true
}
```

### GET /api/merchants/:merchantId/sessions
Get all active sessions for a merchant

**Response:**
```json
[
  {
    "id": "session-id",
    "merchantId": "merchant-id",
    "customerName": "John Doe",
    "customerEmail": "john@example.com",
    "status": "active",
    "aiEnabled": true,
    "merchantTookOver": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### GET /api/sessions/:sessionId/messages
Get all messages for a session

**Response:**
```json
[
  {
    "id": "message-id",
    "sessionId": "session-id",
    "senderId": "user-id",
    "senderType": "customer",
    "content": "Hello!",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

## AI Integration

The AI service:
1. Fetches merchant context (products, info) from Next.js API
2. Formats context into a system prompt
3. Includes conversation history
4. Generates contextual responses
5. Only answers questions about listed products

### AI Prompt Structure

```
You are a helpful AI assistant for [Merchant Name].

About the business: [Description]

Available products:
1. Product Name - Description
   Price: $X USD / X SYP
   Category: Category
   In Stock

IMPORTANT INSTRUCTIONS:
- Only answer questions about the products listed above
- Be helpful and friendly
- If asked about products not in the list, politely say they're not available
- Provide accurate pricing information
- Mention if a product is out of stock
- Do not make up information about products
- Keep responses concise and helpful
```

## Architecture

```
chat-server/
├── src/
│   ├── server.ts              # Main entry point
│   ├── socket/
│   │   ├── index.ts           # Socket setup
│   │   └── handlers/
│   │       ├── customer.handler.ts
│   │       ├── merchant.handler.ts
│   │       └── typing.handler.ts
│   ├── services/
│   │   ├── chat.service.ts    # Chat business logic
│   │   ├── ai.service.ts      # AI integration
│   │   └── context.service.ts # Merchant context
│   ├── lib/
│   │   └── prisma.ts          # Prisma client
│   └── types/
│       └── chat.types.ts      # TypeScript types
├── prisma/
│   └── schema.prisma          # Database schema
└── package.json
```

## Development

### Testing Socket Events

Use a Socket.IO client or the merchant-hub frontend to test:

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:4000');

// Join as customer
socket.emit('customer:join', {
  merchantId: 'merchant-id',
  customerName: 'Test User',
  customerEmail: 'test@example.com'
});

// Send message
socket.on('session:created', (session) => {
  socket.emit('message:send', {
    sessionId: session.id,
    content: 'Hello!',
    senderType: 'customer'
  });
});

// Listen for responses
socket.on('ai:response', (message) => {
  console.log('AI:', message.content);
});
```

## Troubleshooting

### AI not responding
- Check `AI_ENABLED=true` in `.env`
- Verify `AI_API_KEY` is valid
- Check OpenAI API quota/limits
- Review logs for API errors

### Socket connection issues
- Verify `CORS_ORIGIN` matches frontend URL
- Check firewall/network settings
- Ensure port 4000 is available

### Database errors
- Verify `DATABASE_URL` is correct
- Run `npx prisma generate`
- Check database is running
- Ensure migrations are applied

## Production Deployment

1. Set environment variables
2. Build the application: `yarn build`
3. Start with process manager (PM2, systemd, etc.)
4. Use reverse proxy (nginx) for SSL
5. Monitor logs and performance
6. Set up database backups

## License

MIT for real-time messaging.

## Features

- ✅ Real-time messaging with Socket.IO
- ✅ Multiple chat rooms support
- ✅ User join/leave notifications
- ✅ Message history (last 100 messages per room)
- ✅ REST API endpoints
- ✅ TypeScript support
- ✅ CORS configured for Next.js integration

## Installation

```bash
cd chat-server
npm install
# or
yarn install
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Update environment variables:
```env
PORT=4000
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development
```

## Running the Server

### Development Mode
```bash
npm run dev
# or
yarn dev
```

### Production Mode
```bash
npm run build
npm start
# or
yarn build
yarn start
```

The server will start on `http://localhost:4000` (or the port specified in `.env`).

## API Endpoints

### REST API

- `GET /health` - Health check endpoint
- `GET /rooms` - Get list of all chat rooms
- `GET /rooms/:roomId/messages` - Get messages for a specific room

### Socket.IO Events

#### Client → Server

- `joinRoom` - Join a chat room
  ```typescript
  socket.emit('joinRoom', { username: 'John', roomId: 'general' });
  ```

- `sendMessage` - Send a message
  ```typescript
  socket.emit('sendMessage', { content: 'Hello!', roomId: 'general' });
  ```

- `leaveRoom` - Leave a room
  ```typescript
  socket.emit('leaveRoom', 'general');
  ```

- `typing` - Notify typing status
  ```typescript
  socket.emit('typing', true);
  ```

#### Server → Client

- `message` - Receive a new message
- `userJoined` - User joined the room
- `userLeft` - User left the room
- `roomUsers` - List of users in the room
- `previousMessages` - Previous messages when joining

## Integration with Next.js

Install Socket.IO client in your Next.js project:

```bash
cd merchant-hub
npm install socket.io-client
# or
yarn add socket.io-client
```

Example client usage:

```typescript
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export default function Chat() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const newSocket = io('http://localhost:4000');
    setSocket(newSocket);

    newSocket.emit('joinRoom', { 
      username: 'User123', 
      roomId: 'general' 
    });

    newSocket.on('message', (message) => {
      setMessages((prev) => [...prev, message]);
    });

    newSocket.on('previousMessages', (messages) => {
      setMessages(messages);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const sendMessage = (content: string) => {
    socket?.emit('sendMessage', { 
      content, 
      roomId: 'general' 
    });
  };

  return (
    <div>
      {/* Your chat UI here */}
    </div>
  );
}
```

## Project Structure

```
chat-server/
├── src/
│   ├── types/
│   │   └── chat.types.ts    # TypeScript type definitions
│   └── server.ts            # Main server file
├── dist/                    # Compiled JavaScript (generated)
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore rules
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
└── README.md              # This file
```

## Technology Stack

- **Express** - Web framework
- **Socket.IO** - Real-time bidirectional communication
- **TypeScript** - Type-safe development
- **CORS** - Cross-origin resource sharing
- **dotenv** - Environment variable management

## Development

The server uses `ts-node-dev` for hot-reloading during development. Any changes to the source files will automatically restart the server.

## License

ISC
