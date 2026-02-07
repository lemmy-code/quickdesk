import { PrismaClient, Role, RoomStatus, MessageType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...\n');

  // Clean existing data
  await prisma.roomMember.deleteMany();
  await prisma.message.deleteMany();
  await prisma.room.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('password123', 12);

  // Create users
  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@quickdesk.io',
      passwordHash,
      role: Role.admin,
      isOnline: true,
    },
  });

  const agent1 = await prisma.user.create({
    data: {
      username: 'sarah_agent',
      email: 'sarah@quickdesk.io',
      passwordHash,
      role: Role.agent,
      isOnline: true,
    },
  });

  const agent2 = await prisma.user.create({
    data: {
      username: 'mike_agent',
      email: 'mike@quickdesk.io',
      passwordHash,
      role: Role.agent,
      isOnline: false,
    },
  });

  const customer1 = await prisma.user.create({
    data: {
      username: 'john_doe',
      email: 'john@example.com',
      passwordHash,
      role: Role.customer,
    },
  });

  const customer2 = await prisma.user.create({
    data: {
      username: 'jane_smith',
      email: 'jane@example.com',
      passwordHash,
      role: Role.customer,
    },
  });

  const guest = await prisma.user.create({
    data: {
      username: 'guest_demo',
      role: Role.guest,
    },
  });

  console.log('Users created:');
  console.log('  admin@quickdesk.io / password123 (admin)');
  console.log('  sarah@quickdesk.io / password123 (agent)');
  console.log('  mike@quickdesk.io  / password123 (agent)');
  console.log('  john@example.com   / password123 (customer)');
  console.log('  jane@example.com   / password123 (customer)');
  console.log('  guest_demo                       (guest)\n');

  // Room 1: Active conversation between john and sarah
  const room1 = await prisma.room.create({
    data: {
      title: 'Cannot access my account',
      status: RoomStatus.active,
      createdBy: customer1.id,
      assignedTo: agent1.id,
      members: {
        create: [{ userId: customer1.id }, { userId: agent1.id }],
      },
    },
  });

  const now = new Date();
  const msgs1 = [
    { content: 'Hi, I cannot log into my account since yesterday.', senderId: customer1.id, type: MessageType.user, sentAt: new Date(now.getTime() - 600000) },
    { content: 'sarah_agent joined the room', senderId: null, type: MessageType.system, sentAt: new Date(now.getTime() - 590000) },
    { content: 'Hello John! I\'m sorry to hear that. Can you tell me the email associated with your account?', senderId: agent1.id, type: MessageType.user, sentAt: new Date(now.getTime() - 580000) },
    { content: 'It\'s john@example.com. I keep getting "invalid credentials" even though I\'m sure the password is correct.', senderId: customer1.id, type: MessageType.user, sentAt: new Date(now.getTime() - 500000) },
    { content: 'I see. It looks like your account was locked after multiple failed attempts. I\'ve unlocked it now. Could you try logging in again?', senderId: agent1.id, type: MessageType.user, sentAt: new Date(now.getTime() - 400000) },
    { content: 'Let me try... Yes! It works now. Thank you so much!', senderId: customer1.id, type: MessageType.user, sentAt: new Date(now.getTime() - 300000) },
  ];

  for (const msg of msgs1) {
    await prisma.message.create({
      data: { roomId: room1.id, ...msg },
    });
  }

  // Room 2: Waiting (no agent assigned yet)
  const room2 = await prisma.room.create({
    data: {
      title: 'Billing question - double charged',
      status: RoomStatus.waiting,
      createdBy: customer2.id,
      members: {
        create: [{ userId: customer2.id }],
      },
    },
  });

  await prisma.message.create({
    data: {
      roomId: room2.id,
      senderId: customer2.id,
      content: 'I was charged twice for my last order #4521. Can someone help?',
      type: MessageType.user,
      sentAt: new Date(now.getTime() - 120000),
    },
  });

  // Room 3: Closed room
  const room3 = await prisma.room.create({
    data: {
      title: 'How to reset password',
      status: RoomStatus.closed,
      createdBy: guest.id,
      assignedTo: agent1.id,
      closedAt: new Date(now.getTime() - 3600000),
      members: {
        create: [{ userId: guest.id }, { userId: agent1.id }],
      },
    },
  });

  const msgs3 = [
    { content: 'How do I reset my password?', senderId: guest.id, type: MessageType.user, sentAt: new Date(now.getTime() - 7200000) },
    { content: 'sarah_agent joined the room', senderId: null, type: MessageType.system, sentAt: new Date(now.getTime() - 7100000) },
    { content: 'Go to the login page and click "Forgot Password". You\'ll receive an email with a reset link.', senderId: agent1.id, type: MessageType.user, sentAt: new Date(now.getTime() - 7000000) },
    { content: 'Got it, thanks!', senderId: guest.id, type: MessageType.user, sentAt: new Date(now.getTime() - 6900000) },
    { content: 'Room closed', senderId: null, type: MessageType.system, sentAt: new Date(now.getTime() - 3600000) },
  ];

  for (const msg of msgs3) {
    await prisma.message.create({
      data: { roomId: room3.id, ...msg },
    });
  }

  // Room 4: Guest with question, waiting
  const room4 = await prisma.room.create({
    data: {
      title: 'Pricing for enterprise plan',
      status: RoomStatus.waiting,
      createdBy: guest.id,
      members: {
        create: [{ userId: guest.id }],
      },
    },
  });

  await prisma.message.create({
    data: {
      roomId: room4.id,
      senderId: guest.id,
      content: 'Hi, I\'m interested in the enterprise plan. Can you share pricing details?',
      type: MessageType.user,
      sentAt: new Date(now.getTime() - 60000),
    },
  });

  console.log('Rooms created:');
  console.log(`  "${room1.title}" (active, assigned to sarah_agent)`);
  console.log(`  "${room2.title}" (waiting, no agent)`);
  console.log(`  "${room3.title}" (closed)`);
  console.log(`  "${room4.title}" (waiting, no agent)\n`);

  console.log('Seed complete! You can now log in with any of the accounts above.');
  console.log('All passwords are: password123');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
