// Catalogue SKU generator — ported 1:1 from t-card.html's generateSku.
// Builds a shop-floor SKU from the product name: extracts height (mm),
// rotation (°), CW/CCW, lane count and MK revision, abbreviates the rest.

const ABBR: Record<string, string> = {
  double: 'D', single: '', racing: 'RS', wavy: 'WV', bumpy: 'BMP',
  straight: 'STR', spiral: 'SPR', tube: 'TB', astra: 'A', toddler: 'TD',
  lane: '', slide: '', crawl: 'CRL', assembly: '', flume: 'FL',
  family: 'FAM', run: 'RN', b2: 'B2', b3: 'B3', b4: 'B4', speed: 'SPD',
};

export function generateSku(
  productCode: string | null | undefined,
  name: string | null | undefined,
  /** Existing templates, for the uniqueness suffix check. */
  existing: { code: string | null; productCode: string }[] = [],
): string {
  if (!name) return productCode ?? '';
  const n = name.trim();
  const height = n.match(/(\d{3,4})\s*mm/i)?.[1] ?? null;
  const rotation = n.match(/(\d{2,4})\s*°/)?.[1] ?? null;
  const cw = /\bcw\b|clockwise/i.test(n) ? 'CW' : /\bccw\b|anti.?clock/i.test(n) ? 'CCW' : null;
  const lanes =
    n.match(/(\d+)\s*-?\s*lane/i)?.[1] ??
    (/\btwin\b/i.test(n) ? '2' : /\btriple\b/i.test(n) ? '3' : /\bquad\b/i.test(n) ? '4' : null);
  const mkMatch = n.match(/\bMK\s*(\d+)/i);
  const mk = mkMatch ? `MK${mkMatch[1]}` : null;

  const clean = n
    .replace(/(\d{3,4})\s*mm/gi, '').replace(/(\d+)\s*°/g, '')
    .replace(/\bcw\b|\bccw\b|clockwise|anti.?clockwise/gi, '')
    .replace(/(\d+)\s*-?\s*lane/gi, '')
    .replace(/\btwin\b|\btriple\b|\bquad\b/gi, '')
    .replace(/\bMK\s*\d+/gi, '')
    .replace(/[°()[\]-]+/g, ' ').replace(/\s+/g, ' ').trim();

  let typeCode = lanes ? `${lanes}L` : '';
  for (const w of clean.split(/\s+/).filter((x) => x.length > 1 && !/^\d+$/.test(x))) {
    const lo = w.toLowerCase();
    typeCode += lo in ABBR ? ABBR[lo] : w.slice(0, 3).toUpperCase();
  }
  typeCode = typeCode.replace(/[-\s]+$/, '').slice(0, 8);

  const parts = [typeCode || 'SLD'];
  if (height) parts.push(height);
  if (rotation) parts.push(rotation + (cw ?? ''));
  if (mk && !height && !rotation) parts.push(mk);
  let sku = parts.filter(Boolean).join('-');
  if (existing.some((t) => t.code === sku && t.productCode !== productCode)) {
    sku = `${sku}-${productCode ?? ''}`;
  }
  return sku;
}
