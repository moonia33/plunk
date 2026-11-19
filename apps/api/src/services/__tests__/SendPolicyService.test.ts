import {describe, expect, it} from 'vitest';
import {SendPolicyService, type SendPolicySettings} from '../SendPolicyService';

const base: SendPolicySettings = {
  smartSendingHours: 16,
  weeklyEmailCap: 4,
  quietHoursStart: 21,
  quietHoursEnd: 9,
  timezone: 'Europe/Vilnius',
};
// 2026-11-19 12:00 in Vilnius (UTC+2)
const noon = new Date('2026-11-19T10:00:00Z');
const hoursAgo = (h: number, from = noon) => new Date(from.getTime() - h * 3600_000);

describe('SendPolicyService.decide', () => {
  it('sends when nothing was sent recently', () => {
    expect(SendPolicyService.decide(base, [], 'skip', noon)).toEqual({action: 'send'});
  });

  it('skips inside the Smart Sending window', () => {
    expect(SendPolicyService.decide(base, [hoursAgo(3)], 'skip', noon)).toEqual({action: 'skip', reason: 'smart-sending'});
  });

  it('delays to the end of the Smart Sending window', () => {
    const d = SendPolicyService.decide({...base, quietHoursStart: null}, [hoursAgo(3)], 'delay', noon);
    expect(d).toEqual({action: 'delay', reason: 'smart-sending', until: new Date(hoursAgo(3).getTime() + 16 * 3600_000)});
  });

  it('moves a delay that lands in quiet hours to the morning', () => {
    // last email at 10:00 local -> window ends 02:00 local -> quiet until 09:00 local (07:00Z)
    const d = SendPolicyService.decide(base, [hoursAgo(2)], 'delay', noon);
    expect(d).toEqual({action: 'delay', reason: 'smart-sending', until: new Date('2026-11-20T07:00:00Z')});
  });

  it('applies the weekly cap', () => {
    const sent = [hoursAgo(150), hoursAgo(120), hoursAgo(90), hoursAgo(60)];
    expect(SendPolicyService.decide({...base, smartSendingHours: 0}, sent, 'skip', noon)).toEqual({
      action: 'skip',
      reason: 'weekly-cap',
    });
    expect(SendPolicyService.decide({...base, smartSendingHours: 0, weeklyEmailCap: 5}, sent, 'skip', noon)).toEqual({
      action: 'send',
    });
  });

  it('delays during quiet hours even in skip mode', () => {
    const night = new Date('2026-11-19T21:30:00Z'); // 23:30 local
    expect(SendPolicyService.decide(base, [], 'skip', night)).toEqual({
      action: 'delay',
      reason: 'quiet-hours',
      until: new Date('2026-11-20T07:00:00Z'),
    });
  });

  it('turns rules off with zero / null', () => {
    const off = {...base, smartSendingHours: 0, weeklyEmailCap: 0, quietHoursStart: null, quietHoursEnd: null};
    expect(SendPolicyService.decide(off, [hoursAgo(1)], 'skip', new Date('2026-11-19T22:00:00Z'))).toEqual({action: 'send'});
  });
});

describe('SendPolicyService.quietHoursEnd', () => {
  it('handles a same-day window', () => {
    const s = {...base, quietHoursStart: 13, quietHoursEnd: 15};
    expect(SendPolicyService.quietHoursEnd(s, new Date('2026-11-19T11:30:00Z'))).toEqual(new Date('2026-11-19T13:00:00Z'));
    expect(SendPolicyService.quietHoursEnd(s, noon)).toBeNull();
  });
});
