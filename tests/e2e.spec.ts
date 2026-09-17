import { test, expect } from '@playwright/test';

const backend = 'http://localhost:8787/api';

test.describe('BetterBMTC core journeys', () => {
  test('nearby loads real static stop cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.stop-card').first()).toBeVisible();
    await expect(page.locator('.feed-note')).toContainText(/Static|Live/);
    await expect(page.locator('.stop-card').first().locator('strong')).not.toHaveText('');
  });

  test('saving a stop persists across reload and can be removed', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('.stop-card').first();
    const stopName = await card.locator('strong').innerText();
    await card.locator('.save-stop').click();
    await page.reload();
    await page.getByRole('button', { name: /^Saved/ }).click();
    await expect(page.locator('.saved-row').filter({ hasText: stopName })).toBeVisible();
    await page.locator('.saved-row').filter({ hasText: stopName }).locator('.save-stop').click();
    await expect(page.locator('.empty-state')).toContainText(/daily commute|saved/i);
  });

  test('route search 500D opens a route and its stops', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Routes/ }).click();
    await page.getByLabel('Search routes and stops').fill('500D');
    const route = page.locator('.route-card').filter({ hasText: '500D' }).first();
    await expect(route).toBeVisible();
    await route.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(/Along the way|Available buses/);
  });

  test('planner selects real stops and returns a backend plan', async ({ page, request }) => {
    const detail = await request.get(`${backend}/routes/static-1705`);
    expect(detail.ok()).toBeTruthy();
    const data = await detail.json() as { stops: Array<{ id: string; name: string }> };
    expect(data.stops.length).toBeGreaterThan(2);
    const origin = data.stops[0];
    const destination = data.stops[data.stops.length - 1];

    await page.goto('/');
    await page.getByRole('button', { name: /Plan a trip/ }).first().click();
    const fields = page.locator('.planner-field');
    await fields.nth(0).locator('input').fill(origin.name);
    await fields.nth(0).getByRole('option').first().click();
    await fields.nth(1).locator('input').fill(destination.name);
    await fields.nth(1).getByRole('option').first().click();
    await page.getByRole('button', { name: /Plan journey/ }).click();
    await expect(page.locator('.journey-card')).toBeVisible();
    await expect(page.locator('.journey-card')).toContainText(/static|GTFS|Vonter/i);
  });

  test('planner rejects the same stop for both endpoints', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Plan a trip/ }).first().click();
    const fields = page.locator('.planner-field');
    await fields.nth(0).locator('input').fill('Majestic');
    await fields.nth(0).getByRole('option').first().click();
    const name = await fields.nth(0).locator('input').inputValue();
    await fields.nth(1).locator('input').fill(name);
    await fields.nth(1).getByRole('option').first().click();
    await expect(page.getByRole('alert')).toContainText(/different stops/i);
  });
});

test.describe('responsive and permissions', () => {
  test('mobile layout fits viewport and map toggle works', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const toggle = page.locator('.mobile-map-toggle');
    await expect(toggle).toContainText('Show map');
    await toggle.click();
    await expect(toggle).toContainText('Show list');
  });

  test('denied geolocation shows a useful message', async ({ page, context }) => {
    await context.grantPermissions([], { origin: 'http://localhost:3000' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Use my current location' }).first().click();
    await expect(page.locator('.toast[role="status"]')).toContainText(/Location unavailable|Enable location/i);
  });
});
