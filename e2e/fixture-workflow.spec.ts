import { test, expect } from '@playwright/test';

const demoPath = '/demo-7c9f3a-sportscore';
const storageKey = 'sportscore:private-demo:v3';
const databaseKey = 'sportscore:product-demo:v5';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ privateKey, dbKey }) => { localStorage.removeItem(privateKey); localStorage.removeItem(dbKey); }, { privateKey: storageKey, dbKey: databaseKey });
});

test('Fixture Workflow renders a derived publication state', async ({ page }) => {
  await page.goto(demoPath);
  await page.getByRole('button', { name: 'Fixture' }).click();
  const panel = page.getByTestId('fixture-workflow-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/PRIVADO|REVISIÓN DE DELEGADOS|PUBLICADO/)).toBeVisible();
  await expect(panel.getByText(/Delegados:/)).toBeVisible();
});
