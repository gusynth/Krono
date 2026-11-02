import { expect, type Locator } from '@playwright/test';

/** Interage com o menu real; não injeta change ou altera estado do produto. */
export async function choose(control: Locator, value: string) {
  await control.click();
  const popup = control.locator('..').locator('.choice-popover');
  await expect(popup.getByRole('option').first()).toBeVisible();
  const target = popup.locator('[role=option]').filter({ visible: true });
  const values = await target.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-value')),
  );
  expect(values).toContain(value);
  await target.nth(values.indexOf(value)).click();
  await expect(control).toHaveAttribute('aria-expanded', 'false');
}
