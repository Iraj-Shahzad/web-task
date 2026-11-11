import sanitizeHtml from 'sanitize-html';
import { normalizeAddress } from './address';

/**
 * CONTAINMENT, layer 1 of 3 (server, at publish time).
 *
 * Authors write HTML; we store an allowlist-filtered version and only ever
 * render that. Layers 2 and 3 live in the frontend (sandboxed iframe + CSP),
 * so a bug here is not by itself an escape.
 *
 * What authors CAN write: headings, paragraphs, lists, tables, quotes, code,
 * inline emphasis, a restricted `style` attribute (colour, type, spacing),
 * and links to addresses.
 * What authors CANNOT write (the cost): scripts, event handlers, forms,
 * images/media, iframes/objects, <style>/<link>/<meta>/<base>, external URLs,
 * positioning/animation CSS, custom classes or ids.
 */

const TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'div', 'span',
  'section', 'article', 'header', 'footer', 'nav', 'main', 'aside',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'pre', 'code',
  'em', 'strong', 'b', 'i', 'u', 's', 'small', 'sub', 'sup', 'mark',
  'abbr', 'cite', 'q', 'time', 'details', 'summary', 'figure', 'figcaption',
  'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'a',
];

// Values are limited to plain keywords, numbers, units, hex and rgb()/hsl().
// No url(), no var(), no expression(), no quotes — so a style value can never
// load anything or break out of its attribute.
const SAFE_VALUE = /^(?:[#a-z0-9\s.,%-]+|(?:rgb|rgba|hsl|hsla)\([0-9\s.,%]+\))$/i;
const STYLE_PROPS = [
  'color', 'background-color', 'font-size', 'font-weight', 'font-style',
  'font-family', 'text-align', 'text-decoration', 'line-height', 'letter-spacing',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'border', 'border-left', 'border-bottom', 'border-top', 'border-right',
  'border-radius', 'max-width',
];

export interface SanitizeResult {
  /** Safe HTML. Links are `<a data-addr="x.zz">` — never an href. */
  body: string;
  /** Plain text of the body, for search. Decoded, never HTML. */
  text: string;
  /** Distinct canonical addresses this page links to, in document order. */
  links: string[];
}

export function sanitizePage(source: string): SanitizeResult {
  const links: string[] = [];
  const seen = new Set<string>();

  const body = sanitizeHtml(source, {
    allowedTags: TAGS,
    allowedAttributes: {
      '*': ['style', 'title', 'lang'],
      a: ['data-addr', 'tabindex', 'role'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
      time: ['datetime'],
    },
    allowedStyles: {
      '*': Object.fromEntries(STYLE_PROPS.map((p) => [p, [SAFE_VALUE]])),
    },
    // Nothing is a URL: no scheme can be allowed because no attribute carries one.
    allowedSchemes: [],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard', // script/style/textarea/option content is dropped entirely
    transformTags: {
      // The transform builds the attribute set from scratch, so whatever the
      // author put on the <a> (href, data-addr, onclick, target, ...) is gone.
      a: (_tag, attribs): sanitizeHtml.Tag => {
        const addr = normalizeAddress(attribs.href);
        if (!addr) {
          // Not an address (http://, javascript:, #frag, garbage): keep the words, lose the link.
          return { tagName: 'span', attribs: {} as sanitizeHtml.Attributes };
        }
        if (!seen.has(addr)) {
          seen.add(addr);
          links.push(addr);
        }
        return { tagName: 'a', attribs: { 'data-addr': addr, tabindex: '0', role: 'link' } };
      },
    },
  });

  return { body, text: toText(body), links };
}

/** Extract decoded visible text from already-sanitised HTML. */
function toText(safeHtml: string): string {
  const parts: string[] = [];
  sanitizeHtml(safeHtml, {
    allowedTags: [],
    allowedAttributes: {},
    textFilter: (t) => {
      parts.push(t);
      return t;
    },
  });
  return unescapeHtml(parts.join(' ')).replace(/\s+/g, ' ').trim();
}

/** sanitize-html hands textFilter escaped text; search wants the words as written. &amp; goes last. */
function unescapeHtml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}