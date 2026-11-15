import {beforeEach, describe, expect, it} from 'vitest';
import {FormSchemas} from '@plunk/shared';
import {FormService, FORM_EVENTS, resolveLocale} from '../FormService';
import {redis} from '../../database/redis';
import {Keys} from '../keys';
import {factories, getPrismaClient} from '../../../../../test/helpers';

describe('FormService', () => {
  let projectId: string;
  const prisma = getPrismaClient();

  const input = (overrides: Record<string, unknown> = {}) =>
    FormSchemas.create.parse({
      name: 'Footer',
      type: 'POPUP',
      status: 'ACTIVE',
      content: {
        lt: {title: 'Naujienos', button: 'Prenumeruoti', consentText: 'Sutinku gauti naujienlaiškį'},
        en: {title: 'News', button: 'Subscribe'},
      },
      fields: [
        {
          key: 'interests',
          label: {lt: 'Kokia žvejyba užsiimate?'},
          options: [
            {value: 'karpine', label: {lt: 'Karpinė'}},
            {value: 'feeder', label: {lt: 'Feeder'}},
          ],
        },
      ],
      ...overrides,
    });

  const submit = (formId: string, email: string, extra: Record<string, unknown> = {}) =>
    FormService.submit(
      projectId,
      formId,
      FormSchemas.publicSubmit.parse({key: 'pk', email, locale: 'lt', ...extra}),
      '203.0.113.5',
    );

  beforeEach(async () => {
    const {project} = await factories.createUserWithProject();
    projectId = project.id;
  });

  it('resolves locale with language and first-locale fallback', () => {
    const values = {lt: 'a', en: 'b'};
    expect(resolveLocale(values, 'en-GB')).toBe('b');
    expect(resolveLocale(values, 'pl')).toBe('a');
    expect(resolveLocale(values)).toBe('a');
  });

  it('applies rule defaults and rejects invalid option slugs', () => {
    const form = input();
    expect(form.rules.dismissDays).toBe(14);
    expect(form.rules.mobile).toBe('slide_in');
    expect(() =>
      input({fields: [{key: 'interests', label: {lt: 'x'}, options: [{value: 'Karpinė!', label: {lt: 'x'}}]}]}),
    ).toThrow();
  });

  it('serves only active forms, in the requested locale', async () => {
    const active = await FormService.create(projectId, input());
    await FormService.create(projectId, input({status: 'DRAFT'}));

    const forms = await FormService.publicConfig(projectId, 'en');
    expect(forms).toHaveLength(1);
    expect(forms[0]!.id).toBe(active.id);
    expect(forms[0]!.content.title).toBe('News');
    expect(forms[0]!.fields[0]!.options[0]!.label).toBe('Karpinė');
  });

  it('filters forms by locale rule', async () => {
    await FormService.create(projectId, input({rules: {locales: ['lv']}}));
    expect(await FormService.publicConfig(projectId, 'lt')).toHaveLength(0);
    expect(await FormService.publicConfig(projectId, 'lv')).toHaveLength(1);
  });

  it('double opt-in creates an unsubscribed contact and tracks signup_requested with consent', async () => {
    const form = await FormService.create(projectId, input());
    const result = await submit(form.id, 'New@Example.com');

    expect(result.step2Token).toBeTruthy();
    const contact = await prisma.contact.findFirstOrThrow({where: {projectId, email: 'new@example.com'}});
    expect(contact.subscribed).toBe(false);
    expect(contact.data).toMatchObject({locale: 'lt', signupFormId: form.id, consentVersion: 1});

    const event = await prisma.event.findFirstOrThrow({where: {projectId, contactId: contact.id}});
    expect(event.name).toBe(FORM_EVENTS.signupRequested);
    expect(event.data).toMatchObject({form: {value: {consentText: 'Sutinku gauti naujienlaiškį', ip: '203.0.113.5'}}});
    expect((await prisma.form.findUniqueOrThrow({where: {id: form.id}})).submissions).toBe(1);
  });

  it('never unsubscribes an existing subscriber', async () => {
    const form = await FormService.create(projectId, input());
    await prisma.contact.create({data: {projectId, email: 'sub@example.com', subscribed: true}});

    await submit(form.id, 'sub@example.com');

    const contact = await prisma.contact.findFirstOrThrow({where: {projectId, email: 'sub@example.com'}});
    expect(contact.subscribed).toBe(true);
    const event = await prisma.event.findFirstOrThrow({where: {projectId, contactId: contact.id}});
    expect(event.name).toBe(FORM_EVENTS.submitted);
  });

  it('subscribes directly without double opt-in', async () => {
    const form = await FormService.create(projectId, input({doubleOptIn: false, fields: []}));
    const result = await submit(form.id, 'direct@example.com');

    expect(result.step2Token).toBeUndefined();
    const contact = await prisma.contact.findFirstOrThrow({where: {projectId, email: 'direct@example.com'}});
    expect(contact.subscribed).toBe(true);
  });

  it('ignores honeypot submissions', async () => {
    const form = await FormService.create(projectId, input());
    await submit(form.id, 'bot@example.com', {website: 'http://spam'});
    expect(await prisma.contact.count({where: {projectId, email: 'bot@example.com'}})).toBe(0);
  });

  it('stores only known second-step options as arrays', async () => {
    const form = await FormService.create(projectId, input());
    const {step2Token} = await submit(form.id, 'fan@example.com');

    await FormService.submitFields(
      projectId,
      form.id,
      FormSchemas.publicFields.parse({key: 'pk', token: step2Token, fields: {interests: ['karpine', 'hacked'], other: ['x']}}),
    );

    const contact = await prisma.contact.findFirstOrThrow({where: {projectId, email: 'fan@example.com'}});
    expect((contact.data as Record<string, unknown>).interests).toEqual(['karpine']);
    expect((contact.data as Record<string, unknown>).other).toBeUndefined();

    // The token is single-use.
    await expect(
      FormService.submitFields(projectId, form.id, FormSchemas.publicFields.parse({key: 'pk', token: step2Token, fields: {}})),
    ).rejects.toThrow();
  });

  it('bumps the consent version only when consent text changes', async () => {
    const form = await FormService.create(projectId, input());
    const renamed = await FormService.update(projectId, form.id, {name: 'Renamed'});
    expect(renamed.consentVersion).toBe(1);

    const changed = await FormService.update(projectId, form.id, {
      content: {lt: {title: 'Naujienos', button: 'Prenumeruoti', consentText: 'Nauja redakcija'}},
    });
    expect(changed.consentVersion).toBe(2);
  });

  it('buffers views in Redis and flushes them to the database', async () => {
    const form = await FormService.create(projectId, input());
    await FormService.recordView(projectId, form.id);
    await FormService.recordView(projectId, form.id);
    await FormService.recordView(projectId, 'unknown-form');

    expect((await FormService.get(projectId, form.id)).views).toBe(2);
    await FormService.flushViews();
    expect((await prisma.form.findUniqueOrThrow({where: {id: form.id}})).views).toBe(2);
    expect(await redis.hget(Keys.Form.views(), form.id)).toBeNull();
    expect((await FormService.get(projectId, form.id)).views).toBe(2);
  });
});
