/**
 * Catalog types
 */

/** A catalog product as returned by the catalog API. `id` is the shop's own product ID. */
export interface CatalogProduct {
  id: string;
  parentId: string | null;
  sku: string | null;
  name: string;
  description: string | null;
  url: string | null;
  imageUrl: string | null;
  images: string[];
  price: number | null;
  salePrice: number | null;
  currency: string | null;
  available: boolean;
  quantity: number | null;
  brand: string | null;
  categories: string[];
  translations: Record<string, CatalogProductTranslation> | null;
  data: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogProductTranslation {
  name?: string;
  description?: string;
  url?: string;
  imageUrl?: string;
  price?: number;
  salePrice?: number | null;
  currency?: string;
}

/**
 * A product as templates see it under `catalog["<id>"]`: localized for the recipient,
 * with the effective price and preformatted money strings.
 */
export interface CatalogRenderProduct {
  id: string;
  parentId: string | null;
  sku: string | null;
  name: string;
  description: string | null;
  url: string | null;
  imageUrl: string | null;
  images: string[];
  price: number | null;
  salePrice: number | null;
  /** salePrice when the product is on sale, otherwise price */
  finalPrice: number | null;
  onSale: boolean;
  discountPercent: number | null;
  currency: string | null;
  priceFormatted: string | null;
  salePriceFormatted: string | null;
  finalPriceFormatted: string | null;
  available: boolean;
  quantity: number | null;
  brand: string | null;
  categories: string[];
  data: Record<string, unknown> | null;
}
