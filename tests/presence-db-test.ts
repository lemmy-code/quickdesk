/**
 * Test: Verify isOnline flag in DB changes on socket connect/disconnect
 */
import { io } from 'socket.io-client';
import { prisma } from '../src/lib/db';

const API = 'http://localhost:3001';

async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const { headers: extraHeaders, ...rest } = opts;
  const res = await fetch(`${API}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...extraHeaders as Record<string, string> },
  });
  return res.json();
}

async function run() {
  console.log('--- Presence DB Verification Test ---\n');
  await prisma.$connect();

  const guest = await api('/api/auth/guest', { method: 'POST' });
  const userId = guest.user.id;
  console.log('User:', guest.user.username);

  // Before connect: should be offline
  const before = await prisma.user.findUnique({ where: { id: userId } });
  console.log('Before connect - isOnline:', before?.isOnline);

  // Connect
  const sock = io(API, { auth: { token: guest.accessToken }, transports: ['websocket'] });
  await new Promise<void>((r) => sock.on('connect', () => r()));
  await new Promise((r) => setTimeout(r, 300));

  const afterConnect = await prisma.user.findUnique({ where: { id: userId } });
  console.log('After connect  - isOnline:', afterConnect?.isOnline);

  // Disconnect
  sock.disconnect();
  await new Promise((r) => setTimeout(r, 500));

  const afterDisconnect = await prisma.user.findUnique({ where: { id: userId } });
  console.log('After disconnect- isOnline:', afterDisconnect?.isOnline);

  const pass = !before?.isOnline && afterConnect?.isOnline === true && afterDisconnect?.isOnline === false;
  console.log('\nDB Presence test:', pass ? 'PASS' : 'FAIL');

  await prisma.$disconnect();
  process.exit(pass ? 0 : 1);
}

run().catch(async (err) => {
  console.error('Test failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
