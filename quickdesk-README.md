# QuickDesk

> Real-time customer support chat system.
> Agents handle multiple simultaneous conversations with customers via Socket.IO. Messages persist in PostgreSQL, Redis powers pub/sub for horizontal scaling. Includes a React frontend for the full experience.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Language | TypeScript (strict mode) |
| HTTP Framework | Express.js |
| Real-time | Socket.IO + @socket.io/redis-adapter |
| Database | PostgreSQL 15 |
| ORM | Prisma |
| Cache / Pub-Sub | Redis (ioredis) |
| Auth | JWT (access + refresh tokens), bcrypt |
| Validation | Zod |
| Logging | pino + pino-pretty (dev) |
| Security | helmet, cors, rate-limiter-flexible |
| Frontend | React 18, Vite, Tailwind CSS, Zustand, react-hot-toast |
| Testing | Jest + Supertest |
| Containerization | Docker + Docker Compose |
| CI/CD | GitHub Actions |
| Linting | ESLint + Prettier |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│               React Frontend (Vite)                   │
│          Tailwind CSS + Zustand + Socket.IO           │
│                                                       │
│  /login  /register  /dashboard  /chat/:roomId         │
└────────────────────┬─────────────────────────────────┘
                     │ REST + Socket.IO
                     ▼
┌──────────────────────────────────────────────────────┐
│              API + Socket.IO Server                   │
│              (Express + Socket.IO)                    │
│                                                       │
│  POST /api/auth/register     → register customer      │
│  POST /api/auth/login        → get JWT                │
│  POST /api/auth/refresh      → refresh access token   │
│  POST /api/auth/guest        → anonymous guest session │
│  POST /api/rooms             → create support room    │
│  GET  /api/rooms             → list rooms             │
│  GET  /api/rooms/:id         → room details           │
│  PATCH /api/rooms/:id/assign → assign agent           │
│  PATCH /api/rooms/:id/close  → close room             │
│  GET  /api/rooms/:id/messages → cursor-paginated history │
│  GET  /api/admin/users       → list users (admin)     │
│  PATCH /api/admin/users/:id/role → change role (admin) │
│                                                       │
│  Socket.IO (namespaced events)                        │
│    → room:join     { roomId }                         │
│    → room:leave    { roomId }                         │
│    → message:send  { roomId, content }                │
│    → typing:start  { roomId }                         │
│    → typing:stop   { roomId }                         │
└────────────────────┬─────────────────────────────────┘
                     │ publish / subscribe
                     ▼
┌──────────────────────────────────────────────────────┐
│                     Redis                             │
│                                                       │
│  Socket.IO Redis adapter  → cross-instance messaging  │
│  key: room:{roomId}:typing → typing status            │
└────────────────────┬─────────────────────────────────┘
                     │ persist
                     ▼
┌──────────────────────────────────────────────────────┐
│                   PostgreSQL                          │
│                                                       │
│  users · rooms · messages · room_members              │
└──────────────────────────────────────────────────────┘
```

### Why Redis Pub/Sub?

If two agents connect to **different server instances**, they need to receive each other's messages. The Socket.IO Redis adapter uses Redis pub/sub as the message bus between instances — this is the pattern used in production-grade chat systems.

```
Agent A (instance 1) ──publish──▶ Redis ──subscribe──▶ Agent B (instance 2)
```

---

## User Roles

| Role | Description | Permissions |
|---|---|---|
| guest | Anonymous visitor, auto-created on first visit | Create room, send messages in own room only |
| customer | Registered user (email-verified guest) | Create rooms, view own history, send messages in own rooms |
| agent | Support staff | View all open rooms, get assigned, send messages, close rooms |
| admin | System administrator | Everything agent can + manage users, change roles |

---

## Room Lifecycle

Rooms follow a three-stage lifecycle: **waiting → active → closed**.

```
Guest/Customer opens chat
        │
        ▼
  Room created (status: waiting)
        │
        ▼
  Auto-assign to available agent  ──▶  No agent? stays in queue
        │
        ▼
  Room status: active (agent assigned)
        │
        ▼
  Conversation happens (messages via Socket.IO)
        │
        ▼
  Agent or admin closes room (status: closed)
        │
        ▼
  closed_at timestamp set, room archived
```

### Assignment

- **Auto-assign**: round-robin among online agents with fewest active rooms
- **Manual assign**: admin/agent can reassign rooms via API
- **Transfer**: agent can transfer room to another agent

---

## Socket.IO Events

### Client → Server

```typescript
// Join a support room
room:join      { roomId: string }

// Leave a room
room:leave     { roomId: string }

// Send a message
message:send   { roomId: string, content: string }

// Typing indicators
typing:start   { roomId: string }
typing:stop    { roomId: string }
```

### Server → Client

```typescript
// New message in room
message:new        { roomId, messageId, senderId, senderName, content, sentAt }

// Agent assigned to room
room:assigned      { roomId, agentId, agentName }

// Room closed
room:closed        { roomId, closedBy }

// User joined room
user:joined        { roomId, userId, username }

// User left room
user:left          { roomId, userId }

// Typing indicator update
typing:update      { roomId, userId, username, isTyping }

// Online presence in room
presence:update    { roomId, onlineUsers: [{ id, username, role }] }

// System message (e.g. "Agent X joined", "Room closed")
system:message     { roomId, content, sentAt }

// Error
error              { code: string, message: string }
```

---

## Database Schema

```sql
-- users
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
username      TEXT UNIQUE NOT NULL
email         TEXT UNIQUE          -- NULL for guests
password_hash TEXT                 -- NULL for guests
role          TEXT DEFAULT 'guest' -- guest | customer | agent | admin
is_online     BOOLEAN DEFAULT false
created_at    TIMESTAMP DEFAULT NOW()

-- rooms
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
title         TEXT NOT NULL
status        TEXT DEFAULT 'waiting' -- waiting | active | closed
created_by    UUID REFERENCES users(id)
assigned_to   UUID REFERENCES users(id)
created_at    TIMESTAMP DEFAULT NOW()
closed_at     TIMESTAMP

-- messages
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
room_id       UUID REFERENCES rooms(id) ON DELETE CASCADE
sender_id     UUID REFERENCES users(id)
content       TEXT NOT NULL
type          TEXT DEFAULT 'user'  -- user | system
sent_at       TIMESTAMP DEFAULT NOW()

-- room_members
room_id       UUID REFERENCES rooms(id) ON DELETE CASCADE
user_id       UUID REFERENCES users(id) ON DELETE CASCADE
joined_at     TIMESTAMP DEFAULT NOW()
PRIMARY KEY (room_id, user_id)
```

### Indexes

- `messages(room_id, sent_at DESC, id)` — cursor-based pagination
- `rooms(status)` — filtering open rooms
- `rooms(assigned_to)` — agent workload queries
- `users(email)` — login lookup

---

## Project Structure

```
quickdesk/
├── docker-compose.yml
├── .env.example
├── package.json
├── tsconfig.json
├── Dockerfile
├── jest.config.js
│
├── src/
│   ├── index.ts                    # Entry point + graceful shutdown
│   │
│   ├── config/
│   │   └── env.ts                  # Zod-validated env vars
│   │
│   ├── lib/
│   │   ├── db.ts                   # Prisma client singleton
│   │   ├── redis.ts                # ioredis pub + sub clients
│   │   ├── jwt.ts                  # Token sign/verify helpers
│   │   ├── logger.ts               # pino logger
│   │   └── errors.ts               # Custom error classes
│   │
│   ├── http/
│   │   ├── app.ts                  # Express app setup (helmet, cors, routes)
│   │   ├── middleware/
│   │   │   ├── auth.ts             # JWT verify middleware
│   │   │   ├── rbac.ts             # Role-based access control
│   │   │   ├── validate.ts         # Zod validation middleware
│   │   │   └── errorHandler.ts     # Global error handler
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   ├── rooms.routes.ts
│   │   │   └── admin.routes.ts
│   │   └── controllers/
│   │       ├── auth.controller.ts
│   │       ├── rooms.controller.ts
│   │       └── admin.controller.ts
│   │
│   ├── socket/
│   │   ├── index.ts                # Socket.IO server setup + Redis adapter
│   │   ├── auth.ts                 # Socket auth middleware
│   │   ├── events.ts               # Event name constants
│   │   └── handlers/
│   │       ├── room.handler.ts     # join/leave
│   │       ├── message.handler.ts  # send message
│   │       ├── typing.handler.ts   # typing indicators
│   │       └── presence.handler.ts # online tracking
│   │
│   └── services/
│       ├── auth.service.ts         # Business logic for auth
│       ├── room.service.ts         # Room CRUD + assignment logic
│       └── message.service.ts      # Message persistence + retrieval
│
├── prisma/
│   └── schema.prisma
│
├── client/                         # React frontend (Vite)
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css               # Tailwind directives
│       ├── stores/
│       │   ├── authStore.ts        # Zustand auth state
│       │   └── chatStore.ts        # Zustand chat state
│       ├── lib/
│       │   ├── api.ts              # Axios API client
│       │   └── socket.ts           # Socket.IO client helper
│       ├── components/
│       │   └── ProtectedRoute.tsx
│       └── pages/
│           ├── LoginPage.tsx
│           ├── RegisterPage.tsx
│           ├── DashboardPage.tsx
│           └── ChatPage.tsx
│
├── tests/
│   └── auth.test.ts
│
└── .github/
    └── workflows/                  # GitHub Actions CI
```

---

## Key Design Decisions

**Single service monolith** — QuickDesk is intentionally a monolith. One service, one Dockerfile. This shows you know when microservices are overkill.

**Socket.IO over raw ws** — Built-in reconnection, rooms, the Redis adapter for multi-instance scaling, and automatic fallback to HTTP long-polling. Less boilerplate, more reliability.

**4 roles (guest/customer/agent/admin)** — Guests get instant support without a registration barrier. Customers register for history. RBAC middleware enforces permissions per route.

**Auto-assign (round-robin)** — Agents with fewest active rooms get the next customer. No manual queue management needed.

**Cursor-based pagination** — Efficient for chat history. No offset drift when new messages arrive. Uses `sent_at` + `id` as a composite cursor.

**Two Redis clients** — Redis pub/sub requires separate connections for publishing and subscribing. `pubClient` publishes, `subClient` subscribes. This is a common interview topic.

**JWT over sessions** — Stateless auth scales horizontally without a shared session store.

**System messages in DB** — "Agent joined", "Room closed" are persisted as `type='system'` messages for complete conversation history.

**pino for logging** — Structured JSON logs in production, pretty-printed in development. Fastest Node.js logger.

**Graceful shutdown** — Drains Socket.IO connections on SIGTERM, closes Prisma and Redis clients cleanly.

**Zod validation** — Every HTTP request body and environment variable is validated at runtime with Zod schemas.

---

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/quickdesk
cd quickdesk

cp .env.example .env

# Start PostgreSQL + Redis
docker compose up -d

# Install backend dependencies and run migrations
npm install
npx prisma migrate dev --name init

# Start the backend server
npm run dev

# In a new terminal — install and start the frontend
cd client
npm install
npm run dev

# Backend API: http://localhost:3000
# Frontend:    http://localhost:5173
```

---

## API Examples

```bash
# Create a guest session
curl -X POST http://localhost:3000/api/auth/guest

# Register a customer account
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "email": "alice@example.com", "password": "secret123"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "secret123"}'
# -> { "accessToken": "eyJ...", "refreshToken": "..." }

# Refresh access token
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "..."}'

# Create a support room
curl -X POST http://localhost:3000/api/rooms \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"title": "Help with billing"}'

# List rooms
curl http://localhost:3000/api/rooms \
  -H "Authorization: Bearer eyJ..."

# Get message history (cursor-based pagination)
curl "http://localhost:3000/api/rooms/{roomId}/messages?limit=50" \
  -H "Authorization: Bearer eyJ..."
# -> { "messages": [...], "hasMore": true, "nextCursor": "..." }

# Load older messages
curl "http://localhost:3000/api/rooms/{roomId}/messages?cursor=MSG_ID&limit=50&direction=before" \
  -H "Authorization: Bearer eyJ..."

# Assign agent to room (agent/admin only)
curl -X PATCH http://localhost:3000/api/rooms/{roomId}/assign \
  -H "Authorization: Bearer eyJ..."

# Close room (agent/admin only)
curl -X PATCH http://localhost:3000/api/rooms/{roomId}/close \
  -H "Authorization: Bearer eyJ..."
```

---

## Environment Variables

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/quickdesk
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-secret-change-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
PORT=3000
NODE_ENV=development
```

---

## Key Concepts Demonstrated

- **Socket.IO** — real-time bidirectional communication with automatic reconnection
- **Redis Adapter** — Socket.IO Redis adapter for horizontal scaling across instances
- **JWT Auth** — access + refresh token rotation, guest sessions
- **RBAC** — role-based access control with 4 roles (guest, customer, agent, admin)
- **Room Lifecycle** — waiting → active → closed with auto-assignment
- **Presence System** — online user tracking per room
- **Typing Indicators** — ephemeral state via Redis (no DB writes)
- **Cursor-based Pagination** — efficient chat history loading without offset drift
- **Zod Validation** — runtime validation on all inputs and environment variables
- **pino Logging** — structured JSON logs, fastest Node.js logger
- **Graceful Shutdown** — clean drain of connections on SIGTERM
- **Monolith vs Microservices** — conscious architectural decision
- **Docker Compose** — single command startup for PostgreSQL + Redis
- **TypeScript Strict** — zero `any`, full type safety

---

*Built as a portfolio project to demonstrate real-time systems with Socket.IO, Redis pub/sub, and a React frontend.*
