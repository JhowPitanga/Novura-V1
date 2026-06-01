import { test, expect } from "@playwright/test";

/**
 * OAuth marketplace E2E — requires staging credentials and test org.
 * Run: npx playwright test e2e/oauth-marketplace.spec.ts
 */
test.describe("OAuth marketplace flow", () => {
  test.skip(!process.env.E2E_BASE_URL, "Set E2E_BASE_URL to run OAuth E2E");

  test("Apps page loads catalog", async ({ page }) => {
    await page.goto(`${process.env.E2E_BASE_URL}/auth`);
    // Login flow is environment-specific — extend when E2E credentials are configured.
    await page.goto(`${process.env.E2E_BASE_URL}/aplicativos`);
    await expect(page.getByPlaceholder("Buscar aplicativos...")).toBeVisible({ timeout: 15000 });
  });

  test("OAuth callback page shows error without params", async ({ page }) => {
    await page.goto(`${process.env.E2E_BASE_URL}/oauth/shopee/callback`);
    await expect(page.getByText(/Parâmetro state ausente|Falha na autorização/i)).toBeVisible({
      timeout: 10000,
    });
  });
});
