import type {CatalogProduct} from '@plunk/types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@plunk/ui';
import {X} from 'lucide-react';
import {useEffect, useState} from 'react';

import {network} from '../../lib/network';

import {isUsableProductId, MAX_BLOCK_PRODUCTS, type ProductBlockOptions} from './ProductBlock';

interface ProductBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (options: ProductBlockOptions) => void;
}

const SEARCH_DEBOUNCE_MS = 250;

export function ProductBlockDialog({open, onOpenChange, onInsert}: ProductBlockDialogProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CatalogProduct[]>([]);
  const [columns, setColumns] = useState('2');
  const [buttonText, setButtonText] = useState('Shop now');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({limit: '10'});
        if (search.trim()) query.set('search', search.trim());
        const res = await network.fetch<{products: CatalogProduct[]}>('GET', `/catalog/products?${query}`);
        if (!cancelled) setResults(res.products);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load products');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, open]);

  const reset = () => {
    setSearch('');
    setSelected([]);
    setColumns('2');
    setButtonText('Shop now');
  };

  const toggle = (product: CatalogProduct) => {
    setSelected(current =>
      current.some(p => p.id === product.id)
        ? current.filter(p => p.id !== product.id)
        : current.length < MAX_BLOCK_PRODUCTS
          ? [...current, product]
          : current,
    );
  };

  const insert = () => {
    onInsert({ids: selected.map(p => p.id), columns: Number(columns), buttonText: buttonText.trim() || 'Shop now'});
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Insert products</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product-search">Search the catalog</Label>
            <Input
              id="product-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Name, product ID or SKU"
              autoFocus
            />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-md border border-neutral-200 divide-y divide-neutral-100">
            {loading && results.length === 0 && <p className="p-3 text-sm text-neutral-500">Loading…</p>}
            {error && <p className="p-3 text-sm text-red-600">{error}</p>}
            {!loading && !error && results.length === 0 && (
              <p className="p-3 text-sm text-neutral-500">
                No products found. Products are added to the catalog through the API.
              </p>
            )}
            {results.map(product => {
              const isSelected = selected.some(p => p.id === product.id);
              const usable = isUsableProductId(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={!usable || (!isSelected && selected.length >= MAX_BLOCK_PRODUCTS)}
                  onClick={() => toggle(product)}
                  className={`flex w-full items-center gap-3 p-2 text-left text-sm transition-colors hover:bg-neutral-50 disabled:opacity-50 ${isSelected ? 'bg-neutral-100' : ''}`}
                >
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.imageUrl} alt="" className="h-10 w-10 flex-none rounded object-cover" />
                  ) : (
                    <div className="h-10 w-10 flex-none rounded bg-neutral-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-neutral-900">{product.name}</p>
                    <p className="truncate text-xs text-neutral-500">
                      {product.id}
                      {product.sku ? ` · ${product.sku}` : ''}
                      {product.price != null ? ` · ${product.salePrice ?? product.price} ${product.currency ?? ''}` : ''}
                      {product.available ? '' : ' · out of stock'}
                    </p>
                  </div>
                  {isSelected && <span className="text-xs font-medium text-neutral-900">Selected</span>}
                </button>
              );
            })}
          </div>

          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.map(product => (
                <span
                  key={product.id}
                  className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-800"
                >
                  {product.name}
                  <button
                    type="button"
                    onClick={() => toggle(product)}
                    aria-label={`Remove ${product.name}`}
                    className="text-neutral-500 hover:text-neutral-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Products per row</Label>
              <Select value={columns} onValueChange={setColumns}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-button-text">Button text</Label>
              <Input
                id="product-button-text"
                value={buttonText}
                maxLength={40}
                onChange={e => setButtonText(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-neutral-500">
            Up to {MAX_BLOCK_PRODUCTS} products. Price, discount and stock are read from the catalog when the email is
            sent; sold-out or removed products are left out automatically.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={insert} disabled={selected.length === 0}>
              Insert {selected.length > 0 ? `${selected.length} ` : ''}product{selected.length === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
