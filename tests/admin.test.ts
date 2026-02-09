import request from 'supertest';
import { app } from '../src/http/app';
import { prisma } from '../src/lib/db';

let adminToken: string;
let adminUserId: string;
let customerToken: string;
let customerUserId: string;
let agentToken: string;

beforeAll(async () => {
  await prisma.$connect();
  await prisma.roomMember.deleteMany();
  await prisma.message.deleteMany();
  await prisma.room.deleteMany();
  await prisma.user.deleteMany();

  // Create admin
  const adminRes = await request(app)
    .post('/api/auth/register')
    .send({ username: 'testadmin', email: 'admin@test.com', password: 'secret123' });
  adminUserId = adminRes.body.user.id;
  await prisma.user.update({ where: { id: adminUserId }, data: { role: 'admin' } });
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@test.com', password: 'secret123' });
  adminToken = adminLogin.body.accessToken;

  // Create customer
  const custRes = await request(app)
    .post('/api/auth/register')
    .send({ username: 'testcust', email: 'cust@test.com', password: 'secret123' });
  customerToken = custRes.body.accessToken;
  customerUserId = custRes.body.user.id;

  // Create agent
  const agentRes = await request(app)
    .post('/api/auth/register')
    .send({ username: 'testagent', email: 'agent@test.com', password: 'secret123' });
  await prisma.user.update({ where: { id: agentRes.body.user.id }, data: { role: 'agent' } });
  const agentLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'agent@test.com', password: 'secret123' });
  agentToken = agentLogin.body.accessToken;
});

afterAll(async () => {
  await prisma.roomMember.deleteMany();
  await prisma.message.deleteMany();
  await prisma.room.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('GET /api/admin/users', () => {
  it('admin should list all users', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    // Should not leak passwordHash
    for (const user of res.body) {
      expect(user.passwordHash).toBeUndefined();
      expect(user.id).toBeDefined();
      expect(user.username).toBeDefined();
      expect(user.role).toBeDefined();
    }
  });

  it('customer should be forbidden', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
  });

  it('agent should be forbidden', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(403);
  });

  it('unauthenticated should be 401', async () => {
    const res = await request(app).get('/api/admin/users');

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/admin/users/:id/role', () => {
  it('admin should change user role', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${customerUserId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'agent' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('agent');
    expect(res.body.passwordHash).toBeUndefined();

    // Revert back
    await request(app)
      .patch(`/api/admin/users/${customerUserId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'customer' });
  });

  it('customer should be forbidden', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${customerUserId}/role`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ role: 'admin' });

    expect(res.status).toBe(403);
  });

  it('should reject invalid role', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${customerUserId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'superadmin' });

    expect(res.status).toBe(400);
  });

  it('should 404 for non-existent user', async () => {
    const res = await request(app)
      .patch('/api/admin/users/00000000-0000-0000-0000-000000000000/role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'agent' });

    expect(res.status).toBe(404);
  });
});
