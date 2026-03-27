// ===================================================================
// src/controllers/auth.controller.ts
// ===================================================================
// Handles user registration, login, and profile retrieval.
//
// Endpoints:
//   POST /api/v1/auth/register  — Create a new account
//   POST /api/v1/auth/login     — Login and receive JWT
//   GET  /api/v1/auth/me        — Get authenticated user profile
//
// Uses Zod for request body validation and bcryptjs for password hashing.
// ===================================================================

import { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '../config/db';
import { catchAsync, apiResponse, ApiError, signToken, logger } from '../utils';

// ─── Zod Validation Schemas ─────────────────────────────────────

/** Register request body schema */
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password must be at most 128 characters'),
});

/** Login request body schema */
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// ─── Constants ──────────────────────────────────────────────────

const SALT_ROUNDS = 12;

// ─── POST /auth/register ────────────────────────────────────────

/**
 * Register a new user account.
 *
 * Flow:
 *  1. Validate request body (Zod)
 *  2. Check if email already exists
 *  3. Hash password with bcrypt
 *  4. Create user in database
 *  5. Generate JWT token
 *  6. Return user profile + token
 */
export const register = catchAsync(async (req: Request, res: Response) => {
  // 1. Validate input
  const data = registerSchema.parse(req.body);

  // 2. Check for duplicate email
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existingUser) {
    throw ApiError.conflict('An account with this email already exists.');
  }

  // 3. Hash the password
  const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

  // 4. Create the user record
  const user = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      password: hashedPassword,
    },
  });

  // 5. Generate JWT
  const token = signToken({ userId: user.id, role: user.role });

  // 6. Return user (without password) + token
  const { password: _pwd, ...userWithoutPassword } = user;

  logger.info(`[Auth] New user registered: ${user.email} (${user.id})`);

  apiResponse({
    res,
    statusCode: 201,
    message: 'Registration successful',
    data: {
      user: userWithoutPassword,
      token,
    },
  });
});

// ─── POST /auth/login ───────────────────────────────────────────

/**
 * Authenticate a user and return a JWT.
 *
 * Flow:
 *  1. Validate request body (Zod)
 *  2. Find user by email
 *  3. Compare passwords with bcrypt
 *  4. Generate JWT token
 *  5. Return user profile + token
 */
export const login = catchAsync(async (req: Request, res: Response) => {
  // 1. Validate input
  const data = loginSchema.parse(req.body);

  // 2. Find the user
  const user = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  // 3. Compare passwords
  const isPasswordValid = await bcrypt.compare(data.password, user.password);
  if (!isPasswordValid) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  // 4. Generate JWT
  const token = signToken({ userId: user.id, role: user.role });

  // 5. Return user (without password) + token
  const { password: _pwd, ...userWithoutPassword } = user;

  logger.info(`[Auth] User logged in: ${user.email} (${user.id})`);

  apiResponse({
    res,
    message: 'Login successful',
    data: {
      user: userWithoutPassword,
      token,
    },
  });
});

// ─── GET /auth/me ───────────────────────────────────────────────

/**
 * Get the currently authenticated user's profile.
 * Requires the `authenticate` middleware to run first.
 */
export const getMe = catchAsync(async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    throw ApiError.unauthorized('Not authenticated.');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: { select: { workflows: true } },
    },
  });

  if (!user) {
    throw ApiError.notFound('User not found.');
  }

  const { password: _pwd, ...userWithoutPassword } = user;

  apiResponse({
    res,
    message: 'Profile retrieved',
    data: userWithoutPassword,
  });
});
