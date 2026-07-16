import { expect, test } from "@playwright/test";

test("loads, starts a scenario, queues a smartbomb, and opens the editor", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("");
  await expect(
    page.getByRole("heading", { name: "Basic Firewall" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Begin exercise" }).click();
  await page.keyboard.press("F1");
  await expect(page.getByLabel("Toggle smartbomb 1")).toHaveClass(
    /queued|cycling/,
  );
  await page.getByRole("button", { name: "SCENARIO" }).click();
  await expect(
    page.getByRole("dialog", { name: "Scenario editor" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("offers full three-dimensional controls and persists contrast preference", async ({
  page,
}) => {
  await page.goto("");
  await page.getByRole("button", { name: "CONTRAST" }).click();
  await expect(page.locator("main")).toHaveClass(/high-contrast/);
  await page.reload();
  await expect(page.locator("main")).toHaveClass(/high-contrast/);
  await expect(page.getByRole("button", { name: /CLIMB/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /DESCEND/ })).toBeVisible();
});
