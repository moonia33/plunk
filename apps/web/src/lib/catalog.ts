import type {CatalogProduct} from '@plunk/types';

export interface CatalogListResponse {
  products: CatalogProduct[];
  cursor?: string;
  hasMore: boolean;
  total?: number;
}

export function formatMoney(amount: number | null, currency: string | null): string {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat(undefined, {style: 'currency', currency: currency || 'EUR'}).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency ?? ''}`.trim();
  }
}

/** Effective price: a sale price only counts when it undercuts the regular price. */
export function effectiveSalePrice(product: Pick<CatalogProduct, 'price' | 'salePrice'>): number | null {
  if (product.salePrice == null || product.price == null) return null;
  return product.salePrice < product.price ? product.salePrice : null;
}

export function catalogProductHref(id: string): string {
  return `/catalog/${encodeURIComponent(id)}`;
}
