import type { Catalogue, CataloguePart } from './types';

/**
 * Catalogue roll-ups. A product is built from library parts; each link
 * carries a mould fraction (1 = whole mould, 0.5 = half) that scales that
 * piece's hours and price. Product totals are always the sum of the children
 * (client email 1 Oct 2026: "built up on all the child pieces").
 */

export const r2 = (n: number) => Math.round(n * 100) / 100;

/** Mould fractions a part can be linked at. */
export const PART_QTYS: readonly (1 | 0.5)[] = [1, 0.5];

export const qtyLabel = (q: number | undefined) => (q === 0.5 ? '½' : '1');

/** Hours and price one linked piece contributes (library value × fraction). */
export function partContribution(p: Pick<CataloguePart, 'hrs' | 'lamHrs' | 'finHrs' | 'price'> & { qty?: number }) {
  const q = p.qty ?? 1;
  const lam = r2((p.lamHrs ?? p.hrs ?? 0) * q);
  const fin = r2((p.finHrs ?? 0) * q);
  return { lam, fin, hrs: r2(lam + fin), price: r2((p.price || 0) * q) };
}

/** Sum of every linked piece on a product. */
export function productTotals(parts: readonly (Pick<CataloguePart, 'hrs' | 'lamHrs' | 'finHrs' | 'price'> & { qty?: number })[]) {
  return parts.reduce(
    (t, p) => {
      const c = partContribution(p);
      return { lam: r2(t.lam + c.lam), fin: r2(t.fin + c.fin), hrs: r2(t.hrs + c.hrs), price: r2(t.price + c.price) };
    },
    { lam: 0, fin: 0, hrs: 0, price: 0 },
  );
}

/** One part at a whole mould is a single slide; anything else is an assembly. */
export const isSingle = (c: Pick<Catalogue, 'parts'>) => c.parts.length <= 1;

/** "12349 · 1100R 90 DEGREE TUBE SECTION" — how a library part is named in pickers. */
export const partLabel = (p: Pick<CataloguePart, 'drawing' | 'detail'>) =>
  p.drawing ? `${p.drawing} · ${p.detail}` : p.detail;

/**
 * The product a ticket was made from — by product name, else by the part's
 * code or detail (a half-mould piece's ticket is labelled "(½ MOULD)").
 */
export function findTemplateForTicket(
  catalogue: readonly Catalogue[],
  t: { detail: string; drawing?: string | null },
): Catalogue | undefined {
  const detail = t.detail.replace(/\s*\(½ MOULD\)$/, '');
  return (
    catalogue.find((c) => c.name === t.detail) ??
    catalogue.find((c) => c.parts.some((p) => p.detail === detail)) ??
    (t.drawing ? catalogue.find((c) => c.parts.some((p) => p.drawing === t.drawing)) : undefined)
  );
}

/** Case-insensitive (code, detail) identity — the library's uniqueness rule. */
export const partKey = (code: string | null | undefined, detail: string) =>
  `${(code ?? '').trim().toUpperCase()}|${detail.trim().replace(/\s+/g, ' ').toUpperCase()}`;
