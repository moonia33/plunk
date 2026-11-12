import {Controller, Delete, Get, Middleware, Patch, Post, Put} from '@overnightjs/core';
import {CatalogSchemas} from '@plunk/shared';
import type {NextFunction, Request, Response} from 'express';
import {NotFound} from '../exceptions/index.js';
import {requireAuth, requireEmailVerified} from '../middleware/auth.js';
import {contactWriteRateLimit} from '../middleware/rateLimit.js';
import {CatalogService} from '../services/CatalogService.js';
import {CatchAsync} from '../utils/asyncHandler.js';

/**
 * Product catalog. Shops push products here (secret key) and templates read them at
 * render time through `catalog["<id>"]`. Product IDs are the shop's own IDs.
 */
@Controller('catalog')
export class Catalog {
  /**
   * GET /catalog/products?search=&limit=&cursor=
   * Cursor-paginated list, ordered by name. `search` matches name (contains), id or SKU.
   */
  @Get('products')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async list(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const {limit, cursor, search} = CatalogSchemas.list.parse(req.query);
    const result = await CatalogService.list(auth.projectId!, limit, cursor, search || undefined);
    return res.status(200).json(result);
  }

  /**
   * GET /catalog/render?ids=a,b&locale=lt
   * Products as templates see them (localized, with final price and formatting); used by
   * the editor preview. Unknown IDs are left out.
   */
  @Get('render')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async render(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const {ids, locale} = CatalogSchemas.render.parse(req.query);
    const catalog = await CatalogService.forRender(auth.projectId!, ['catalog'], {context: {productIds: ids}, locale});
    return res.status(200).json({catalog});
  }

  /**
   * GET /catalog/products/:id
   */
  @Get('products/:id')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async get(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const product = await CatalogService.get(auth.projectId!, String(req.params.id));
    if (!product) {
      throw new NotFound('Product', String(req.params.id));
    }
    return res.status(200).json(product);
  }

  /**
   * PUT /catalog/products
   * Create or fully replace up to 500 products: {products: [...]}
   */
  @Put('products')
  @Middleware([requireAuth, requireEmailVerified, contactWriteRateLimit])
  @CatchAsync
  public async upsert(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const {products} = CatalogSchemas.upsert.parse(req.body);
    const result = await CatalogService.upsert(auth.projectId!, products);
    return res.status(200).json(result);
  }

  /**
   * PATCH /catalog/products
   * Update price/stock fields of up to 1000 existing products: {products: [{id, price?, ...}]}
   */
  @Patch('products')
  @Middleware([requireAuth, requireEmailVerified, contactWriteRateLimit])
  @CatchAsync
  public async update(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const {products} = CatalogSchemas.update.parse(req.body);
    const result = await CatalogService.update(auth.projectId!, products);
    return res.status(200).json(result);
  }

  /**
   * POST /catalog/products/delete
   * Delete up to 1000 products: {ids: [...]}
   */
  @Post('products/delete')
  @Middleware([requireAuth, requireEmailVerified, contactWriteRateLimit])
  @CatchAsync
  public async deleteMany(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const {ids} = CatalogSchemas.delete.parse(req.body);
    const result = await CatalogService.delete(auth.projectId!, ids);
    return res.status(200).json(result);
  }

  /**
   * DELETE /catalog/products/:id
   */
  @Delete('products/:id')
  @Middleware([requireAuth, requireEmailVerified, contactWriteRateLimit])
  @CatchAsync
  public async delete(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const {deleted} = await CatalogService.delete(auth.projectId!, [String(req.params.id)]);
    if (deleted === 0) {
      throw new NotFound('Product', String(req.params.id));
    }
    return res.status(200).json({deleted});
  }
}
