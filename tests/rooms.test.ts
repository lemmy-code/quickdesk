import request from 'supertest';
import { app } from '../src/http/app';
import { prisma } from '../src/lib/db';

let guestToken: string;
let guestUserId: string;
let customerToken: string;
let customerUserId: string;
let agentToken: string;
let agentUserId: string;
let adminToken: string;
let adminUserId: string;

let roomId: string;

beforeAll(async () => {
  await prisma.$connect();
  await prisma.roomMember.deleteMany();
  await prisma.message.deleteMany();
  await prisma.room.deleteMany();
  await prisma.user.deleteMany();

  // Create a customer
  const custRes = await request(app)
    .post('/api/auth/register')
    .send({ username: 'roomcustomer', email: 'roomcust@test.com', password: 'secret123' });
  customerToken = custRes.body.accessToken;
  customerUserId = custRes.body.user.id;

  // Create an agent (register then promote)
  const agentRes = await request(app)
    .post('/api/auth/register')
    .send({ username: 'roomagent', email: 'roomagent@test.com', password: 'secret123' });
  agentUserId = agentRes.body.user.id;
  await prisma.user.update({ where: { id: agentUserId }, data: { role: 'agent' } });
  // Re-login to get fresh token with agent role
  const agentLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'roomagent@test.com', password: 'secret123' });
  agentToken = agentLogin.body.accessToken;

  // Create an admin
  const adminRes = await request(app)
    .post('/api/auth/register')
    .send({ username: 'roomadmin', email: 'roomadmin@test.com', password: 'secret123' });
  adminUserId = adminRes.body.user.id;
  await prisma.user.update({ where: { id: adminUserId }, data: { role: 'admin' } });
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'roomadmin@test.com', password: 'secret123' });
  adminToken = adminLogin.body.accessToken;

  // Create a guest
  const guestRes = await request(app).post('/api/auth/guest');
  guestToken = guestRes.body.accessToken;
  guestUserId = guestRes.body.user.id;
});

afterAll(async () => {
  await prisma.roomMember.deleteMany();
  await prisma.message.deleteMany();
  await prisma.room.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('POST /api/rooms', () => {
  it('should create a room as customer', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ title: 'Help with billing' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Help with billing');
    expect(res.body.createdBy).toBe(customerUserId);
    expect(res.body.creator).toBeDefined();
    expect(res.body.members).toBeDefined();
    roomId = res.body.id;
  });

  it('should create a room as guest', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ title: 'Guest question' });

    expect(res.status).toBe(201);
    expect(res.body.createdBy).toBe(guestUserId);
  });

  it('should reject without auth', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ title: 'No auth' });

    expect(res.status).toBe(401);
  });

  it('should reject empty title', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ title: '' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/rooms', () => {
  it('customer should only see own rooms', async () => {
    const res = await request(app)
      .get('/api/rooms')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const room of res.body) {
      expect(room.createdBy).toBe(customerUserId);
    }
  });

  it('agent should see all non-closed rooms', async () => {
    const res = await request(app)
      .get('/api/rooms')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('admin should see all non-closed rooms', async () => {
    const res = await request(app)
      .get('/api/rooms')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('guest should only see own rooms', async () => {
    const res = await request(app)
      .get('/api/rooms')
      .set('Authorization', `Bearer ${guestToken}`);

    expect(res.status).toBe(200);
    for (const room of res.body) {
      expect(room.createdBy).toBe(guestUserId);
    }
  });
});

describe('GET /api/rooms/:id', () => {
  it('should return room details', async () => {
    const res = await request(app)
      .get(`/api/rooms/${roomId}`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(roomId);
    expect(res.body.creator).toBeDefined();
    expect(res.body.members).toBeDefined();
  });

  it('should 404 for non-existent room', async () => {
    const res = await request(app)
      .get('/api/rooms/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/rooms/:id/assign', () => {
  it('should reject assignment by customer (RBAC)', async () => {
    const res = await request(app)
      .patch(`/api/rooms/${roomId}/assign`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ agentId: agentUserId });

    expect(res.status).toBe(403);
  });

  it('agent should assign self to room', async () => {
    const res = await request(app)
      .patch(`/api/rooms/${roomId}/assign`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ agentId: agentUserId });

    expect(res.status).toBe(200);
    expect(res.body.assignedTo).toBe(agentUserId);
    expect(res.body.status).toBe('active');
    expect(res.body.agent).toBeDefined();
    expect(res.body.agent.id).toBe(agentUserId);
  });

  it('admin should assign agent to room', async () => {
    // Create a fresh room for this test
    const roomRes = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ title: 'Admin assign test' });

    const res = await request(app)
      .patch(`/api/rooms/${roomRes.body.id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentId: agentUserId });

    expect(res.status).toBe(200);
    expect(res.body.assignedTo).toBe(agentUserId);
  });

  it('should reject assigning a customer as agent', async () => {
    const roomRes = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ title: 'Bad assign test' });

    const res = await request(app)
      .patch(`/api/rooms/${roomRes.body.id}/assign`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ agentId: customerUserId });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/rooms/:id/close', () => {
  it('should reject close by customer (RBAC)', async () => {
    const res = await request(app)
      .patch(`/api/rooms/${roomId}/close`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
  });

  it('agent should close a room', async () => {
    const res = await request(app)
      .patch(`/api/rooms/${roomId}/close`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('closed');
    expect(res.body.closedAt).toBeDefined();
  });

  it('should reject closing an already closed room', async () => {
    const res = await request(app)
      .patch(`/api/rooms/${roomId}/close`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(400);
  });

  it('should reject assigning agent to closed room', async () => {
    const res = await request(app)
      .patch(`/api/rooms/${roomId}/assign`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ agentId: agentUserId });

    expect(res.status).toBe(400);
  });
});
