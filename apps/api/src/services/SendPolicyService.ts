import {EmailSourceType, EmailStatus} from '@plunk/db';

import {prisma} from '../database/prisma.js';
import {redis} from '../database/redis.js';

export type SendPolicyMode = 'skip' | 'delay' | 'ignore';

export type SendPolicyDecision =
  // `held`: the contact's send lock was taken; release it once the email is recorded
  | {action: 'send'; held?: boolean}
  | {action: 'skip'; reason: SendPolicyReason}
  | {action: 'delay'; until: Date; reason: SendPolicyReason};

export type SendPolicyReason = 'smart-sending' | 'weekly-cap' | 'quiet-hours' | 'concurrent-send';

export interface SendPolicySettings {
  smartSendingHours: number;
  weeklyEmailCap: number;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  timezone: string;
}

const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * HOUR_MS;
const SEND_LOCK_MS = 30 * 1000;
const MARKETING_SOURCES = [EmailSourceType.CAMPAIGN, EmailSourceType.WORKFLOW];

/**
 * Project-wide marketing send policy for workflow emails: Smart Sending (one marketing email
 * per N hours), a rolling 7-day cap and quiet hours. Campaign and workflow emails both count
 * toward the limits; transactional emails never do.
 */
export class SendPolicyService {
  public static async evaluate(
    projectId: string,
    contactId: string,
    mode: SendPolicyMode,
    now: Date = new Date(),
  ): Promise<SendPolicyDecision> {
    if (mode === 'ignore') {
      return {action: 'send'};
    }

    const settings = await prisma.project.findUnique({
      where: {id: projectId},
      select: {smartSendingHours: true, weeklyEmailCap: true, quietHoursStart: true, quietHoursEnd: true, timezone: true},
    });

    if (!settings) {
      return {action: 'send'};
    }

    const lookbackMs = Math.max(settings.smartSendingHours * HOUR_MS, settings.weeklyEmailCap > 0 ? WEEK_MS : 0);

    // History-based rules are checked and the email recorded under a per-contact lock, so two
    // workflows sending at once cannot both pass on the same history
    if (lookbackMs > 0 && !(await redis.set(this.lockKey(projectId, contactId), '1', 'PX', SEND_LOCK_MS, 'NX'))) {
      return {action: 'delay', until: new Date(now.getTime() + SEND_LOCK_MS), reason: 'concurrent-send'};
    }
    const recent =
      lookbackMs > 0
        ? await prisma.email.findMany({
            where: {
              projectId,
              contactId,
              sourceType: {in: MARKETING_SOURCES},
              status: {not: EmailStatus.FAILED},
              createdAt: {gte: new Date(now.getTime() - lookbackMs)},
            },
            select: {createdAt: true},
            orderBy: {createdAt: 'asc'},
            take: 500,
          })
        : [];

    const decision = this.decide(
      settings,
      recent.map(e => e.createdAt),
      mode,
      now,
    );

    if (lookbackMs > 0) {
      if (decision.action !== 'send') {
        await this.release(projectId, contactId);
        return decision;
      }
      return {action: 'send', held: true};
    }

    return decision;
  }

  /** Release the send lock taken by an `evaluate` that returned `held` */
  public static async release(projectId: string, contactId: string): Promise<void> {
    await redis.del(this.lockKey(projectId, contactId));
  }

  private static lockKey(projectId: string, contactId: string): string {
    return `send-policy:lock:${projectId}:${contactId}`;
  }

  /** The decision for marketing emails already sent at `sentAt` (ascending) */
  public static decide(
    settings: SendPolicySettings,
    sentAt: Date[],
    mode: Exclude<SendPolicyMode, 'ignore'>,
    now: Date,
  ): SendPolicyDecision {
    let blockedUntil: Date | null = null;
    let reason: SendPolicyReason | null = null;

    const last = sentAt[sentAt.length - 1];
    if (settings.smartSendingHours > 0 && last) {
      const allowedAt = new Date(last.getTime() + settings.smartSendingHours * HOUR_MS);
      if (allowedAt > now) {
        blockedUntil = allowedAt;
        reason = 'smart-sending';
      }
    }

    if (settings.weeklyEmailCap > 0) {
      const inWeek = sentAt.filter(d => d.getTime() > now.getTime() - WEEK_MS);
      if (inWeek.length >= settings.weeklyEmailCap) {
        const freed = inWeek[inWeek.length - settings.weeklyEmailCap]!;
        const allowedAt = new Date(freed.getTime() + WEEK_MS);
        if (!blockedUntil || allowedAt > blockedUntil) {
          blockedUntil = allowedAt;
          reason = 'weekly-cap';
        }
      }
    }

    if (blockedUntil && reason) {
      if (mode === 'skip') {
        return {action: 'skip', reason};
      }
      const quietEnd = this.quietHoursEnd(settings, blockedUntil);
      return {action: 'delay', until: quietEnd ?? blockedUntil, reason};
    }

    const quietEnd = this.quietHoursEnd(settings, now);
    if (quietEnd) {
      return {action: 'delay', until: quietEnd, reason: 'quiet-hours'};
    }

    return {action: 'send'};
  }

  /** When quiet hours that `at` falls in end, or null when `at` is outside them */
  public static quietHoursEnd(settings: SendPolicySettings, at: Date): Date | null {
    const {quietHoursStart: start, quietHoursEnd: end} = settings;
    if (start === null || end === null || start === end) {
      return null;
    }

    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: settings.timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
    const hour = get('hour');
    const secondsIntoDay = hour * 3600 + get('minute') * 60 + get('second');

    const quiet = start < end ? hour >= start && hour < end : hour >= start || hour < end;
    if (!quiet) {
      return null;
    }

    const untilEnd = (end * 3600 - secondsIntoDay + 86400) % 86400;
    return new Date(at.getTime() + untilEnd * 1000 - at.getMilliseconds());
  }
}
