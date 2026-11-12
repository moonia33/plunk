import {renderTemplate, validateTemplate} from '@plunk/shared';
import {describe, expect, it} from 'vitest';

import {detectCustomHtmlPatterns} from '../../../lib/emailStyles';
import {buildProductBlockHtml, isUsableProductId, referencedProductIds, stripProductBlocks} from '../ProductBlock';

const product = (overrides: Record<string, unknown> = {}) => ({
  id: '1',
  name: 'Spiningas <Pro>',
  url: 'https://shop.example/1',
  imageUrl: 'https://cdn.example/1.jpg',
  available: true,
  onSale: true,
  priceFormatted: '100,00 €',
  finalPriceFormatted: '80,00 €',
  discountPercent: 20,
  ...overrides,
});

describe('ProductBlock', () => {
  const html = buildProductBlockHtml({ids: ['1', '2', '3'], columns: 2, buttonText: 'Pirkti {{x}}'});

  it('is valid Liquid', () => {
    expect(validateTemplate(html)).toEqual(expect.objectContaining({valid: true}));
  });

  it('lays products out in rows of the chosen width', () => {
    expect(html.match(/<tr>/g)).toHaveLength(2);
    expect(html.match(/<td /g)).toHaveLength(3);
  });

  it('renders available products and leaves out unavailable or unknown ones', () => {
    const out = renderTemplate(html, {catalog: {'1': product(), '2': product({id: '2', name: 'Ritė', available: false})}});
    expect(out).toContain('Spiningas &lt;Pro&gt;');
    expect(out).toContain('80,00 €');
    expect(out).toContain('-20%');
    expect(out).not.toContain('Ritė');
    expect(out.match(/https:\/\/shop.example\/1/g)).toHaveLength(2);
  });

  it('escapes the button label so it cannot inject Liquid or HTML', () => {
    expect(html).toContain('Pirkti &#123;&#123;x&#125;&#125;');
  });

  it('skips IDs that would break the lookup and caps the count', () => {
    expect(isUsableProductId('a"b')).toBe(false);
    const many = buildProductBlockHtml({ids: ['a"b', ...'12345678'.split('')], columns: 3, buttonText: 'Go'});
    expect(referencedProductIds(many)).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('keeps the visual editor for emails whose only custom markup is product blocks', () => {
    expect(detectCustomHtmlPatterns(`<p>Hi</p>${html}<p>Bye</p>`)).toBe(false);
    expect(stripProductBlocks(`<p>a</p>${html}`)).toBe('<p>a</p>');
    expect(detectCustomHtmlPatterns(`${html}<table><tr><td>x</td></tr></table>`)).toBe(true);
  });
});
