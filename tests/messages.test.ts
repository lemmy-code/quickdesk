import request from 'supertest';
import { app } from '../src/http/app';
import { prisma } from '../src/lib/db';

let customerToken: string;
let roomId: string;

beforeAll(async () => {
  await prisma.$connect();
  await prisma.roomMember.deleteMany();
  await prisma.message.deleteMany();
  await prisma.room.deleteMany();
  await prisma.user.deleteMany();

  // Create customer and room
  const custRes = await request(app)
    .post('/api/auth/register')
    .send({ username: 'msgcustomer', email: 'msgcust@test.com', password: 'secret123' });
  customerToken = custRes.body.accessToken;

  const roomRes = await request(app)
    .post('/api/rooms')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ title: 'Message test room' });
  roomId = roomRes.body.id;

  // Seed messages via prisma directly for pagination tests
  const msgs = [];
  for (let i = 0; i < 10; i++) {
    msgs.push({
      roomId,
      senderId: custRes.body.user.id,
      content: `Message ${i + 1}`,
      sentAt: new Date(Date.now() + i * 1000),
    });
  }
  await prisma.message.createMany({ data: msgs });
});

afterAll(async () => {
  await prisma.roomMember.deleteMany();
  await prisma.message.deleteMany();
  await prisma.room.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('GET /api/rooms/:id/messages', () => {
  it('should return messages for a room', async () => {
    const res = await request(app)
      .get(`/api/rooms/${roomId}/messages`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toBeDefined();
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages.length).toBe(10);
    expect(res.body.hasMore).toBe(false);
  });

  it('should return messages with limit', async () => {
    const res = await request(app)
      .get(`/api/rooms/${roomId}/messages?limit=3`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.messages.length).toBe(3);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.nextCursor).toBeDefined();
  });

  it('should paginate with cursor', async () => {
    // Get first page
    const page1 = await request(app)
      .get(`/api/rooms/${roomId}/messages?limit=5`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(page1.body.hasMore).toBe(true);
    const cursor = page1.body.nextCursor;

    // Get second page
    const page2 = await request(app)
      .get(`/api/rooms/${roomId}/messages?limit=5&cursor=${cursor}`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(page2.body.messages.length).toBe(5);
    expect(page2.body.hasMore).toBe(false);

    // Messages should not overlap
    const ids1 = page1.body.messages.map((m: any) => m.id);
    const ids2 = page2.body.messages.map((m: any) => m.id);
    const overlap = ids1.filter((id: string) => ids2.includes(id));
    expect(overlap.length).toBe(0);
  });

  it('messages should be in chronological order (oldest first)', async () => {
    const res = await request(app)
      .get(`/api/rooms/${roomId}/messages`)
      .set('Authorization', `Bearer ${customerToken}`);

    const messages = res.body.messages;
    for (let i = 1; i < messages.length; i++) {
      expect(new Date(messages[i].sentAt).getTime())
        .toBeGreaterThanOrEqual(new Date(messages[i - 1].sentAt).getTime());
    }
  });

  it('messages should include sender info without passwordHash', async () => {
    const res = await request(app)
      .get(`/api/rooms/${roomId}/messages`)
      .set('Authorization', `Bearer ${customerToken}`);

    const msg = res.body.messages[0];
    expect(msg.sender).toBeDefined();
    expect(msg.sender.id).toBeDefined();
    expect(msg.sender.username).toBeDefined();
    expect(msg.sender.passwordHash).toBeUndefined();
  });

  it('should reject without auth', async () => {
    const res = await request(app)
      .get(`/api/rooms/${roomId}/messages`);

    expect(res.status).toBe(401);
  });
});
