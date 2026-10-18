import { describe, expect, it } from 'vitest';
import { isLocalRequest } from '../src/access';

const req = (addr: string, headers: Record<string, string>) => ({ socket: { remoteAddress: addr }, headers }) as any;

describe('isLocalRequest', () => {
  it('accepts this computer', () => {
    expect(isLocalRequest(req('127.0.0.1', { host: '127.0.0.1:8120' }))).toBe(true);
    expect(isLocalRequest(req('::1', { host: 'localhost:5173', origin: 'http://localhost:5173' }))).toBe(true);
  });
  it('refuses other computers, proxies, rebinding names and other sites', () => {
    expect(isLocalRequest(req('192.168.1.20', { host: '127.0.0.1:8120' }))).toBe(false);
    expect(isLocalRequest(req('127.0.0.1', { host: '127.0.0.1:8120', 'x-forwarded-for': '10.0.0.2' }))).toBe(false);
    expect(isLocalRequest(req('127.0.0.1', { host: 'evil.example:8120' }))).toBe(false);
    expect(isLocalRequest(req('127.0.0.1', { host: '127.0.0.1:8120', origin: 'https://evil.example' }))).toBe(false);
  });
});
