import { test, expect } from '@playwright/test';

const demoPath = '/experiencia-7c9f3a/admin';
const demoStorageKey = 'sportscore:product-demo:v5';

test('E2E 01 — Admin Operations Load', async ({ page }) => {
  await page.goto(demoPath);
  await expect(page.getByTestId('operations-dashboard')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Estado del torneo' })).toBeVisible();
  await expect(page.getByRole('alert', { name: /server components render/i })).toHaveCount(0);
});

test('E2E 02 — Tournament Selection persists valid selection', async ({ page }) => {
  await page.goto(`${demoPath}?tournament=demo-tournament`);
  await expect(page.getByTestId('operations-dashboard')).toBeVisible();
  await expect(page).toHaveURL(/tournament=demo-tournament/);
  await page.reload();
  await expect(page.getByTestId('operations-dashboard')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('sportscore:admin-tournament:experiencia-7c9f3a'))).toBe('demo-tournament');
});

test('E2E 03 — Tenant Isolation UI does not reuse another slug key', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sportscore:admin-tournament:otro-tenant', 'foreign-id');
    localStorage.setItem('sportscore:admin-tournament:experiencia-7c9f3a', 'foreign-id');
  });
  await page.goto(demoPath);
  await expect(page.getByTestId('operations-dashboard')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('sportscore:admin-tournament:experiencia-7c9f3a'))).toBe('demo-tournament');
  expect(await page.evaluate(() => localStorage.getItem('sportscore:admin-tournament:otro-tenant'))).toBe('foreign-id');
});

test('E2E 04 — Empty State', async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ clients: [{ id: 'demo-client', name: 'DEMO', slug: 'experiencia-7c9f3a' }], tournaments: [{ id: 'demo-tournament', client_id: 'demo-client', name: 'VACÍO', is_active: true }], categories: [], teams: [], players: [], matches: [], matchdays: [], player_documents: [], match_events: [], delegate_team_access: [] }));
  }, demoStorageKey);
  await page.goto(demoPath);
  await expect(page.getByText('Torneo sin categorías')).toBeVisible();
  await expect(page.getByText('Configura al menos una categoría para iniciar la operación.')).toBeVisible();
});

test('E2E 05 — Mobile has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(demoPath);
  await expect(page.getByTestId('operations-dashboard')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Estado del torneo' })).toBeVisible();
});

test('E2E 05b — Tablet has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(demoPath);
  await expect(page.getByTestId('operations-dashboard')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Necesitan atención' })).toBeVisible();
});

test('E2E 06 — Demo does not call private Supabase', async ({ page }) => {
  const privateRequests: string[] = [];
  page.on('request', (request) => { if (/supabase\.co/i.test(request.url())) privateRequests.push(request.url()); });
  await page.goto(demoPath);
  await expect(page.getByTestId('operations-dashboard')).toBeVisible();
  expect(privateRequests).toEqual([]);
});

test('E2E 07 — Demo Game Day renders operational dashboard', async ({ page }) => {
  await page.goto('/experiencia-7c9f3a/admin/game-day');
  await expect(page.getByText('Jornada operativa')).toBeVisible();
  await expect(page.getByLabel('Fecha de operación')).toBeVisible();
});

test('E2E 08 — Demo Mesa opens with operational context', async ({ page }) => {
  await page.goto('/experiencia-7c9f3a/admin/mesa?cat=demo-category&tournament=demo-tournament&from=game-day');
  await expect(page.getByRole('heading', { name: /Mesa de Control/i })).toBeVisible();
  await page.getByText('EQUIPO AURORA').first().click();
  await expect(page.getByLabel('Línea de tiempo del partido')).toBeVisible();
  await expect(page.getByText('Últimos eventos')).toBeVisible();
});
