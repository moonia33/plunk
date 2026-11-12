import {beforeEach, describe, expect, it} from 'vitest';
import {CatalogSchemas} from '@plunk/shared';
import {renderTemplate} from '@plunk/shared';
import {CatalogService, collectProductIds, MAX_RENDER_PRODUCTS} from '../CatalogService';
import {factories, getPrismaClient} from '../../../../../test/helpers';

describe('CatalogService', () => {
  let projectId: string;
  const prisma = getPrismaClient();

  const product = (overrides: Record<string, unknown> = {}) =>
    CatalogSchemas.product.parse({
      id: 101,
      name: 'Spiningas Shimano',
      url: 'https://shop.example/lt/101',
      imageUrl: 'https://cdn.example/101.jpg',
      price: 100,
      salePrice: 80,
      currency: 'EUR',
      categories: ['Spiningai'],
      translations: {lv: {name: 'Spinings Shimano', url: 'https://shop.example/lv/101'}},
      ...overrides,
    });

  beforeEach(async () => {
    const {project} = await factories.createUserWithProject();
    projectId = project.id;
  });

  describe('schemas', () => {
    it('rejects non-http product URLs', () => {
      expect(CatalogSchemas.product.safeParse({id: 1, name: 'x', url: 'javascript:alert(1)'}).success).toBe(false);
    });

    it('rejects more than 500 products per upsert', () => {
      const products = Array.from({length: 501}, (_, i) => ({id: i, name: `p${i}`}));
      expect(CatalogSchemas.upsert.safeParse({products}).success).toBe(false);
    });

    it('coerces numeric IDs to strings', () => {
      expect(CatalogSchemas.product.parse({id: 7, name: 'x'}).id).toBe('7');
    });
  });

  describe('upsert', () => {
    it('creates products and fully replaces them on a second upsert', async () => {
      await CatalogService.upsert(projectId, [product(), product({id: 'B-2', name: 'Ritė', salePrice: null})]);
      expect(await prisma.product.count({where: {projectId}})).toBe(2);

      await CatalogService.upsert(projectId, [
        product({name: 'Spiningas Shimano 2', salePrice: undefined, translations: undefined}),
      ]);

      const stored = await CatalogService.get(projectId, '101');
      expect(stored?.name).toBe('Spiningas Shimano 2');
      expect(stored?.salePrice).toBeNull();
      expect(stored?.translations).toBeNull();
      expect(stored?.price).toBe(100);
      expect(stored?.categories).toEqual(['Spiningai']);
      expect(await prisma.product.count({where: {projectId}})).toBe(2);
    });

    it('keeps the last occurrence of a duplicated ID', async () => {
      const {upserted} = await CatalogService.upsert(projectId, [product({name: 'first'}), product({name: 'last'})]);
      expect(upserted).toBe(1);
      expect((await CatalogService.get(projectId, '101'))?.name).toBe('last');
    });

    it('keeps projects isolated', async () => {
      const {project: other} = await factories.createUserWithProject();
      await CatalogService.upsert(other.id, [product({name: 'other'})]);
      await CatalogService.upsert(projectId, [product()]);
      expect((await CatalogService.get(other.id, '101'))?.name).toBe('other');
      expect((await CatalogService.get(projectId, '101'))?.name).toBe('Spiningas Shimano');
    });
  });

  describe('update', () => {
    it('changes only the given fields and reports unknown IDs', async () => {
      await CatalogService.upsert(projectId, [product()]);

      const result = await CatalogService.update(projectId, [
        {id: '101', salePrice: null, available: false, quantity: 0},
        {id: 'missing', price: 1},
      ]);

      expect(result).toEqual({updated: 1, notFound: ['missing']});
      const stored = await CatalogService.get(projectId, '101');
      expect(stored).toMatchObject({price: 100, salePrice: null, available: false, quantity: 0, currency: 'EUR'});
    });
  });

  describe('list and delete', () => {
    it('paginates with a cursor and searches by name, id and SKU', async () => {
      await CatalogService.upsert(
        projectId,
        Array.from({length: 5}, (_, i) => product({id: `p${i}`, name: `Masalas ${i}`, sku: `SKU-${i}`})),
      );

      const first = await CatalogService.list(projectId, 2);
      expect(first.products.map(p => p.id)).toEqual(['p0', 'p1']);
      expect(first.hasMore).toBe(true);
      expect(first.total).toBe(5);
      const second = await CatalogService.list(projectId, 2, first.cursor);
      expect(second.products.map(p => p.id)).toEqual(['p2', 'p3']);
      expect(second.total).toBeUndefined();

      expect((await CatalogService.list(projectId, 20, undefined, 'masalas 3')).products.map(p => p.id)).toEqual([
        'p3',
      ]);
      expect((await CatalogService.list(projectId, 20, undefined, 'SKU-4')).products.map(p => p.id)).toEqual(['p4']);
      expect((await CatalogService.list(projectId, 20, undefined, 'p1')).products.map(p => p.id)).toEqual(['p1']);
    });

    it('lists the variants of a parent', async () => {
      await CatalogService.upsert(projectId, [
        product({id: '10', name: 'Ritė'}),
        product({id: '10-1', parentId: '10', name: 'Ritė 2000'}),
        product({id: '10-2', parentId: '10', name: 'Ritė 3000'}),
        product({id: '11', name: 'Valas'}),
      ]);
      const variants = await CatalogService.list(projectId, 20, undefined, undefined, '10');
      expect(variants.products.map(p => p.id)).toEqual(['10-1', '10-2']);
      expect(variants.total).toBe(2);
    });

    it('deletes by ID', async () => {
      await CatalogService.upsert(projectId, [product(), product({id: 'x'})]);
      expect(await CatalogService.delete(projectId, ['101', 'nope'])).toEqual({deleted: 1});
      expect(await CatalogService.get(projectId, '101')).toBeNull();
    });
  });

  describe('render', () => {
    it('collects static references and product IDs from event data', () => {
      const ids = collectProductIds(['{{ catalog["101"].name }} {{ catalog[\'B-2\'].url }}'], {
        cart: {items: [{productId: 5}, {productId: '6'}]},
        recommendations: {productIds: ['7', 8]},
      });
      expect(ids.sort()).toEqual(['101', '5', '6', '7', '8', 'B-2']);
    });

    it('caps the number of products per render', () => {
      const productIds = Array.from({length: MAX_RENDER_PRODUCTS + 50}, (_, i) => i);
      expect(collectProductIds(['catalog'], {productIds})).toHaveLength(MAX_RENDER_PRODUCTS);
    });

    it('skips the query when the template does not mention the catalog', async () => {
      await CatalogService.upsert(projectId, [product()]);
      const snapshot = await CatalogService.snapshot(projectId, ['Hello {{name}}'], {productId: '101'});
      expect(snapshot.size).toBe(0);
    });

    it('localizes products and drops unavailable ones in templates', async () => {
      await CatalogService.upsert(projectId, [product(), product({id: '102', name: 'Išparduota', available: false})]);
      const template =
        '{% assign p = catalog["101"] %}{{ p.name }}|{{ p.url }}|{{ p.finalPrice }}|{{ p.discountPercent }}' +
        '{% for item in event.items %}{% assign q = catalog[item.productId] %}{% if q.available %}[{{ q.name }}]{% endif %}{% endfor %}';
      const event = {items: [{productId: '101'}, {productId: '102'}, {productId: 'gone'}]};

      const lv = await CatalogService.forRender(projectId, [template], {context: event, locale: 'lv'});
      expect(renderTemplate(template, {catalog: lv, event})).toBe(
        'Spinings Shimano|https://shop.example/lv/101|80|20[Spinings Shimano]',
      );

      const lt = await CatalogService.forRender(projectId, [template], {context: event, locale: 'lt'});
      expect(renderTemplate(template, {catalog: lt, event})).toBe(
        'Spiningas Shimano|https://shop.example/lt/101|80|20[Spiningas Shimano]',
      );
      expect(lt['101']?.finalPriceFormatted).toMatch(/80,00\s€/);
    });

    it('reads current prices at render time', async () => {
      await CatalogService.upsert(projectId, [product()]);
      await CatalogService.update(projectId, [{id: '101', salePrice: 70}]);
      const catalog = await CatalogService.forRender(projectId, ['{{ catalog["101"].finalPrice }}']);
      expect(catalog['101']?.finalPrice).toBe(70);
      expect(catalog['101']?.discountPercent).toBe(30);
    });
  });
});
