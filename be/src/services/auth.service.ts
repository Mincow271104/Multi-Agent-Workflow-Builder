// ===================================================================
// Auth Service
// ===================================================================
// Business logic for user registration, login, and password hashing.
// ===================================================================

import bcrypt from 'bcryptjs';
import prisma from '../config/db';
import { ApiError, signToken } from '../utils';

const SALT_ROUNDS = 12;

// ─── Register ─────────────────────────────────────────────────────

/**
 * Register a new user.
 *
 * @param data  { email, name, password }
 * @returns     The created user (without password) + JWT token.
 */
export async function register(data: {
  email: string;
  name: string;
  password: string;
}) {
  // 1. Check if user already exists
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw ApiError.conflict('Email already in use');
  }

  // 2. Hash password
  const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

  // 3. Create user
  const user = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      password: hashedPassword,
    },
  });

  // 4. Generate JWT
  const token = signToken({ userId: user.id, role: user.role });

  // 5. Return user (strip password) + token
  const { password: _, ...userWithoutPassword } = user;
  return { user: userWithoutPassword, token };
}

// ─── Login ────────────────────────────────────────────────────────

/**
 * Authenticate a user by email & password.
 *
 * @param data  { email, password }
 * @returns     The user (without password) + JWT token.
 */
export async function login(data: { email: string; password: string }) {
  // 1. Find user
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // 2. Compare passwords
  const isMatch = await bcrypt.compare(data.password, user.password);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // 3. Generate JWT
  const token = signToken({ userId: user.id, role: user.role });

  // 4. Return user (strip password) + token
  const { password: _, ...userWithoutPassword } = user;
  return { user: userWithoutPassword, token };
}

// ─── Get Profile ──────────────────────────────────────────────────

/**
 * Retrieve a user's profile by ID.
 *
 * @param userId  UUID of the user.
 * @returns       User record without password.
 */
export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

export default { register, login, getProfile };
