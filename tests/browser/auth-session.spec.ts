import { expect, test } from "@playwright/test";

test("restores the portal from an HttpOnly server session cookie after reload", async ({
  page,
  context,
}) => {
  const sessionValue = "opaque-session-value-for-test";
  await context.addCookies([{
    name: "stats-local-session",
    value: sessionValue,
    url: "http://127.0.0.1:4300",
    httpOnly: true,
    sameSite: "Lax",
  }]);

  let sessionChecks = 0;
  await page.route("**/config.json", (route) => route.fulfill({
    json: {
      googleClientId: "test-client",
      allowedDomain: "stmarobotics.org",
      demo: false,
    },
  }));
  await page.route("**/api/auth/session", async (route) => {
    sessionChecks++;
    expect(route.request().headers().cookie).toContain(
      `stats-local-session=${sessionValue}`,
    );
    expect(route.request().headers().authorization).toBeUndefined();
    await route.fulfill({ json: { authenticated: true } });
  });
  await page.route("**/api/me", (route) => route.fulfill({
    json: {
      displayName: "Example Student",
      student: true,
      staff: false,
      currentYear: 2027,
    },
  }));
  await page.route("**/api/hours?**", (route) => route.fulfill({
    json: {
      interval: { label: "2026–2027", start: "2026-06-02", end: "2027-06-01" },
      asOf: "2026-11-02T18:00:00.000Z",
      selected: { shopSeconds: 3600, volunteerSeconds: 0 },
      career: { shopSeconds: 3600, volunteerSeconds: 0 },
      years: [2027],
      ranks: { shop: 1, volunteer: null },
      history: [],
    },
  }));

  for (let reload = 0; reload < 2; reload++) {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "My Hours", exact: true }))
      .toBeVisible();
    expect(await page.evaluate(() => document.cookie)).not.toContain(sessionValue);
  }
  expect(sessionChecks).toBe(2);
});
