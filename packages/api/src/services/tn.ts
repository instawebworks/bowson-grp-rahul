import { db, unwrap } from '../supabase.js';

/**
 * Ticket-number issuing. Tickets on a Pending order deliberately have tn=null
 * (numbers are only issued when the order is released to production — ported
 * from the prototype's nextTn / release flow).
 */

/** Next ticket number = max(tn) + 1 (prototype seeds from 93000). */
export async function nextTn(): Promise<number> {
  const row = unwrap(
    await db.from('tickets').select('tn').not('tn', 'is', null)
      .order('tn', { ascending: false }).limit(1).maybeSingle(),
  ) as { tn: number } | null;
  return (row?.tn ?? 0) + 1;
}

/**
 * Issue ticket numbers to every un-numbered ticket on an order (release to
 * production / status leaves Pending). Returns how many numbers were issued.
 */
export async function backfillOrderTns(orderId: number): Promise<number> {
  const unissued = unwrap(
    await db.from('tickets').select('id').eq('orderId', orderId)
      .is('tn', null).is('deletedAt', null).order('id', { ascending: true }),
  ) as { id: number }[];
  if (!unissued.length) return 0;
  let tn = await nextTn();
  for (const t of unissued) {
    unwrap(await db.from('tickets').update({ tn: tn++ }).eq('id', t.id).select('id'));
  }
  return unissued.length;
}
