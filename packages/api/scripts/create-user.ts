/**
 * Create (or reset) an app user via the Supabase service-role key.
 * Usage:  pnpm --filter @bowson/api create-user
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_ROLE override defaults.
 */
import { db } from '../src/supabase.js';

const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@bowson.local';
const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
const role = process.env.SEED_ADMIN_ROLE ?? 'admin';

async function main() {
  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
  });

  if (!created.error) {
    console.log(`✅ Created ${email} (role=${role}) — id ${created.data.user?.id}`);
    return;
  }

  // Likely already exists — find and reset password + role.
  const list = await db.auth.admin.listUsers();
  if (list.error) throw list.error;
  const existing = list.data.users.find((u) => u.email === email);
  if (!existing) {
    console.error('❌ Could not create user:', created.error.message);
    process.exit(1);
  }
  const updated = await db.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    app_metadata: { ...existing.app_metadata, role },
  });
  if (updated.error) throw updated.error;
  console.log(`✅ Reset existing ${email} (role=${role}) — id ${existing.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌', e.message);
    process.exit(1);
  });
