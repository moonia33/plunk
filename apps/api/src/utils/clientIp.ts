import type {Request} from 'express';

/**
 * Visitor IP: the X-Forwarded-For entry appended by the outermost of `trustedHops` proxies.
 * Entries further left are client-supplied and ignored. With 0 hops the socket address is used.
 */
export function clientIp(req: Pick<Request, 'headers' | 'socket'>, trustedHops: number): string {
  if (trustedHops > 0) {
    const header = req.headers['x-forwarded-for'];
    const chain = (Array.isArray(header) ? header.join(',') : (header ?? ''))
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean);
    const ip = chain[chain.length - trustedHops];
    if (ip) return ip;
  }
  return req.socket.remoteAddress || 'unknown';
}
