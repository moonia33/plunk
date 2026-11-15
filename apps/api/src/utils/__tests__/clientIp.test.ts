import {describe, expect, it} from 'vitest';

import {clientIp} from '../clientIp';

const request = (forwardedFor?: string | string[], remoteAddress = '172.19.0.6') =>
  ({headers: forwardedFor === undefined ? {} : {'x-forwarded-for': forwardedFor}, socket: {remoteAddress}}) as never;

describe('clientIp', () => {
  it('uses the socket address when no proxy is trusted', () => {
    expect(clientIp(request('6.6.6.6'), 0)).toBe('172.19.0.6');
  });

  it('takes the entry added by the outermost trusted proxy', () => {
    expect(clientIp(request('140.232.64.3, 10.0.1.5'), 2)).toBe('140.232.64.3');
    expect(clientIp(request('140.232.64.3'), 1)).toBe('140.232.64.3');
  });

  it('ignores client-supplied entries further left', () => {
    expect(clientIp(request('6.6.6.6, 140.232.64.3, 10.0.1.5'), 2)).toBe('140.232.64.3');
    expect(clientIp(request(['6.6.6.6', '140.232.64.3, 10.0.1.5']), 2)).toBe('140.232.64.3');
  });

  it('falls back to the socket address when the chain is shorter than expected', () => {
    expect(clientIp(request('10.0.1.5'), 2)).toBe('172.19.0.6');
    expect(clientIp(request(), 1)).toBe('172.19.0.6');
  });
});
