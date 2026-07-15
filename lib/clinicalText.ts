/**
 * Decode HTML entities that sneak into clinical text.
 *
 * Sources: LLM output ("&#39;" instead of "'"), and prior notes pasted from
 * EHR editors that entity-encode non-ASCII on copy ("ng/mL&#178;" for
 * "ng/mL²"). Decoding at every text entry point keeps entities out of the
 * model prompt, the rendered note, and the clipboard.
 *
 * Single-pass: every entity is matched once against the original string and
 * its replacement is NOT re-scanned. This matters for two reasons:
 *  - Correctness: a double-encoded source like "&amp;lt;3 cm" (whose real
 *    content is the literal "&lt;3 cm") must decode to "&lt;3 cm", not "<3 cm".
 *    A sequential replace of "&amp;"→"&" followed by "&lt;"→"<" would
 *    double-decode and silently alter documented clinical text. One pass over
 *    the original leaves the "&lt;" that "&amp;lt;" produced untouched.
 *  - Safety: numeric entities are range-checked, so malformed input like
 *    "&#1114112;" (above U+10FFFF) can't throw a RangeError out of
 *    String.fromCodePoint and crash the render/paste path.
 */
const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '-', ndash: '-', hellip: '...', bull: '-', middot: '-',
  lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"',
  deg: '°', micro: 'µ', plusmn: '±', times: 'x', ge: '>=', le: '<=',
  sup2: '²', sup3: '³',
};

// One regex, one pass. Alternation order: hex numeric, decimal numeric, named.
const ENTITY_RE = /&#x([0-9a-fA-F]+);?|&#(\d+);?|&([a-zA-Z][a-zA-Z0-9]*);/g;

function codePointToString(code: number, original: string): string {
  // Valid Unicode scalar range, excluding the surrogate block. Anything else
  // is left as the original entity text rather than decoded or thrown on.
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return original;
  if (code >= 0xd800 && code <= 0xdfff) return original;
  try {
    return String.fromCodePoint(code);
  } catch {
    return original;
  }
}

export function decodeHtmlEntities(input: string): string {
  if (!input) return '';
  return input.replace(ENTITY_RE, (m, hex, dec, name) => {
    if (hex !== undefined) return codePointToString(parseInt(hex, 16), m);
    if (dec !== undefined) return codePointToString(parseInt(dec, 10), m);
    // Named: only decode known entities; leave unknown "&word;" verbatim.
    const v = NAMED[name];
    return v !== undefined ? v : m;
  });
}
