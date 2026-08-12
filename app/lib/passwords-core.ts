import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const HASH_PREFIX = 'scrypt';

export function hashPassword(password: string) {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const key = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${HASH_PREFIX}$${salt}$${key}`;
}

export function verifyPassword(password: string, storedHash?: string | null) {
  if (!storedHash) return false;

  const [prefix, salt, key] = storedHash.split('$');
  if (prefix !== HASH_PREFIX || !salt || !key) return false;

  const storedKey = Buffer.from(key, 'hex');
  const candidateKey = scryptSync(password, salt, storedKey.length);

  return storedKey.length === candidateKey.length && timingSafeEqual(storedKey, candidateKey);
}
