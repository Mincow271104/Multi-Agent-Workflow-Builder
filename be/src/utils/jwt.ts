// ===================================================================
// JWT Utility Helpers
// ===================================================================
// Provides helpers to sign and verify JSON Web Tokens using the
// secret defined in .env (JWT_SECRET).
// ===================================================================

import jwt, { SignOptions } from 'jsonwebtoken';

/**
 * Payload stored inside the JWT.
 */
export interface JwtPayload {
  userId: string;
  role: string;
}

/**
 * Sign a new JWT with the given payload.
 *
 * @param payload  Data to embed in the token (userId, role).
 * @returns        Signed JWT string.
 */
export function signToken(payload: JwtPayload): string {
  const secret = process.env.JWT_SECRET as string;
  const expiresIn = (process.env.JWT_EXPIRES_IN as string) || '7d';

  const options: SignOptions = { expiresIn: expiresIn as unknown as number };
  return jwt.sign(payload, secret, options);
}

/**
 * Verify and decode a JWT.
 *
 * @param token  JWT string to verify.
 * @returns      Decoded payload.
 * @throws       JsonWebTokenError if the token is invalid or expired.
 */
export function verifyToken(token: string): JwtPayload {
  const secret = process.env.JWT_SECRET as string;
  return jwt.verify(token, secret) as JwtPayload;
}

export default { signToken, verifyToken };
