import { test, expect } from '@playwright/test';

test('sidebar hides auth links and profile shows password links', async ({ page }) => {
  const email = `nav-${Date.now()}@example.com`;
  const password = '12345678';

  await page.goto('http://localhost:3000/register');
  await page.getByPlaceholder('Name').fill('Nav Test');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password (min 8 chars)').fill(password);
  await page.getByRole('button', { name: 'Register' }).click();
  await page.waitForURL('**/login');

  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL('**/dashboard');

  await page.goto('http://localhost:3000/profile');

  await expect(page.getByRole('navigation').getByRole('link', { name: 'Login' })).toHaveCount(0);
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Register' })).toHaveCount(0);
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Forgot Password' })).toHaveCount(0);
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Reset Password' })).toHaveCount(0);
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Change Password' })).toHaveCount(0);

  const forgotLink = page.getByRole('main').getByRole('link', { name: 'Forgot Password' });
  const changeLink = page.getByRole('main').getByRole('link', { name: 'Change Password' });

  await expect(forgotLink).toHaveCount(1);
  await expect(forgotLink).toHaveAttribute('href', '/forgot-password');
  await expect(changeLink).toHaveCount(1);
  await expect(changeLink).toHaveAttribute('href', '/change-password');
});
