import {randomBytes} from 'node:crypto';

import type {Form, Prisma} from '@plunk/db';
import {FormSchemas} from '@plunk/shared';
import type {
  FormContent,
  FormDefinition,
  FormField,
  FormRules,
  FormSettings,
  FormStyle,
  PublicForm,
} from '@plunk/types';
import signale from 'signale';
import type {z} from 'zod';

import {FORM_SUBMIT_LIMIT_PER_HOUR} from '../app/constants.js';
import {prisma} from '../database/prisma.js';
import {redis, wrapRedis} from '../database/redis.js';
import {HttpException, NotFound, RateLimitError} from '../exceptions/index.js';

import {ContactService} from './ContactService.js';
import {EventService} from './EventService.js';
import {Keys} from './keys.js';

type FormInput = z.infer<typeof FormSchemas.create>;
type FormUpdate = z.infer<typeof FormSchemas.update>;

/** Active forms are re-read from the database at most this often per project. */
const ACTIVE_CACHE_SECONDS = 60;
/** How long the second step of a form may update the contact the first step created. */
const STEP2_TTL_SECONDS = 30 * 60;
/** Turnstile action every embed widget is rendered with. */
export const TURNSTILE_ACTION = 'newsletter_signup';

export const FORM_EVENTS = {
  signupRequested: 'newsletter.signup_requested',
  subscribed: 'newsletter.subscribed',
  submitted: 'form.submitted',
} as const;

/** Picks the texts for `locale`, falling back to its language, then to the first locale. */
export function resolveLocale<T>(values: Record<string, T>, locale?: string): T | undefined {
  if (locale) {
    if (values[locale] !== undefined) return values[locale];
    const language = locale.split('-')[0]!;
    if (values[language] !== undefined) return values[language];
  }
  const first = Object.keys(values)[0];
  return first === undefined ? undefined : values[first];
}

function consentTexts(content: Record<string, FormContent>): string {
  return JSON.stringify(
    Object.keys(content)
      .sort()
      .map(locale => [locale, content[locale]?.consentText ?? '']),
  );
}

export class FormService {
  public static toDefinition(form: Form): FormDefinition {
    return {
      id: form.id,
      name: form.name,
      type: form.type,
      status: form.status,
      content: form.content as unknown as Record<string, FormContent>,
      consentVersion: form.consentVersion,
      fields: (form.fields as unknown as FormField[] | null) ?? [],
      rules: FormSchemas.rules.parse(form.rules ?? {}) as FormRules,
      style: (form.style as unknown as FormStyle | null) ?? {},
      doubleOptIn: form.doubleOptIn,
      views: form.views,
      submissions: form.submissions,
      createdAt: form.createdAt.toISOString(),
      updatedAt: form.updatedAt.toISOString(),
    };
  }

  public static toPublic(form: FormDefinition, locale?: string): PublicForm {
    const content = resolveLocale(form.content, locale)!;
    return {
      id: form.id,
      type: form.type,
      content,
      fields: form.fields.map(field => ({
        key: field.key,
        label: resolveLocale(field.label, locale) ?? field.key,
        options: field.options.map(option => ({
          value: option.value,
          label: resolveLocale(option.label, locale) ?? option.value,
        })),
      })),
      rules: form.rules,
      style: form.style,
    };
  }

  public static async list(projectId: string): Promise<FormDefinition[]> {
    // A project has a handful of forms, so there is no pagination.
    const forms = await prisma.form.findMany({where: {projectId}, orderBy: {createdAt: 'desc'}, take: 200});
    const pending = await this.pendingViews(forms.map(form => form.id));
    return forms.map(form => ({...this.toDefinition(form), views: form.views + (pending[form.id] ?? 0)}));
  }

  public static async get(projectId: string, id: string): Promise<FormDefinition> {
    const form = await prisma.form.findFirst({where: {id, projectId}});
    if (!form) {
      throw new NotFound('Form', id);
    }
    const pending = await this.pendingViews([form.id]);
    return {...this.toDefinition(form), views: form.views + (pending[form.id] ?? 0)};
  }

  public static async create(projectId: string, input: FormInput): Promise<FormDefinition> {
    const form = await prisma.form.create({
      data: {
        projectId,
        name: input.name,
        type: input.type,
        status: input.status,
        content: input.content as Prisma.InputJsonValue,
        fields: input.fields as Prisma.InputJsonValue,
        rules: input.rules as Prisma.InputJsonValue,
        style: input.style as Prisma.InputJsonValue,
        doubleOptIn: input.doubleOptIn,
      },
    });
    await this.invalidate(projectId);
    return this.toDefinition(form);
  }

  public static async update(projectId: string, id: string, input: FormUpdate): Promise<FormDefinition> {
    const existing = await prisma.form.findFirst({where: {id, projectId}});
    if (!existing) {
      throw new NotFound('Form', id);
    }

    // Each signup records the consent version it agreed to, so changing any consent text
    // starts a new version.
    const consentChanged =
      input.content !== undefined &&
      consentTexts(input.content) !== consentTexts(existing.content as unknown as Record<string, FormContent>);

    const form = await prisma.form.update({
      where: {id},
      data: {
        name: input.name,
        type: input.type,
        status: input.status,
        content: input.content as Prisma.InputJsonValue | undefined,
        fields: input.fields as Prisma.InputJsonValue | undefined,
        rules: input.rules as Prisma.InputJsonValue | undefined,
        style: input.style as Prisma.InputJsonValue | undefined,
        doubleOptIn: input.doubleOptIn,
        consentVersion: consentChanged ? {increment: 1} : undefined,
      },
    });
    await this.invalidate(projectId);
    return this.toDefinition(form);
  }

  public static async delete(projectId: string, id: string): Promise<void> {
    const {count} = await prisma.form.deleteMany({where: {id, projectId}});
    if (count === 0) {
      throw new NotFound('Form', id);
    }
    await redis.hdel(Keys.Form.views(), id);
    await this.invalidate(projectId);
  }

  /** Active forms of a project, cached briefly: every page view of every shop asks for them. */
  public static async active(projectId: string): Promise<FormDefinition[]> {
    return wrapRedis(
      Keys.Form.active(projectId),
      async () => {
        const forms = await prisma.form.findMany({
          where: {projectId, status: 'ACTIVE'},
          orderBy: {createdAt: 'asc'},
          take: 50,
        });
        return forms.map(form => this.toDefinition(form));
      },
      ACTIVE_CACHE_SECONDS,
    );
  }

  public static async publicConfig(projectId: string, locale?: string): Promise<PublicForm[]> {
    const forms = await this.active(projectId);
    return forms
      .filter(form => form.rules.locales.length === 0 || !locale || this.matchesLocale(form.rules.locales, locale))
      .map(form => this.toPublic(form, locale));
  }

  /** Counts a view in Redis. The flush job moves the counts to the database. */
  public static async recordView(projectId: string, formId: string): Promise<void> {
    const forms = await this.active(projectId);
    if (!forms.some(form => form.id === formId)) {
      return;
    }
    await redis.hincrby(Keys.Form.views(), formId, 1);
  }

  /** Moves buffered view counts to the database. Safe to run concurrently with new views. */
  public static async flushViews(): Promise<number> {
    const key = Keys.Form.views();
    const processing = `${key}:flushing`;
    // RENAME is atomic: views recorded after it land in a fresh hash for the next run.
    // A leftover hash from a crashed run is merged first.
    const leftover = await redis.exists(processing);
    if (!leftover) {
      try {
        await redis.rename(key, processing);
      } catch {
        return 0; // Nothing buffered.
      }
    }

    const counts = await redis.hgetall(processing);
    const entries = Object.entries(counts)
      .map(([id, value]) => [id, Number(value)] as const)
      .filter(([, value]) => value > 0);

    // One transaction: a failed run commits nothing, so the retry cannot count a view twice.
    // updateMany: the form may have been deleted since the view was counted.
    await prisma.$transaction(
      entries.map(([id, value]) => prisma.form.updateMany({where: {id}, data: {views: {increment: value}}})),
    );
    await redis.del(processing);
    return entries.length;
  }

  /**
   * First step of a form: the email. Creates or updates the contact and tracks the signup
   * event. Never unsubscribes anyone and never subscribes without consent being confirmed
   * when the form uses double opt-in.
   */
  public static async submit(
    projectId: string,
    formId: string,
    input: z.infer<typeof FormSchemas.publicSubmit>,
    ip: string,
  ): Promise<{success: true; step2Token?: string}> {
    const form = (await this.active(projectId)).find(candidate => candidate.id === formId);
    if (!form) {
      throw new NotFound('Form', formId);
    }

    // Bots fill every input; people never see this one. Pretend it worked.
    if (input.website) {
      return {success: true};
    }

    await this.checkSubmitLimit(projectId, ip);
    await this.verifyTurnstile(projectId, input.turnstileToken, ip);

    const email = ContactService.normalizeEmail(input.email);
    const existing = await prisma.contact.findUnique({
      where: {projectId_email: {projectId, email}},
      select: {subscribed: true},
    });
    const alreadySubscribed = existing?.subscribed === true;
    const content = resolveLocale(form.content, input.locale);
    const now = new Date().toISOString();

    const persistent: Record<string, unknown> = {};
    if (input.locale) persistent.locale = input.locale;
    if (!alreadySubscribed) {
      persistent.signupFormId = form.id;
      persistent.signupAt = now;
      persistent.consentVersion = form.consentVersion;
    }

    let event: string;
    let subscribed: boolean | undefined;
    if (alreadySubscribed) {
      event = FORM_EVENTS.submitted;
      subscribed = undefined;
    } else if (form.doubleOptIn) {
      event = FORM_EVENTS.signupRequested;
      subscribed = false;
    } else {
      event = FORM_EVENTS.subscribed;
      subscribed = true;
    }

    const contact = await ContactService.upsert(projectId, email, persistent, subscribed, subscribed ?? true);

    // The event keeps the full consent record (text, version, time, IP, page) for audit.
    await EventService.trackEvent(projectId, event, contact.id, undefined, {
      form: {
        value: {
          id: form.id,
          name: form.name,
          type: form.type,
          consentVersion: form.consentVersion,
          consentText: content?.consentText ?? null,
          url: input.url ?? null,
          ip,
          at: now,
          alreadySubscribed,
        },
        persistent: false,
      },
      ...(input.locale ? {locale: input.locale} : {}),
    });

    await prisma.form.update({where: {id: form.id}, data: {submissions: {increment: 1}}});

    if (form.fields.length === 0) {
      return {success: true};
    }
    const step2Token = randomBytes(24).toString('base64url');
    await redis.set(
      Keys.Form.step2(step2Token),
      JSON.stringify({projectId, formId: form.id, contactId: contact.id}),
      'EX',
      STEP2_TTL_SECONDS,
    );
    return {success: true, step2Token};
  }

  /** Second step: interests. Only values defined on the form are stored, as string arrays. */
  public static async submitFields(
    projectId: string,
    formId: string,
    input: z.infer<typeof FormSchemas.publicFields>,
  ): Promise<{success: true}> {
    const raw = await redis.get(Keys.Form.step2(input.token));
    const handle = raw ? (JSON.parse(raw) as {projectId: string; formId: string; contactId: string}) : null;
    if (!handle || handle.projectId !== projectId || handle.formId !== formId) {
      throw new HttpException(410, 'This form has expired, please submit your email again');
    }

    const form = (await this.active(projectId)).find(candidate => candidate.id === formId);
    if (!form) {
      throw new NotFound('Form', formId);
    }

    const data: Record<string, string[]> = {};
    for (const field of form.fields) {
      const allowed = new Set(field.options.map(option => option.value));
      const values = input.fields[field.key];
      if (values) {
        data[field.key] = [...new Set(values.filter(value => allowed.has(value)))];
      }
    }

    if (Object.keys(data).length > 0) {
      const contact = await prisma.contact.findUnique({where: {id: handle.contactId}, select: {email: true}});
      if (contact) {
        await ContactService.upsert(projectId, contact.email, data);
      }
    }
    await redis.del(Keys.Form.step2(input.token));
    return {success: true};
  }

  private static matchesLocale(locales: string[], locale: string): boolean {
    const language = locale.split('-')[0];
    return locales.some(candidate => candidate === locale || candidate === language);
  }

  private static async invalidate(projectId: string): Promise<void> {
    await redis.del(Keys.Form.active(projectId));
  }

  private static async pendingViews(ids: string[]): Promise<Record<string, number>> {
    if (ids.length === 0) return {};
    const [current, flushing] = await Promise.all([
      redis.hmget(Keys.Form.views(), ...ids),
      redis.hmget(`${Keys.Form.views()}:flushing`, ...ids),
    ]);
    return Object.fromEntries(ids.map((id, index) => [id, Number(current[index] ?? 0) + Number(flushing[index] ?? 0)]));
  }

  private static async checkSubmitLimit(projectId: string, ip: string): Promise<void> {
    const key = Keys.Form.submitLimit(projectId, ip);
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 3600);
    }
    if (count > FORM_SUBMIT_LIMIT_PER_HOUR) {
      throw new RateLimitError('Too many signups from this address. Please try again later.', 3600);
    }
  }

  public static async settings(projectId: string): Promise<FormSettings> {
    const project = await prisma.project.findUnique({
      where: {id: projectId},
      select: {turnstileEnabled: true, turnstileSiteKey: true, turnstileSecret: true, turnstileHostnames: true},
    });
    if (!project) {
      throw new NotFound('Project', projectId);
    }
    return {
      turnstileEnabled: project.turnstileEnabled,
      turnstileSiteKey: project.turnstileSiteKey,
      turnstileHostnames: project.turnstileHostnames,
      hasTurnstileSecret: Boolean(project.turnstileSecret),
    };
  }

  public static async updateSettings(
    projectId: string,
    input: z.infer<typeof FormSchemas.settings>,
  ): Promise<FormSettings> {
    const current = await this.settings(projectId);
    const next = {
      turnstileEnabled: input.turnstileEnabled ?? current.turnstileEnabled,
      turnstileSiteKey: input.turnstileSiteKey !== undefined ? input.turnstileSiteKey : current.turnstileSiteKey,
      turnstileHostnames: input.turnstileHostnames ?? current.turnstileHostnames,
      hasSecret: input.turnstileSecret !== undefined ? Boolean(input.turnstileSecret) : current.hasTurnstileSecret,
    };
    if (next.turnstileEnabled && (!next.turnstileSiteKey || !next.hasSecret || !next.turnstileHostnames.length)) {
      throw new HttpException(400, 'Turnstile needs a site key, a secret key and at least one hostname');
    }

    await prisma.project.update({
      where: {id: projectId},
      data: {
        turnstileEnabled: next.turnstileEnabled,
        turnstileSiteKey: next.turnstileSiteKey,
        turnstileHostnames: next.turnstileHostnames,
        ...(input.turnstileSecret !== undefined ? {turnstileSecret: input.turnstileSecret || null} : {}),
      },
    });
    await redis.del(Keys.Form.turnstile(projectId));
    return this.settings(projectId);
  }

  /** Site key for the embed script, or null when the project does not use Turnstile. */
  public static async turnstileSiteKey(projectId: string): Promise<string | null> {
    return (await this.turnstile(projectId))?.siteKey ?? null;
  }

  private static async turnstile(
    projectId: string,
  ): Promise<{siteKey: string; secret: string; hostnames: string[]} | null> {
    return wrapRedis(
      Keys.Form.turnstile(projectId),
      async () => {
        const project = await prisma.project.findUnique({
          where: {id: projectId},
          select: {turnstileEnabled: true, turnstileSiteKey: true, turnstileSecret: true, turnstileHostnames: true},
        });
        if (!project?.turnstileEnabled || !project.turnstileSiteKey || !project.turnstileSecret) {
          return null;
        }
        return {
          siteKey: project.turnstileSiteKey,
          secret: project.turnstileSecret,
          hostnames: project.turnstileHostnames,
        };
      },
      ACTIVE_CACHE_SECONDS,
    );
  }

  /** Canonical Turnstile siteverify. Fails closed. A no-op when the project has Turnstile off. */
  private static async verifyTurnstile(projectId: string, token: string | undefined, ip: string): Promise<void> {
    const turnstile = await this.turnstile(projectId);
    if (!turnstile) {
      return;
    }
    if (!token) {
      throw new HttpException(400, 'Verification is required');
    }

    let result: {success?: boolean; action?: string; hostname?: string};
    try {
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({secret: turnstile.secret, response: token, remoteip: ip}),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`siteverify ${response.status}`);
      result = (await response.json()) as typeof result;
    } catch (error) {
      signale.warn('[FORMS] Turnstile siteverify failed:', error);
      throw new HttpException(503, 'Verification is temporarily unavailable');
    }

    if (
      result.success !== true ||
      result.action !== TURNSTILE_ACTION ||
      !result.hostname ||
      !turnstile.hostnames.includes(result.hostname.toLowerCase())
    ) {
      throw new HttpException(400, 'Verification failed');
    }
  }
}
