import {Controller, Delete, Get, Middleware, Patch, Post} from '@overnightjs/core';
import {FormSchemas} from '@plunk/shared';
import type {NextFunction, Request, Response} from 'express';

import {TURNSTILE_SITE_KEY} from '../app/constants.js';
import {HttpException} from '../exceptions/index.js';
import {EMBED_SCRIPT} from '../forms/embed.js';
import {requireAuth, requireEmailVerified} from '../middleware/auth.js';
import {FormService, TURNSTILE_ACTION} from '../services/FormService.js';
import {ProjectService} from '../services/ProjectService.js';
import {CatchAsync} from '../utils/asyncHandler.js';

/** Client IP behind Cloudflare and the reverse proxy. */
function clientIp(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf;
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.ip || req.socket.remoteAddress || 'unknown';
}

/** Public endpoints are called from shop pages with the project's public (pk_) key. */
async function projectFromPublicKey(key: string): Promise<string> {
  const project = await ProjectService.public(key);
  if (!project || project.disabled) {
    throw new HttpException(401, 'Invalid public key');
  }
  return project.id;
}

/**
 * Signup forms. The dashboard manages them; shops load /forms/embed.js, which reads the
 * active forms from /forms/public/config and posts signups to /forms/public/:id/submit.
 */
@Controller('forms')
export class Forms {
  /** GET /forms/embed.js — the script shops include on every page. */
  @Get('embed.js')
  public embed(_req: Request, res: Response, _next: NextFunction) {
    res.set({
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    return res.status(200).send(EMBED_SCRIPT);
  }

  /** GET /forms/public/config?key=pk_...&locale=lt */
  @Get('public/config')
  @CatchAsync
  public async config(req: Request, res: Response, _next: NextFunction) {
    const {key, locale} = FormSchemas.publicConfig.parse(req.query);
    const projectId = await projectFromPublicKey(key);
    const forms = await FormService.publicConfig(projectId, locale);
    res.set('Cache-Control', 'public, max-age=60');
    return res.status(200).json({
      forms,
      turnstile: TURNSTILE_SITE_KEY ? {siteKey: TURNSTILE_SITE_KEY, action: TURNSTILE_ACTION} : null,
    });
  }

  /** POST /forms/public/:id/view — sent with sendBeacon when a form is shown. */
  @Post('public/:id/view')
  @CatchAsync
  public async view(req: Request, res: Response, _next: NextFunction) {
    const {key} = FormSchemas.publicView.parse(typeof req.body === 'object' && req.body ? req.body : {});
    const projectId = await projectFromPublicKey(key);
    await FormService.recordView(projectId, String(req.params.id));
    return res.status(204).end();
  }

  /** POST /forms/public/:id/submit — first step (email). */
  @Post('public/:id/submit')
  @CatchAsync
  public async submit(req: Request, res: Response, _next: NextFunction) {
    const input = FormSchemas.publicSubmit.parse(req.body);
    const projectId = await projectFromPublicKey(input.key);
    const result = await FormService.submit(projectId, String(req.params.id), input, clientIp(req));
    return res.status(200).json(result);
  }

  /** POST /forms/public/:id/fields — optional second step (interests). */
  @Post('public/:id/fields')
  @CatchAsync
  public async fields(req: Request, res: Response, _next: NextFunction) {
    const input = FormSchemas.publicFields.parse(req.body);
    const projectId = await projectFromPublicKey(input.key);
    const result = await FormService.submitFields(projectId, String(req.params.id), input);
    return res.status(200).json(result);
  }

  /** GET /forms */
  @Get('')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async list(_req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    return res.status(200).json({forms: await FormService.list(auth.projectId!)});
  }

  /** GET /forms/:id */
  @Get(':id')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async get(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    return res.status(200).json(await FormService.get(auth.projectId!, String(req.params.id)));
  }

  /** POST /forms */
  @Post('')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async create(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const input = FormSchemas.create.parse(req.body);
    return res.status(201).json(await FormService.create(auth.projectId!, input));
  }

  /** PATCH /forms/:id */
  @Patch(':id')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async update(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const input = FormSchemas.update.parse(req.body);
    return res.status(200).json(await FormService.update(auth.projectId!, String(req.params.id), input));
  }

  /** DELETE /forms/:id */
  @Delete(':id')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async delete(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    await FormService.delete(auth.projectId!, String(req.params.id));
    return res.status(204).end();
  }
}
