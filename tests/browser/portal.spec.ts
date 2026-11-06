import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("student years, metrics, history, keyboard and responsive layout", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "View as Alex · Student" }).click();
  await expect(
    page.getByRole("heading", { name: "My Hours", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".stat.primary .big-number")).toContainText("24.0");
  await expect(page.locator(".asof")).toContainText("Updated");
  await page.keyboard.press("Tab");
  await page
    .getByRole("link", { name: "Skip to content", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "My Hours", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Reports", exact: true }),
  ).toHaveCount(0);
  expect(
    await page
      .locator("body")
      .evaluate((el) => el.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await page.getByRole("button", { name: "Volunteer events" }).click();
  await expect(
    page.getByText("Library robot demonstration", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Unknown · excluded", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Reporting year" })
    .selectOption("2026");
  await expect(page.locator(".stat.primary .big-number")).toContainText("1.0");
  await page.getByRole("link", { name: "Leaderboard", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Team standings" }),
  ).toBeVisible();
  await expect(page.locator(".student-name .avatar")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Reporting year" })
    .selectOption("2027");
  await expect(page.locator(".your-rank")).toContainText("24.0");
  await page
    .getByRole("button", { name: "Volunteer hours", exact: true })
    .click();
  await expect(page.locator(".your-rank")).toContainText("2.0");
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({
    path: `test-results/${info.project.name}-leaderboard.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "My Hours", exact: true }).click();
  await expect(page.locator(".stat.primary .big-number")).toContainText("24.0");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    "BODY",
  );
  await page.screenshot({
    path: `test-results/${info.project.name}-hours.png`,
    fullPage: true,
  });
  expect(
    await page
      .locator("body")
      .evaluate((el) => el.scrollWidth <= window.innerWidth),
  ).toBe(true);
  const hoursAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(hoursAxe.violations).toEqual([]);
});
test("staff reports filters and CSV export", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "View as Robin · Staff" }).click();
  await expect(
    page.getByRole("heading", { name: "My Hours", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Shop hours", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Volunteer hours", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Reports", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Member summaries" }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Find a member" }).fill("Alex");
  await expect(page.getByText("Alex Morgan", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toContain("summary-2027");
  await page
    .getByRole("combobox", { name: "Report", exact: true })
    .selectOption("inside");
  await expect(
    page.getByRole("heading", { name: "Currently in shop", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("In progress", { exact: true })).toBeVisible();
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
});
test("users without a Puncher account see setup instructions and can view the leaderboard", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("Access-state examples").click();
  await page
    .getByRole("button", { name: "No Puncher account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My Hours", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Set up your Puncher account" }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link")).toHaveCount(2);
  await nav.getByRole("link", { name: "Leaderboard" }).click();
  await expect(
    page.getByRole("heading", { name: "Team standings" }),
  ).toBeVisible();
  await expect(nav.getByRole("link", { name: "Leaderboard" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByText("Access-state examples").click();
  await page.getByRole("button", { name: "Disabled former student" }).click();
  await expect(
    page.getByRole("heading", { name: "Access denied" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await page.route("**/api/hours?**", (route) => route.abort());
  await page.getByRole("button", { name: "View as Alex · Student" }).click();
  await expect(
    page.getByRole("heading", { name: "Data unavailable" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});
