/**
 * Manual Socket.IO integration test
 * Run: npx ts-node tests/socket-test.ts
 * Requires: server running on localhost:3001, postgres + redis up
 */
import { io, Socket } from 'socket.io-client';

const API = 'http://localhost:3001';

async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const { headers: extraHeaders, ...rest } = opts;
  const res = await fetch(`${API}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...extraHeaders as Record<string, string> },
  });
  return res.json();
}

function connectSocket(token: string): Socket {
  return io(API, { auth: { token }, transports: ['websocket'] });
}

function waitFor(socket: Socket, event: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
    socket.once(event, (data: any) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function run() {
  console.log('--- Socket.IO Integration Test ---\n');

  // 1. Create two guest users
  const guest1 = await api('/api/auth/guest', { method: 'POST' });
  const guest2 = await api('/api/auth/guest', { method: 'POST' });
  console.log('Guest 1:', guest1.user.username);
  console.log('Guest 2:', guest2.user.username);

  // 2. Guest1 creates a room
  const roomRes = await api('/api/rooms', {
    method: 'POST',
    headers: { Authorization: `Bearer ${guest1.accessToken}` } as any,
    body: JSON.stringify({ title: 'Socket Test Room' }),
  });
  const roomId = roomRes.id;
  console.log('Room created:', roomId, '| status:', roomRes.status);

  // 3. Connect both sockets
  const sock1 = connectSocket(guest1.accessToken);
  const sock2 = connectSocket(guest2.accessToken);

  await Promise.all([
    new Promise<void>((r) => sock1.on('connect', () => r())),
    new Promise<void>((r) => sock2.on('connect', () => r())),
  ]);
  console.log('Both sockets connected');

  // 4. Both join room
  sock1.emit('room:join', roomId);
  sock2.emit('room:join', roomId);
  await new Promise((r) => setTimeout(r, 500));
  console.log('Both joined room');

  // 5. Test messaging: sock1 sends, sock2 receives
  const msgPromise = waitFor(sock2, 'message:new');
  sock1.emit('message:send', { roomId, content: 'Hello from guest 1' });
  const msg = await msgPromise;
  console.log('\nMessage test:');
  console.log('  Received by guest2:', msg.content);
  console.log('  Sender:', msg.sender?.username);
  const msgPass = msg.content === 'Hello from guest 1';
  console.log('  PASS:', msgPass);

  // 6. Test typing: sock1 starts typing, sock2 receives update
  const typingPromise = waitFor(sock2, 'typing:update');
  sock1.emit('typing:start', { roomId });
  const typing = await typingPromise;
  console.log('\nTyping test:');
  console.log('  Received:', JSON.stringify(typing));
  const typingPass = typing.isTyping === true && typing.userId === guest1.user.id;
  console.log('  PASS:', typingPass);

  // 7. Test typing stop
  const typingStopPromise = waitFor(sock2, 'typing:update');
  sock1.emit('typing:stop', { roomId });
  const typingStop = await typingStopPromise;
  console.log('\nTyping stop test:');
  console.log('  Received:', JSON.stringify(typingStop));
  const typingStopPass = typingStop.isTyping === false;
  console.log('  PASS:', typingStopPass);

  // 8. Disconnect
  sock1.disconnect();
  sock2.disconnect();

  console.log('\n--- Results ---');
  console.log('Messaging:', msgPass ? 'PASS' : 'FAIL');
  console.log('Typing start:', typingPass ? 'PASS' : 'FAIL');
  console.log('Typing stop:', typingStopPass ? 'PASS' : 'FAIL');

  const allPass = msgPass && typingPass && typingStopPass;
  console.log('\nAll tests:', allPass ? 'PASS' : 'FAIL');
  process.exit(allPass ? 0 : 1);
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
