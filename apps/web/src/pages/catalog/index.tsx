import type {CatalogProduct} from '@plunk/types';
import {Badge, Button, Card, CardContent, EmptyState, IconSpinner} from '@plunk/ui';
import {ImageOff, Package} from 'lucide-react';
import {NextSeo} from 'next-seo';
import Link from 'next/link';
import {useEffect, useState} from 'react';
import useSWR from 'swr';

import {DashboardLayout} from '../../components/DashboardLayout';
import {NoResultsState, SearchInput} from '../../components/data-table';
import {catalogProductHref, effectiveSalePrice, formatMoney, type CatalogListResponse} from '../../lib/catalog';
import {formatRelativeTime} from '../../lib/dateUtils';
import {network} from '../../lib/network';

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

function Price({product}: {product: CatalogProduct}) {
  const sale = effectiveSalePrice(product);
  if (sale == null) {
    return <span className="tabular-nums text-neutral-900">{formatMoney(product.price, product.currency)}</span>;
  }
  return (
    <span className="flex flex-col items-end tabular-nums">
      <span className="font-medium text-red-600">{formatMoney(sale, product.currency)}</span>
      <span className="text-xs text-neutral-400 line-through">{formatMoney(product.price, product.currency)}</span>
    </span>
  );
}

function Stock({product}: {product: CatalogProduct}) {
  return product.available ? (
    <Badge variant="success">In stock{product.quantity != null ? ` · ${product.quantity}` : ''}</Badge>
  ) : (
    <Badge variant="neutral">Out of stock</Badge>
  );
}

function Thumbnail({src}: {src: string | null}) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className="h-12 w-12 rounded-md border border-neutral-100 object-contain bg-white" />
  ) : (
    <div className="flex h-12 w-12 items-center justify-center rounded-md border border-neutral-100 bg-neutral-50">
      <ImageOff className="h-4 w-4 text-neutral-300" />
    </div>
  );
}

export default function CatalogPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [extra, setExtra] = useState<CatalogProduct[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = new URLSearchParams({limit: String(PAGE_SIZE)});
  if (search) query.set('search', search);
  const {data, isLoading} = useSWR<CatalogListResponse>(`/catalog/products?${query}`, {revalidateOnFocus: false});

  useEffect(() => {
    setExtra([]);
    setCursor(data?.cursor);
    setHasMore(Boolean(data?.hasMore));
  }, [data]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const next = new URLSearchParams(query);
      next.set('cursor', cursor);
      const res = await network.fetch<CatalogListResponse>('GET', `/catalog/products?${next}`);
      setExtra(current => [...current, ...res.products]);
      setCursor(res.cursor);
      setHasMore(res.hasMore);
    } finally {
      setLoadingMore(false);
    }
  };

  const products = [...(data?.products ?? []), ...extra];
  const total = data?.total;

  return (
    <>
      <NextSeo title="Catalog" />
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">Catalog</h1>
            <p className="text-neutral-500 mt-2 text-sm sm:text-base">
              Products your shop keeps in sync through the catalog API. Emails read current price and stock from here.
              {total != null && !search ? ` ${total.toLocaleString()} products` : ''}
            </p>
          </div>

          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            onClear={() => setSearchInput('')}
            placeholder="Search by name, product ID or SKU…"
          />

          {isLoading ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-center py-12">
                  <IconSpinner />
                </div>
              </CardContent>
            </Card>
          ) : products.length === 0 ? (
            <Card>
              <CardContent>
                {search ? (
                  <NoResultsState icon={Package} itemNoun="products" onClear={() => setSearchInput('')} />
                ) : (
                  <EmptyState
                    icon={Package}
                    title="No products yet"
                    description="Push products with PUT /catalog/products using a secret key, e.g. from the shop module."
                  />
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                        <th className="px-4 py-3 w-16">
                          <span className="sr-only">Image</span>
                        </th>
                        <th className="px-4 py-3">Product</th>
                        <th className="px-4 py-3 hidden md:table-cell">ID</th>
                        <th className="px-4 py-3">Stock</th>
                        <th className="px-4 py-3 text-right">Price</th>
                        <th className="px-4 py-3 hidden lg:table-cell">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {products.map(product => (
                        <tr key={product.id} className="hover:bg-neutral-50/60">
                          <td className="px-4 py-2">
                            <Thumbnail src={product.imageUrl} />
                          </td>
                          <td className="px-4 py-2 max-w-[22rem]">
                            <Link
                              href={catalogProductHref(product.id)}
                              className="block truncate font-medium text-neutral-900 hover:text-neutral-700 focus-visible:outline-none focus-visible:underline"
                            >
                              {product.name}
                            </Link>
                            <p className="truncate text-xs text-neutral-500">
                              {[product.brand, product.sku, product.parentId ? `variant of ${product.parentId}` : null]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </td>
                          <td className="px-4 py-2 hidden md:table-cell font-mono text-xs text-neutral-600">
                            {product.id}
                          </td>
                          <td className="px-4 py-2">
                            <Stock product={product} />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <Price product={product} />
                          </td>
                          <td className="px-4 py-2 hidden lg:table-cell whitespace-nowrap text-xs text-neutral-500">
                            {formatRelativeTime(product.updatedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {hasMore && (
                  <div className="flex justify-center border-t border-neutral-100 p-3">
                    <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                      {loadingMore ? 'Loading…' : 'Load more'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}
