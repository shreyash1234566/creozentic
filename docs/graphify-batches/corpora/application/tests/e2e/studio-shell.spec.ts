import { expect, test } from "@playwright/test";

test("studio shell exposes the existing workflow navigation and System Map", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Creozentic/i);
  await page.getByRole("button", { name: /Launch studio/i }).click();
  await expect(page.getByText("Product Ad", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /System Map/i }).click();
  await expect(page.getByRole("heading", { name: /The system, made legible/i })).toBeVisible();
  await expect(page.getByText("AI Video Editor", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Backend → frontend coverage", { exact: true })).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /Control plane/i })).toBeVisible();
});
