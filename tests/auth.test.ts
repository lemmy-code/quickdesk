import request from 'supertest';
import { app } from '../src/http/app';
import { prisma } from '../src/lib/db';

beforeAll(async () => {
  await prisma.$connect();
  // Clean test data from previous runs
  await prisma.roomMember.deleteMany();
  await prisma.message.deleteMany();
  await prisma.room.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.roomMember.deleteMany();
  await prisma.message.deleteMany();
  await prisma.room.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('POST /api/auth/register', () => {
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', email: 'test@test.com', password: 'secret123' });

    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe('testuser');
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('should reject duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser2', email: 'test@test.com', password: 'secret123' });

    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  it('should login with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('should reject invalid password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'wrong' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/guest', () => {
  it('should create guest session', async () => {
    const res = await request(app).post('/api/auth/guest');

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('guest');
    expect(res.body.user.username).toMatch(/^guest_/);
  });
});
