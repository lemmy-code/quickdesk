import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '../lib/db';
import { signAccessToken, signRefreshToken, verifyToken, TokenPayload } from '../lib/jwt';
import { ConflictError, UnauthorizedError } from '../lib/errors';

function generateTokens(payload: TokenPayload) {
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export async function register(data: { username: string; email: string; password: string }) {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ username: data.username }, { email: data.email }],
    },
  });

  if (existing) {
    throw new ConflictError(
      existing.email === data.email ? 'Email already in use' : 'Username already taken',
    );
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const user = await prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      passwordHash,
      role: Role.customer,
    },
    select: { id: true, username: true, email: true, role: true },
  });

  const tokens = generateTokens({ userId: user.id, role: user.role });
  return { user, ...tokens };
}

export async function login(data: { email: string; password: string }) {
  const fullUser = await prisma.user.findUnique({ where: { email: data.email } });

  if (!fullUser || !fullUser.passwordHash) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const valid = await bcrypt.compare(data.password, fullUser.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const user = { id: fullUser.id, username: fullUser.username, email: fullUser.email, role: fullUser.role };
  const tokens = generateTokens({ userId: user.id, role: user.role });
  return { user, ...tokens };
}

export async function createGuest() {
  const uniqueId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);

  const user = await prisma.user.create({
    data: {
      username: `guest_${uniqueId}`,
      role: Role.guest,
    },
    select: { id: true, username: true, role: true },
  });

  const tokens = generateTokens({ userId: user.id, role: user.role });
  return { user, ...tokens };
}

export async function refreshAccessToken(token: string) {
  let payload: TokenPayload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  const accessToken = signAccessToken({ userId: user.id, role: user.role });
  return { accessToken };
}
