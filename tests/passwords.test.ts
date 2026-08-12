import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../app/lib/passwords-core';

describe('password hashing', () => {
  it('verifies the original password and rejects a different one', () => {
    const hash = hashPassword('clave-super-segura-123');

    expect(hash).toMatch(/^scrypt\$/);
    expect(verifyPassword('clave-super-segura-123', hash)).toBe(true);
    expect(verifyPassword('otra-clave', hash)).toBe(false);
  });

  it('uses a unique salt for each hash', () => {
    const firstHash = hashPassword('misma-clave');
    const secondHash = hashPassword('misma-clave');

    expect(firstHash).not.toBe(secondHash);
    expect(verifyPassword('misma-clave', firstHash)).toBe(true);
    expect(verifyPassword('misma-clave', secondHash)).toBe(true);
  });
});
