// Forge answers only this computer. A request is local when it comes from the loopback address and names a loopback host,
// so another machine, a proxy, or a web page on another site pointed at this computer (DNS rebinding) is refused.
import type { IncomingMessage } from 'node:http';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLocalRequest(req: Pick<IncomingMessage, 'socket' | 'headers'>): boolean {
  if (!LOOPBACK.has(req.socket.remoteAddress ?? '')) return false;
  if (req.headers['x-forwarded-for'] || req.headers['forwarded']) return false;
  const host = (req.headers.host ?? '').toLowerCase();
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) return false;
  const origin = req.headers.origin;
  if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(origin)) return false;
  return true;
}
