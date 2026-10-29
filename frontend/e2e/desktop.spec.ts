import { test, expect, type Page } from '@playwright/test';

/** Boot to the desktop as the guest account (first run shows onboarding). */
async function bootToDesktop(page: Page) {
  await page.goto('/');
  const skip = page.getByText('Skip — continue as Guest');
  const login = page.getByRole('button', { name: /^Log in as/ });
  await expect(skip.or(login)).toBeVisible({ timeout: 20_000 });
  if (await skip.isVisible()) await skip.click();
  else await login.click();
  await expect(page.locator('[aria-label="Finder"][role="button"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
}

const dock = (page: Page, name: string) => page.locator(`[aria-label="${name}"][role="button"]`);
const focused = (page: Page) => page.locator('.window.focused').last();

test.describe('Golden Gate desktop simulator', () => {
  test('boots, shows menu bar, Dock and desktop items without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await bootToDesktop(page);
    await expect(page.getByText('Welcome to Golden Gate').first()).toBeVisible();
    await expect(dock(page, 'System Settings')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('wallpaper and appearance changes are real and survive a reload', async ({ page }) => {
    await bootToDesktop(page);
    await dock(page, 'System Settings').click();
    await focused(page).locator('.sb-item', { hasText: 'Wallpaper' }).click();
    await focused(page).locator('button[title="Silk Folds"]').click();
    await focused(page).locator('.sb-item', { hasText: 'Appearance' }).click();
    await focused(page).getByText('dark', { exact: true }).click();
    await expect(page.locator('[data-theme="dark"]').first()).toBeAttached();

    await page.waitForTimeout(800); // let IndexedDB persistence flush
    await page.reload();
    await bootToDesktop(page);
    await expect(page.locator('[data-theme="dark"]').first()).toBeAttached();
    await dock(page, 'System Settings').click();
    await focused(page).locator('.sb-item', { hasText: 'Wallpaper' }).click();
    await expect(focused(page).getByText('Silk Folds').first()).toBeVisible();
  });

  test('Finder creates a folder that appears on the virtual disk', async ({ page }) => {
    await bootToDesktop(page);
    await dock(page, 'Finder').click();
    await expect(focused(page).getByText('Documents').first()).toBeVisible();
    await page.waitForTimeout(400);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+N' : 'Control+Shift+N');
    await expect(focused(page).locator('textarea')).toBeFocused();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('E2E Folder');
    await page.keyboard.press('Enter');
    await expect(focused(page).getByText('E2E Folder')).toBeVisible();
  });

  test('Terminal runs commands against the virtual file system', async ({ page }) => {
    await bootToDesktop(page);
    await dock(page, 'Terminal').click();
    const term = focused(page).locator('.xterm');
    await expect(term).toBeVisible();
    await term.click();
    await page.keyboard.type('mkdir e2e && echo golden > e2e/gate.txt && cat e2e/gate.txt');
    await page.keyboard.press('Enter');
    await expect(focused(page).locator('.xterm-rows')).toContainText('golden');
  });

  test('Spotlight evaluates math and launches apps', async ({ page }) => {
    await bootToDesktop(page);
    await page.keyboard.press('Control+Space');
    await page.waitForTimeout(300);
    await page.keyboard.type('12*7');
    await expect(page.getByText('= 84').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Space');
    await page.waitForTimeout(300);
    await page.keyboard.type('Calculator');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await expect(focused(page).getByRole('button', { name: /^(AC|C)$/ }).first()).toBeVisible();
  });

  test('App Store installs an app that then appears in the Dock', async ({ page }) => {
    await bootToDesktop(page);
    await page.keyboard.press('Control+Space');
    await page.waitForTimeout(300);
    await page.keyboard.type('chess');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Get' }).first().click();
    await expect(page.getByRole('button', { name: 'Open' }).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Open' }).first().click();
    await expect(dock(page, 'Chess')).toBeVisible();
  });
});

test.describe('macOS-style window behaviour', () => {
  test('Option/Alt-Tab app switcher brings the chosen app forward', async ({ page }) => {
    await bootToDesktop(page);
    await dock(page, 'Notes').click();
    await expect(focused(page)).toBeVisible();
    await dock(page, 'Terminal').click();
    await expect(focused(page).locator('.xterm')).toBeVisible();
    await page.keyboard.down('Alt');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('listbox', { name: 'App Switcher' })).toBeVisible();
    await expect(page.getByRole('option', { selected: true })).toContainText('Notes');
    await page.keyboard.up('Alt');
    await expect(page.getByRole('listbox', { name: 'App Switcher' })).toBeHidden();
    await expect(page.locator('header, [role="menubar"]').first()).toContainText('Notes');
  });

  test('Safari opens YouTube with an embedded player page', async ({ page }) => {
    await bootToDesktop(page);
    await dock(page, 'Safari').click();
    const addr = focused(page).getByLabel('Address and search');
    await addr.click();
    await page.keyboard.type('youtube.com/watch?v=eRsGyueVLvQ');
    await page.keyboard.press('Enter');
    const player = focused(page).locator('iframe[title="YouTube video player"]');
    await expect(player).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/eRsGyueVLvQ/);
  });
});
