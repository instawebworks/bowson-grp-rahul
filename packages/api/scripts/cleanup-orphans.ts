/** Soft-delete tickets whose order has been soft-deleted (orphans). */
import { db, unwrap } from '../src/supabase.js';

const deletedOrders = unwrap(
  await db.from('orders').select('id').not('deletedAt', 'is', null),
) as { id: number }[];
const ids = deletedOrders.map((o) => o.id);

if (!ids.length) {
  console.log('No soft-deleted orders — nothing to clean.');
} else {
  const cleaned = unwrap(
    await db.from('tickets').update({ deletedAt: new Date().toISOString() })
      .in('orderId', ids).is('deletedAt', null).select('id'),
  ) as { id: number }[];
  console.log(`Soft-deleted ${cleaned.length} orphan ticket(s) from ${ids.length} deleted order(s).`);
}
process.exit(0);
