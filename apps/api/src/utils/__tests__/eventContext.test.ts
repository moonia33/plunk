import {renderTemplate} from '@plunk/shared';
import {describe, expect, it} from 'vitest';

import {unwrapEventContext} from '../eventContext.js';

describe('unwrapEventContext', () => {
  it('replaces top-level non-persistent wrappers with their value', () => {
    const context = unwrapEventContext({
      cart: {value: {items: [{productId: '1-2', quantity: 1}]}, persistent: false},
      plan: 'pro',
      coupon: {code: 'BZ-ABC'},
    });
    expect(context).toEqual({cart: {items: [{productId: '1-2', quantity: 1}]}, plan: 'pro', coupon: {code: 'BZ-ABC'}});
    expect(renderTemplate('{% for i in event.cart.items %}{{ i.productId }}{% endfor %}', {event: context})).toBe('1-2');
  });

  it('keeps objects that only look similar', () => {
    expect(unwrapEventContext({a: {value: 1, persistent: true}, b: {value: 2}})).toEqual({
      a: {value: 1, persistent: true},
      b: {value: 2},
    });
  });

  it('returns an empty scope for missing or non-object context', () => {
    expect(unwrapEventContext(null)).toEqual({});
    expect(unwrapEventContext([1])).toEqual({});
  });
});
