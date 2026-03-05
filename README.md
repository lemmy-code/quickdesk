# QuickDesk

Real-time customer support chat system. Agents handle multiple simultaneous conversations with customers via Socket.IO. Messages persist in PostgreSQL, Redis powers pub/sub for horizontal scaling.

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
| Logging | pino |
| Frontend | React 18, Vite, Tailwind CSS, Zustand |
| Testing | Jest + Supertest |
| Containerization | Docker + Docker Compose |
| CI | GitHub Actions |
| Linting | ESLint + Prettier |

---

## User Roles

| Role | Permissions |
|---|---|
| guest | Create room, send messages in own room |
| customer | Create rooms, view own history, send messages in own rooms |
| agent | View all open rooms, get assigned, send messages, close rooms |
| admin | Everything agent can do + manage users, change roles |

---

## Room Lifecycle

```
Guest/Customer opens chat
        │
        ▼
  Room created (status: waiting)
        │
        ▼
  Auto-assign to available agent  ──▶  No agent online? stays in queue
        │
        ▼
  Room status: active (agent assigned)
        │
        ▼
  Conversation happens (messages via Socket.IO)
        │
        ▼
  Agent or admin closes room (status: closed)
```

Auto-assignment uses round-robin among online agents, prioritizing those with fewest active rooms.

---

## Socket.IO Events

### Client → Server

```typescript
room:join      { roomId: string }
room:leave     { roomId: string }
message:send   { roomId: string, content: string }
typing:start   { roomId: string }
typing:stop    { roomId: string }
```

### Server → Client

```typescript
message:new        { roomId, messageId, senderId, senderName, content, sentAt }
room:assigned      { roomId, agentId, agentName }
room:closed        { roomId, closedBy }
user:joined        { roomId, userId, username }
user:left          { roomId, userId }
typing:update      { roomId, userId, username, isTyping }
presence:update    { roomId, onlineUsers: [{ id, username, role }] }
system:message     { roomId, content, sentAt }
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

---

## Quick Start

```bash
git clone https://github.com/lemmy-code/quickdesk
cd quickdesk
cp .env.example .env

# Start PostgreSQL + Redis
docker compose up -d

# Install and run backend
npm install
npx prisma migrate dev --name init
npm run dev

# In a new terminal — frontend
cd client
npm install
npm run dev

# Backend API: http://localhost:3001
# Frontend:    http://localhost:5173
```

### Seed Demo Data

```bash
npm run db:seed
```

Creates sample users, rooms, and conversations.

**Demo credentials** (password: `password123`):

| Email | Role |
|---|---|
| admin@quickdesk.io | admin |
| sarah@quickdesk.io | agent |
| mike@quickdesk.io | agent |
| john@example.com | customer |
| jane@example.com | customer |

Guest access is available via "Continue as Guest" on the login page.

---

## Testing

```bash
npm test
```

44 tests across 4 suites covering auth, rooms, messages, admin RBAC, and security (no passwordHash leaks).

```bash
# Socket.IO integration test (requires running server)
npx ts-node tests/socket-test.ts
```

---

## Environment Variables

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/quickdesk
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-min-32-characters-long
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
PORT=3001
NODE_ENV=development
CORS_ORIGIN=*
```

---

## Design Decisions

**Monolith** — Single service, single Dockerfile. The scope doesn't justify microservices.

**Socket.IO over raw WebSockets** — Built-in reconnection, rooms, Redis adapter for multi-instance scaling, and automatic fallback to HTTP long-polling.

**Separate pub/sub Redis clients** — Redis pub/sub requires dedicated connections for publishing and subscribing. The Socket.IO Redis adapter handles cross-instance message delivery through this.

**Cursor-based pagination** — Offset-based pagination drifts when new messages arrive. Cursor pagination using `sent_at` + `id` keeps results stable.

**JWT with refresh tokens** — Stateless auth that scales horizontally. Short-lived access tokens (15m) with longer refresh tokens (7d) for session continuity.

**System messages persisted in DB** — Events like "Agent joined" and "Room closed" are stored as `type='system'` messages so conversation history is complete.

**Graceful shutdown** — HTTP connections drain before disconnecting data stores, with a 10-second hard kill timeout to prevent hangs.
