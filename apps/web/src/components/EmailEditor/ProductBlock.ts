import {mergeAttributes, Node} from '@tiptap/core';

/**
 * A grid of catalog products. The email stores plain Liquid over `catalog["<id>"]`, so the
 * server fills in current price and stock at send time and drops unavailable products.
 * The block is read back from that same markup: the IDs, the column count and the button
 * label are all recoverable from the table, so no extra attributes are needed.
 */
export const PRODUCT_BLOCK_CLASS = 'plunk-products';
const BUTTON_CLASS = 'plunk-products-button';

export const MAX_BLOCK_PRODUCTS = 6;

export interface ProductBlockOptions {
  ids: string[];
  columns: number;
  buttonText: string;
}

/** IDs that can be written into a `catalog["..."]` lookup without breaking the string. */
export function isUsableProductId(id: string): boolean {
  return id.length > 0 && id.length <= 191 && !/["\\\r\n{}%]/.test(id);
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

function productCell(id: string, width: number, buttonText: string): string {
  return (
    `<td width="${width}%" valign="top" style="padding: 8px; text-align: center; border: 0; vertical-align: top;">` +
    `{% assign p = catalog["${id}"] %}{% if p.available %}` +
    '<a href="{{ p.url }}"><img src="{{ p.imageUrl }}" alt="{{ p.name | escape }}" width="100%" style="max-width: 100%; height: auto; display: block; border: 0;"></a>' +
    '<p style="margin: 8px 0 4px 0; font-weight: 600;">{{ p.name | escape }}</p>' +
    '<p style="margin: 0 0 8px 0;">{% if p.onSale %}<s style="color: #9CA3AF;">{{ p.priceFormatted }}</s> ' +
    '<strong style="color: #DC2626;">{{ p.finalPriceFormatted }}</strong> <span style="color: #DC2626;">-{{ p.discountPercent }}%</span>' +
    '{% else %}<strong>{{ p.finalPriceFormatted }}</strong>{% endif %}</p>' +
    `<a href="{{ p.url }}" class="${BUTTON_CLASS}" style="display: inline-block; padding: 10px 20px; background-color: #111827; color: #FFFFFF; text-decoration: none; border-radius: 6px; font-weight: 600;">${escapeText(buttonText)}</a>` +
    '{% endif %}</td>'
  );
}

export function buildProductBlockHtml({ids, columns, buttonText}: ProductBlockOptions): string {
  const usable = ids.filter(isUsableProductId).slice(0, MAX_BLOCK_PRODUCTS);
  const perRow = Math.min(Math.max(Math.round(columns) || 1, 1), 3);
  const width = Math.floor(100 / perRow);
  const rows: string[] = [];
  for (let i = 0; i < usable.length; i += perRow) {
    rows.push(`<tr>${usable.slice(i, i + perRow).map(id => productCell(id, width, buttonText)).join('')}</tr>`);
  }
  return (
    `<table class="${PRODUCT_BLOCK_CLASS}" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="border-collapse: collapse; width: 100%; margin: 0 0 16px 0;"><tbody>${rows.join('')}</tbody></table>`
  );
}

export function parseProductBlock(element: HTMLElement): ProductBlockOptions {
  const ids = Array.from(element.innerHTML.matchAll(/catalog\["([^"]+)"\]/g), match => match[1] as string);
  const firstRow = element.querySelector('tr');
  const button = element.querySelector(`a.${BUTTON_CLASS}`);
  return {
    ids,
    columns: firstRow ? firstRow.querySelectorAll('td').length || 1 : 1,
    buttonText: button?.textContent?.trim() || 'Shop now',
  };
}

/** Removes product blocks so the rest of the email can be checked for markup the editor cannot keep. */
export function stripProductBlocks(html: string): string {
  return html.replace(new RegExp(`<table class="${PRODUCT_BLOCK_CLASS}"[\\s\\S]*?</table>`, 'gi'), '');
}

/** Every product ID an email looks up statically, for previews. */
export function referencedProductIds(html: string): string[] {
  return Array.from(new Set(Array.from(html.matchAll(/catalog\[\s*["']([^"'\\\r\n]{1,191})["']\s*\]/g), m => m[1] as string)));
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    productBlock: {
      insertProductBlock: (options: ProductBlockOptions) => ReturnType;
    };
  }
}

export const ProductBlock = Node.create({
  name: 'productBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      ids: {default: [], rendered: false},
      columns: {default: 2, rendered: false},
      buttonText: {default: 'Shop now', rendered: false},
    };
  },

  parseHTML() {
    return [
      {
        tag: `table.${PRODUCT_BLOCK_CLASS}`,
        priority: 100,
        getAttrs: element => parseProductBlock(element as HTMLElement),
      },
    ];
  },

  renderHTML({node, HTMLAttributes}) {
    const template = document.createElement('template');
    template.innerHTML = buildProductBlockHtml(node.attrs as ProductBlockOptions);
    const table = template.content.firstElementChild as HTMLElement;
    for (const [key, value] of Object.entries(mergeAttributes(HTMLAttributes))) {
      if (value != null) table.setAttribute(key, String(value));
    }
    return {dom: table};
  },

  addNodeView() {
    return ({node}) => {
      const {ids, columns} = node.attrs as ProductBlockOptions;
      const dom = document.createElement('div');
      dom.setAttribute('contenteditable', 'false');
      dom.style.cssText =
        'border: 1px dashed #D4D4D4; border-radius: 8px; padding: 12px 16px; margin: 0 0 16px 0; background: #FAFAFA; font-size: 13px; color: #404040;';
      const title = document.createElement('strong');
      title.textContent = `Products (${ids.length}, ${columns} per row)`;
      const list = document.createElement('div');
      list.style.cssText = 'margin-top: 4px; color: #737373; font-family: monospace;';
      list.textContent = ids.join(', ');
      const hint = document.createElement('div');
      hint.style.cssText = 'margin-top: 4px; color: #A3A3A3;';
      hint.textContent = 'Current price and stock are filled in when the email is sent. Pick a contact to preview.';
      dom.append(title, list, hint);
      return {dom};
    };
  },

  addCommands() {
    return {
      insertProductBlock:
        options =>
        ({commands}) =>
          commands.insertContent({type: this.name, attrs: options}),
    };
  },
});
