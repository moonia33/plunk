import {randomUUID} from 'node:crypto';
import {Prisma, type Product} from '@plunk/db';
import type {CatalogSchemas} from '@plunk/shared';
import type {CatalogProduct, CatalogProductTranslation, CatalogRenderProduct} from '@plunk/types';
import type {z} from 'zod';
import {prisma} from '../database/prisma.js';

type CatalogProductInput = z.infer<typeof CatalogSchemas.product>;
type CatalogProductUpdate = z.infer<typeof CatalogSchemas.update>['products'][number];

/** Most products one email can pull from the catalog; caps the render-time query. */
export const MAX_RENDER_PRODUCTS = 100;

/** Keys in event/workflow data whose values are treated as catalog product IDs. */
const PRODUCT_ID_KEYS = new Set(['productId', 'product_id', 'productIds', 'product_ids']);
const CONTEXT_WALK_DEPTH = 6;
const STATIC_REFERENCE = /catalog\s*\[\s*(["'])([^"'\]\r\n]{1,191})\1\s*\]/g;

function toNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatMoney(amount: number | null, currency: string | null, locale: string): string | null {
  if (amount === null) {
    return null;
  }
  if (!currency) {
    return amount.toFixed(2);
  }
  try {
    return new Intl.NumberFormat(locale, {style: 'currency', currency}).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function pickTranslation(
  translations: Product['translations'],
  locale: string | null,
): CatalogProductTranslation | undefined {
  if (!locale || !isPlainObject(translations)) {
    return undefined;
  }
  const exact = translations[locale];
  if (isPlainObject(exact)) {
    return exact as CatalogProductTranslation;
  }
  const language = translations[locale.split('-')[0]!];
  return isPlainObject(language) ? (language as CatalogProductTranslation) : undefined;
}

/**
 * Product IDs a render needs: static `catalog["id"]` references in the templates plus any
 * `productId`/`productIds` values in the event or workflow data (cart items, a saved
 * recommendations webhook response, ...). Capped at MAX_RENDER_PRODUCTS.
 */
export function collectProductIds(templates: string[], context?: unknown): string[] {
  const ids = new Set<string>();

  for (const template of templates) {
    for (const match of template.matchAll(STATIC_REFERENCE)) {
      ids.add(match[2]!);
      if (ids.size >= MAX_RENDER_PRODUCTS) {
        return [...ids];
      }
    }
  }

  const addId = (value: unknown) => {
    if ((typeof value === 'string' && value.length > 0 && value.length <= 191) || typeof value === 'number') {
      ids.add(String(value));
    }
  };

  const walk = (value: unknown, depth: number) => {
    if (depth > CONTEXT_WALK_DEPTH || ids.size >= MAX_RENDER_PRODUCTS) {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item, depth + 1);
      }
      return;
    }
    if (!isPlainObject(value)) {
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (PRODUCT_ID_KEYS.has(key)) {
        if (Array.isArray(child)) {
          child.forEach(addId);
        } else {
          addId(child);
        }
      } else {
        walk(child, depth + 1);
      }
    }
  };

  walk(context, 0);
  return [...ids].slice(0, MAX_RENDER_PRODUCTS);
}

/**
 * Catalog products loaded once for a render, localized per recipient on demand. A campaign
 * batch loads one snapshot and calls `forLocale` per contact; the query runs only once.
 */
export class CatalogSnapshot {
  private readonly byLocale = new Map<string, Record<string, CatalogRenderProduct>>();

  public constructor(private readonly products: Product[]) {}

  public get size(): number {
    return this.products.length;
  }

  public forLocale(locale?: unknown): Record<string, CatalogRenderProduct> {
    const key = typeof locale === 'string' && locale ? locale : '';
    const cached = this.byLocale.get(key);
    if (cached) {
      return cached;
    }
    const map: Record<string, CatalogRenderProduct> = {};
    for (const product of this.products) {
      map[product.externalId] = CatalogService.toRenderProduct(product, key || null);
    }
    this.byLocale.set(key, map);
    return map;
  }
}

const EMPTY_SNAPSHOT = new CatalogSnapshot([]);

export class CatalogService {
  public static toApiProduct(product: Product): CatalogProduct {
    return {
      id: product.externalId,
      parentId: product.parentId,
      sku: product.sku,
      name: product.name,
      description: product.description,
      url: product.url,
      imageUrl: product.imageUrl,
      images: Array.isArray(product.images) ? (product.images as string[]) : [],
      price: toNumber(product.price),
      salePrice: toNumber(product.salePrice),
      currency: product.currency,
      available: product.available,
      quantity: product.quantity,
      brand: product.brand,
      categories: product.categories,
      translations: isPlainObject(product.translations)
        ? (product.translations as Record<string, CatalogProductTranslation>)
        : null,
      data: isPlainObject(product.data) ? product.data : null,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  public static toRenderProduct(product: Product, locale: string | null): CatalogRenderProduct {
    const translation = pickTranslation(product.translations, locale);
    const price = translation?.price ?? toNumber(product.price);
    const salePrice =
      translation && 'salePrice' in translation ? (translation.salePrice ?? null) : toNumber(product.salePrice);
    const currency = translation?.currency ?? product.currency;
    const onSale = price !== null && salePrice !== null && salePrice < price;
    const finalPrice = onSale ? salePrice : price;
    const formatLocale = locale ?? 'en';

    return {
      id: product.externalId,
      parentId: product.parentId,
      sku: product.sku,
      name: translation?.name ?? product.name,
      description: translation?.description ?? product.description,
      url: translation?.url ?? product.url,
      imageUrl: translation?.imageUrl ?? product.imageUrl,
      images: Array.isArray(product.images) ? (product.images as string[]) : [],
      price,
      salePrice: onSale ? salePrice : null,
      finalPrice,
      onSale,
      discountPercent: onSale ? Math.round((1 - salePrice! / price!) * 100) : null,
      currency,
      priceFormatted: formatMoney(price, currency, formatLocale),
      salePriceFormatted: onSale ? formatMoney(salePrice, currency, formatLocale) : null,
      finalPriceFormatted: formatMoney(finalPrice, currency, formatLocale),
      available: product.available,
      quantity: product.quantity,
      brand: product.brand,
      categories: product.categories,
      data: isPlainObject(product.data) ? product.data : null,
    };
  }

  /**
   * Load the products a render needs. Templates that never mention `catalog` skip the
   * query entirely, so ordinary emails pay nothing for the feature.
   */
  public static async snapshot(projectId: string, templates: string[], context?: unknown): Promise<CatalogSnapshot> {
    if (!templates.some(template => template.includes('catalog'))) {
      return EMPTY_SNAPSHOT;
    }
    const ids = collectProductIds(templates, context);
    if (ids.length === 0) {
      return EMPTY_SNAPSHOT;
    }
    const products = await prisma.product.findMany({
      where: {projectId, externalId: {in: ids}},
    });
    return new CatalogSnapshot(products);
  }

  /** Snapshot + localization for a single recipient (workflow and transactional sends). */
  public static async forRender(
    projectId: string,
    templates: string[],
    options: {context?: unknown; locale?: unknown} = {},
  ): Promise<Record<string, CatalogRenderProduct>> {
    const snapshot = await this.snapshot(projectId, templates, options.context);
    return snapshot.forLocale(options.locale);
  }

  public static async list(projectId: string, limit: number, cursor?: string, search?: string, parentId?: string) {
    const where: Prisma.ProductWhereInput = parentId ? {projectId, parentId} : {projectId};
    if (search) {
      where.OR = [{name: {contains: search, mode: 'insensitive'}}, {externalId: search}, {sku: search}];
    }

    // The total is only computed for the first page; later pages reuse it.
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        take: limit + 1,
        skip: cursor ? 1 : 0,
        cursor: cursor ? {id: cursor} : undefined,
        orderBy: [{name: 'asc'}, {id: 'asc'}],
      }),
      cursor ? Promise.resolve(undefined) : prisma.product.count({where}),
    ]);

    const hasMore = products.length > limit;
    const results = hasMore ? products.slice(0, -1) : products;

    return {
      products: results.map(product => this.toApiProduct(product)),
      cursor: hasMore ? results[results.length - 1]?.id : undefined,
      hasMore,
      ...(total === undefined ? {} : {total}),
    };
  }

  public static async get(projectId: string, externalId: string): Promise<CatalogProduct | null> {
    const product = await prisma.product.findUnique({
      where: {projectId_externalId: {projectId, externalId}},
    });
    return product ? this.toApiProduct(product) : null;
  }

  /**
   * Create or fully replace products in one statement. Fields left out of a product are
   * cleared, so the payload must carry the whole product; use `update` for price/stock.
   * Duplicate IDs in one request keep the last occurrence.
   */
  public static async upsert(projectId: string, input: CatalogProductInput[]): Promise<{upserted: number}> {
    const products = [...new Map(input.map(product => [product.id, product])).values()];
    const json = (value: unknown) => (value === undefined || value === null ? null : JSON.stringify(value));

    const rows = products.map(
      product => Prisma.sql`(
        ${randomUUID()}, ${projectId}, ${product.id}, ${product.parentId ?? null}, ${product.sku ?? null},
        ${product.name}, ${product.description ?? null}, ${product.url ?? null}, ${product.imageUrl ?? null},
        ${json(product.images)}::jsonb, ${product.price ?? null}::decimal(12,2), ${product.salePrice ?? null}::decimal(12,2),
        ${product.currency ?? null}, ${product.available}, ${product.quantity ?? null}::int, ${product.brand ?? null},
        ${product.categories ?? []}::text[], ${json(product.translations)}::jsonb, ${json(product.data)}::jsonb,
        now(), now()
      )`,
    );

    const upserted = await prisma.$executeRaw`
      INSERT INTO "products" (
        "id", "projectId", "externalId", "parentId", "sku",
        "name", "description", "url", "imageUrl",
        "images", "price", "salePrice",
        "currency", "available", "quantity", "brand",
        "categories", "translations", "data",
        "createdAt", "updatedAt"
      )
      VALUES ${Prisma.join(rows)}
      ON CONFLICT ("projectId", "externalId") DO UPDATE SET
        "parentId" = EXCLUDED."parentId",
        "sku" = EXCLUDED."sku",
        "name" = EXCLUDED."name",
        "description" = EXCLUDED."description",
        "url" = EXCLUDED."url",
        "imageUrl" = EXCLUDED."imageUrl",
        "images" = EXCLUDED."images",
        "price" = EXCLUDED."price",
        "salePrice" = EXCLUDED."salePrice",
        "currency" = EXCLUDED."currency",
        "available" = EXCLUDED."available",
        "quantity" = EXCLUDED."quantity",
        "brand" = EXCLUDED."brand",
        "categories" = EXCLUDED."categories",
        "translations" = EXCLUDED."translations",
        "data" = EXCLUDED."data",
        "updatedAt" = now()
    `;

    return {upserted};
  }

  /**
   * Partial update of price and stock fields for existing products. Only the fields
   * present on each item change; `null` clears a field. Unknown IDs are reported back.
   */
  public static async update(
    projectId: string,
    input: CatalogProductUpdate[],
  ): Promise<{updated: number; notFound: string[]}> {
    const items = [...new Map(input.map(item => [item.id, item])).values()];
    const has = (item: CatalogProductUpdate, key: keyof CatalogProductUpdate) => item[key] !== undefined;

    const rows = items.map(
      item => Prisma.sql`(
        ${item.id}::text,
        ${has(item, 'price')}::boolean, ${item.price ?? null}::decimal(12,2),
        ${has(item, 'salePrice')}::boolean, ${item.salePrice ?? null}::decimal(12,2),
        ${has(item, 'currency')}::boolean, ${item.currency ?? null}::text,
        ${has(item, 'available')}::boolean, ${item.available ?? null}::boolean,
        ${has(item, 'quantity')}::boolean, ${item.quantity ?? null}::int
      )`,
    );

    const updated = await prisma.$queryRaw<Array<{externalId: string}>>`
      UPDATE "products" AS p SET
        "price" = CASE WHEN v.set_price THEN v.price ELSE p."price" END,
        "salePrice" = CASE WHEN v.set_sale THEN v.sale ELSE p."salePrice" END,
        "currency" = CASE WHEN v.set_currency THEN v.currency ELSE p."currency" END,
        "available" = CASE WHEN v.set_available THEN COALESCE(v.available, p."available") ELSE p."available" END,
        "quantity" = CASE WHEN v.set_quantity THEN v.quantity ELSE p."quantity" END,
        "updatedAt" = now()
      FROM (VALUES ${Prisma.join(rows)}) AS v(
        "externalId", set_price, price, set_sale, sale, set_currency, currency,
        set_available, available, set_quantity, quantity
      )
      WHERE p."projectId" = ${projectId} AND p."externalId" = v."externalId"
      RETURNING p."externalId"
    `;

    const found = new Set(updated.map(row => row.externalId));
    return {
      updated: updated.length,
      notFound: items.map(item => item.id).filter(id => !found.has(id)),
    };
  }

  public static async delete(projectId: string, externalIds: string[]): Promise<{deleted: number}> {
    const {count} = await prisma.product.deleteMany({
      where: {projectId, externalId: {in: externalIds}},
    });
    return {deleted: count};
  }
}
