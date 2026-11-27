import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { PoolClient } from 'pg';

const derive = promisify(scrypt);

export function accountInput(username: unknown, password: unknown) {
  if (typeof username !== 'string' || !/^[\p{L}\p{N}_-]{1,40}$/u.test(username.trim())) {
    throw Error('Choose a username of 1–40 letters, numbers, underscores, or hyphens.');
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 256) {
    throw Error('Choose a password of 8–256 characters.');
  }
  return {username: username.trim(), password};
}

export async function createAccount(client: PoolClient, username: string, password: string) {
  const input = accountInput(username, password);
  const salt = randomBytes(16).toString('hex');
  const key = await derive(input.password, salt, 64) as Buffer;
  const id = randomUUID();
  await client.query('INSERT INTO accounts (id, username, password_hash) VALUES ($1,$2,$3)',
    [id, input.username, salt + ':' + key.toString('hex')]);
  return id;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, digest] = stored.split(':');
  const key = await derive(password, salt, 64) as Buffer;
  return timingSafeEqual(key, Buffer.from(digest, 'hex'));
}
