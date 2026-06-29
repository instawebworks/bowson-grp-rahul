// UI audit: screenshots every screen + exercises the order/customer modals,
// capturing console errors and failed network requests for each.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.AUDIT_URL ?? 'http://localhost:5173';
const outDir = fileURLToPath(new URL('../screenshots/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const routes = [
  ['dashboard', '/'],
  ['board', '/board'],
  ['orders', '/orders'],
  ['tickets', '/tickets'],
  ['in-production', '/in-production'],
  ['ready', '/ready'],
  ['despatched', '/despatched'],
  ['schedule', '/schedule'],
  ['moulds', '/moulds'],
  ['catalogue', '/catalogue'],
  ['customers', '/customers'],
  ['operatives', '/operatives'],
  ['audit', '/audit'],
  ['search', '/search?q=DEMO'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const issues = [];
function watch(label) {
  page.removeAllListeners('console');
  page.removeAllListeners('pageerror');
  page.removeAllListeners('requestfailed');
  page.on('console', (m) => {
    if (m.type() === 'error') issues.push(`[${label}] console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => issues.push(`[${label}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) =>
    issues.push(`[${label}] requestfailed: ${r.method()} ${r.url()} — ${r.failure()?.errorText}`),
  );
}

for (const [name, path] of routes) {
  watch(name);
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}${name}.png`, fullPage: true });
  console.log(`captured ${name}`);
}

// Interaction: New Order modal
watch('orders-modal');
await page.goto(`${BASE}/orders`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '+ New Order' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}modal-new-order.png` });
// Nested + New customer
await page.getByRole('button', { name: '+ New customer' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}modal-new-customer-nested.png` });

// Interaction: Customers add + edit
watch('customers-modal');
await page.goto(`${BASE}/customers`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '+ New Customer' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}modal-customer-create.png` });
await page.keyboard.press('Escape').catch(() => {});

// Interaction: Order detail + Add ticket modal
watch('order-detail');
await page.goto(`${BASE}/orders`, { waitUntil: 'networkidle' });
await page.locator('tbody tr').first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}order-detail.png`, fullPage: true });
await page.getByRole('button', { name: 'Edit order' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}modal-edit-order.png` });
await page.getByRole('button', { name: 'Cancel' }).click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: '+ Add ticket' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}modal-add-ticket.png` });

// Interaction: T-Card board views
watch('board-views');
await page.goto(`${BASE}/board`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.screenshot({ path: `${outDir}board-stage.png`, fullPage: true });
await page.getByRole('button', { name: 'By operative' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}board-ops.png`, fullPage: true });

// Interaction: Mould planner tabs
watch('mould-planner');
await page.goto(`${BASE}/moulds`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Board', exact: true }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}mould-board.png`, fullPage: true });
await page.getByRole('button', { name: 'Unassigned', exact: true }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}mould-unassigned.png`, fullPage: true });

await browser.close();

console.log('\n=== ISSUES ===');
if (issues.length === 0) console.log('none');
else issues.forEach((i) => console.log(i));
