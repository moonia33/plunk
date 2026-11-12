import type {CatalogProduct} from '@plunk/types';
import {Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, IconSpinner} from '@plunk/ui';
import dayjs from 'dayjs';
import {ArrowLeft, ExternalLink, Package} from 'lucide-react';
import {NextSeo} from 'next-seo';
import Link from 'next/link';
import {useRouter} from 'next/router';
import useSWR from 'swr';

import {DashboardLayout} from '../../components/DashboardLayout';
import {catalogProductHref, effectiveSalePrice, formatMoney, type CatalogListResponse} from '../../lib/catalog';

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div className="grid grid-cols-3 gap-4 py-2.5 text-sm">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="col-span-2 min-w-0 break-words text-neutral-900">{children ?? '—'}</dd>
    </div>
  );
}

function SafeLink({href}: {href: string | null | undefined}) {
  if (!href || !/^https?:\/\//i.test(href)) return <>—</>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-neutral-900 underline-offset-2 hover:underline"
    >
      <span className="truncate">{href}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

export default function CatalogProductPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : undefined;
  const {data: product, error, isLoading} = useSWR<CatalogProduct>(
    id ? `/catalog/products/${encodeURIComponent(id)}` : null,
    {revalidateOnFocus: false},
  );
  const {data: variants} = useSWR<CatalogListResponse>(
    product && !product.parentId ? `/catalog/products?limit=100&parentId=${encodeURIComponent(product.id)}` : null,
    {revalidateOnFocus: false},
  );

  const sale = product ? effectiveSalePrice(product) : null;
  const images = product ? Array.from(new Set([product.imageUrl, ...product.images].filter(Boolean))) as string[] : [];
  const variantRows = variants?.products ?? [];

  return (
    <>
      <NextSeo title={product?.name ?? 'Product'} />
      <DashboardLayout>
        <div className="space-y-6">
          <Button asChild variant="ghost" size="sm">
            <Link href="/catalog">
              <ArrowLeft className="h-4 w-4" />
              Catalog
            </Link>
          </Button>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <IconSpinner />
            </div>
          ) : error || !product ? (
            <Card>
              <CardContent>
                <EmptyState icon={Package} title="Product not found" description="It may have been removed by the shop." />
              </CardContent>
            </Card>
          ) : (
            <>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">{product.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                  {product.available ? <Badge variant="success">In stock</Badge> : <Badge variant="neutral">Out of stock</Badge>}
                  <span className="font-mono">{product.id}</span>
                  {product.parentId && (
                    <Link href={catalogProductHref(product.parentId)} className="underline-offset-2 hover:underline">
                      variant of {product.parentId}
                    </Link>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-1">
                  <CardContent className="pt-6">
                    {images.length > 0 ? (
                      <div className="space-y-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={images[0]} alt={product.name} className="w-full rounded-md object-contain bg-white" />
                        {images.length > 1 && (
                          <div className="grid grid-cols-4 gap-2">
                            {images.slice(1).map(src => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={src}
                                src={src}
                                alt=""
                                loading="lazy"
                                className="aspect-square w-full rounded border border-neutral-100 object-contain bg-white"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="py-12 text-center text-sm text-neutral-400">No image</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="divide-y divide-neutral-100">
                      <Field label="Price">
                        {sale != null ? (
                          <span className="tabular-nums">
                            <span className="font-medium text-red-600">{formatMoney(sale, product.currency)}</span>{' '}
                            <span className="text-neutral-400 line-through">{formatMoney(product.price, product.currency)}</span>{' '}
                            <span className="text-red-600">
                              -{Math.round((1 - sale / (product.price as number)) * 100)}%
                            </span>
                          </span>
                        ) : (
                          <span className="tabular-nums">{formatMoney(product.price, product.currency)}</span>
                        )}
                      </Field>
                      <Field label="Quantity">{product.quantity ?? '—'}</Field>
                      <Field label="SKU">{product.sku}</Field>
                      <Field label="Brand">{product.brand}</Field>
                      <Field label="Categories">{product.categories.length ? product.categories.join(', ') : '—'}</Field>
                      <Field label="URL">
                        <SafeLink href={product.url} />
                      </Field>
                      <Field label="Description">{product.description}</Field>
                      <Field label="Updated">{dayjs(product.updatedAt).format('YYYY-MM-DD HH:mm')}</Field>
                      <Field label="Created">{dayjs(product.createdAt).format('YYYY-MM-DD HH:mm')}</Field>
                      <Field label="In templates">
                        <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{`{{ catalog["${product.id}"].name }}`}</code>
                      </Field>
                    </dl>
                  </CardContent>
                </Card>
              </div>

              {product.translations && Object.keys(product.translations).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Translations</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                            <th className="px-4 py-3 w-20">Locale</th>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">URL</th>
                            <th className="px-4 py-3 text-right">Price</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {Object.entries(product.translations).map(([locale, t]) => (
                            <tr key={locale}>
                              <td className="px-4 py-2 font-mono text-xs">{locale}</td>
                              <td className="px-4 py-2">{t.name ?? '—'}</td>
                              <td className="px-4 py-2 max-w-[20rem]">
                                <SafeLink href={t.url} />
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums">
                                {t.price != null ? formatMoney(t.price, t.currency ?? product.currency) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {variantRows.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Variants ({variantRows.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ul className="divide-y divide-neutral-100">
                      {variantRows.map(v => (
                        <li key={v.id} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                          <Link href={catalogProductHref(v.id)} className="min-w-0 truncate hover:underline">
                            {v.name} <span className="font-mono text-xs text-neutral-500">{v.id}</span>
                          </Link>
                          <span className="flex shrink-0 items-center gap-3">
                            {v.available ? (
                              <Badge variant="success">{v.quantity ?? 'In stock'}</Badge>
                            ) : (
                              <Badge variant="neutral">Out of stock</Badge>
                            )}
                            <span className="tabular-nums">{formatMoney(effectiveSalePrice(v) ?? v.price, v.currency)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}
