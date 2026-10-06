// End-to-end and accessibility checks. Run with: npm run test:e2e
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const axe = (page: import('@playwright/test').Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('builds a hub estimate and shows the working', async ({ page }) => {
  await page.getByRole('button', { name: /Hub \(platform connectivity\)/ }).click()
  await expect(page.getByRole('article', { name: /Hub firewall/ })).toBeVisible()
  await expect(page.locator('.working').first()).toContainText('× 730 h =')
  await expect(page.locator('.headline')).toContainText('£')
})

test('hours model switches to office hours and warns on unpausable resources', async ({ page }) => {
  await page.getByRole('button', { name: /Hub \(platform connectivity\)/ }).click()
  await page.getByRole('radio', { name: '217 h' }).check()
  await expect(page.locator('.working').first()).toContainText('× 217 h =')
  await expect(page.getByText(/has no stopped state/).first()).toBeVisible()
})

for (const theme of ['light', 'dark'] as const) {
  test(`no axe violations on each tab (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await page.getByRole('button', { name: /Application spoke/ }).click()
    for (const tab of ['Estimate', 'Ramp and ACR forecast', 'Client pack', 'Details and assumptions']) {
      await page.getByRole('tab', { name: tab }).click()
      const results = await axe(page).analyze()
      expect(results.violations.map((v) => `${tab}: ${v.id} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([])
    }
  })
}

test('add resource dialog is accessible and adds a line', async ({ page }) => {
  await page.getByRole('button', { name: /Blank workload/ }).click()
  await page.getByRole('button', { name: 'Add resource' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  expect((await axe(page).include('dialog').analyze()).violations).toEqual([])
  await dialog.getByLabel('Search resources').fill('nat')
  await dialog.getByRole('button', { name: /NAT Gateway/ }).click()
  await expect(page.getByRole('article', { name: /NAT Gateway/ })).toBeVisible()
})

test('works at 320 px wide without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.getByRole('button', { name: /AKS cluster/ }).click()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('share link round-trips the estimate', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: /Data platform/ }).click()
  await page.getByRole('button', { name: 'Copy share link' }).click()
  await expect(page.getByText(/Share link copied/)).toBeVisible()
  const url = await page.evaluate(() => navigator.clipboard.readText())
  await page.evaluate(() => localStorage.clear())
  await page.goto(url)
  await expect(page.getByRole('article', { name: /Reporting databases/ })).toBeVisible()
})
