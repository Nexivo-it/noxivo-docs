import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(nodeScrypt);
const KEY_LENGTH = 64;

/**
 * Hashes a password using scrypt with a random 16-byte salt.
 * Returns the hash in the format `${salt}:${derivedKey}`
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a password against a stored hash string.
 * Expects the format `${salt}:${derivedKey}`
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, existingHash] = (storedHash || '').split(':');

  if (!salt || !existingHash) {
    return false;
  }

  try {
    const derivedKey = await scrypt(password, salt, KEY_LENGTH) as Buffer;
    const expected = Buffer.from(existingHash, 'hex');
    const actual = Buffer.from(derivedKey);

    if (expected.length !== actual.length) {
      return false;
    }

    return timingSafeEqual(expected, actual);
  } catch (error) {
    console.error('Password verification failed:', error);
    return false;
  }
}
