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
    // Security: no passwordHash leak
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('should reject duplicate username', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', email: 'other@test.com', password: 'secret123' });

    expect(res.status).toBe(409);
  });

  it('should reject invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser3', email: 'not-an-email', password: 'secret123' });

    expect(res.status).toBe(400);
  });

  it('should reject short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser4', email: 'test4@test.com', password: '12345' });

    expect(res.status).toBe(400);
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
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.username).toBe('testuser');
    // Security: no passwordHash leak
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('should reject non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'secret123' });

    expect(res.status).toBe(401);
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
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    // Security: no passwordHash leak
    expect(res.body.user.passwordHash).toBeUndefined();
  });
});

describe('POST /api/auth/refresh', () => {
  let refreshToken: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'secret123' });
    refreshToken = res.body.refreshToken;
  });

  it('should return new access token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('should reject invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid-token' });

    expect(res.status).toBe(401);
  });

  it('should reject missing refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({});

    expect(res.status).toBe(400);
  });
});
