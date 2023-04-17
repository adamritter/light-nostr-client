import { expect, test } from '@playwright/test';
import { LogisticRegressor } from 'logistic_regression';

// test('index page has expected h1', async ({ page }) => {
// 	await page.goto('/');
// 	await expect(page.getByRole('heading', { name: 'Welcome to SvelteKit' })).toBeVisible();
// });

test('simple', () => {
	const lr = new LogisticRegressor();
	expect(1).toBe(1);
});
