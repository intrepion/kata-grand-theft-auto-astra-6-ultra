import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

interface Snapshot {
  started: boolean;
  paused: boolean;
  cash: number;
  missionCount: number;
  missionStep: number;
  health: number;
  wanted: number;
  onFoot: boolean;
  x: number;
  z: number;
  speed: number;
  drawCalls: number;
  heading: number;
  cameraType: string;
  cameraYaw: number;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  cameraFov: number;
}
interface TestControls {
  snapshot(): Snapshot;
  teleport(x: number, z: number): void;
  clearHeat(): void;
  setHealth(health: number): void;
  destination(): { x: number; z: number };
}
declare global {
  interface Window {
    __vice: TestControls;
  }
}

const snapshot = (page: Page) => page.evaluate(() => window.__vice.snapshot());
async function start(page: Page, capture = false): Promise<void> {
  await page.goto("/?test=1");
  if (capture && process.env.UPDATE_SCREENSHOTS)
    await page.screenshot({ path: "artifacts/welcome.png" });
  await page.getByRole("button", { name: "HIT THE STREETS" }).click();
  await expect.poll(async () => (await snapshot(page)).started).toBe(true);
  if (capture && process.env.UPDATE_SCREENSHOTS) {
    await expect(page.locator("#toast-region .toast")).toHaveCount(0, {
      timeout: 10000,
    });
    await page.screenshot({ path: "artifacts/gameplay.png" });
  }
}

test("city renders, the player takes a car, drives, brakes, and exits", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page, true);
  const initial = await snapshot(page);
  expect(initial.onFoot).toBe(true);
  expect(initial.cameraType).toBe("PerspectiveCamera");
  expect(initial.drawCalls).toBeGreaterThan(10);
  await page.keyboard.press("e");
  await expect.poll(async () => (await snapshot(page)).onFoot).toBe(false);
  await expect(page.locator("#vehicle-name")).toHaveText("COMET GT");
  await expect(page.locator("#wanted")).toHaveAttribute(
    "aria-label",
    "Wanted level 1 of 5",
  );
  await page.keyboard.down("w");
  await expect
    .poll(async () => (await snapshot(page)).speed)
    .toBeGreaterThan(10);
  await page.keyboard.up("w");
  await expect
    .poll(async () => {
      const current = await snapshot(page);
      return Math.cos(current.cameraYaw - current.heading);
    })
    .toBeGreaterThan(0.9);
  if (process.env.UPDATE_SCREENSHOTS)
    await page.screenshot({ path: "artifacts/driving.png" });
  expect((await snapshot(page)).z).toBeGreaterThan(initial.z + 2);
  await page.keyboard.press("e");
  expect((await snapshot(page)).onFoot).toBe(false);
  await page.keyboard.down(" ");
  await expect.poll(async () => (await snapshot(page)).speed).toBeLessThan(4);
  await page.keyboard.up(" ");
  await page.keyboard.press("e");
  await expect.poll(async () => (await snapshot(page)).onFoot).toBe(true);
  expect(errors).toEqual([]);
});

test("street-level camera orbits and walking follows the new view direction", async ({
  page,
}) => {
  await start(page);
  const initial = await snapshot(page);
  expect(initial.cameraType).toBe("PerspectiveCamera");
  expect(initial.cameraY).toBeLessThan(8);
  expect(initial.cameraY).toBeGreaterThan(1);
  expect(initial.cameraZ).toBeGreaterThan(initial.z);
  await page.mouse.move(900, 440);
  await page.mouse.down();
  await page.mouse.move(1030, 470, { steps: 8 });
  await page.mouse.up();
  const orbited = await snapshot(page);
  expect(
    Math.abs(Math.sin(orbited.cameraYaw - initial.cameraYaw)),
  ).toBeGreaterThan(0.25);
  await page.keyboard.down("w");
  await expect
    .poll(async () => {
      const moved = await snapshot(page);
      return Math.hypot(moved.x - orbited.x, moved.z - orbited.z);
    })
    .toBeGreaterThan(1.3);
  await page.keyboard.up("w");
  const moved = await snapshot(page);
  const dx = moved.x - orbited.x,
    dz = moved.z - orbited.z;
  const alignment =
    (dx * Math.sin(orbited.cameraYaw) + dz * Math.cos(orbited.cameraYaw)) /
    Math.hypot(dx, dz);
  expect(alignment).toBeGreaterThan(0.98);

  await page.mouse.move(900, 440);
  await page.mouse.down();
  await page.mouse.move(1080, 440, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press("c");
  await expect
    .poll(async () => {
      const current = await snapshot(page);
      return Math.cos(current.cameraYaw - current.heading);
    })
    .toBeGreaterThan(0.99);
  await page.keyboard.press("Escape");
  const paused = await snapshot(page);
  await page.mouse.move(900, 440);
  await page.mouse.wheel(0, 200);
  expect((await snapshot(page)).cameraYaw).toBe(paused.cameraYaw);
});

test("pause freezes movement and help resumes cleanly", async ({ page }) => {
  await start(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-modal")).toBeVisible();
  const before = await snapshot(page);
  await page.keyboard.down("w");
  await page.waitForTimeout(300);
  await page.keyboard.up("w");
  const after = await snapshot(page);
  expect(after.x).toBe(before.x);
  expect(after.z).toBe(before.z);
  await page.getByRole("button", { name: "BACK TO THE STREETS" }).click();
  await page.locator("#help-button").click();
  await expect(page.locator("#help-modal")).toBeVisible();
  expect((await snapshot(page)).paused).toBe(true);
  await page.getByRole("button", { name: "GOT IT." }).click();
  await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
  await expect(page.locator("#pause-modal")).toBeHidden();
});

test("delivery requires losing heat, pays once, saves progress and starts a new job", async ({
  page,
}) => {
  await start(page);
  const before = await snapshot(page);
  await page.keyboard.press("e");
  await page.evaluate(() => {
    const target = window.__vice.destination();
    window.__vice.teleport(target.x, target.z);
  });
  await page.waitForTimeout(150);
  expect((await snapshot(page)).missionCount).toBe(0);
  expect((await snapshot(page)).wanted).toBeGreaterThan(0);
  await page.evaluate(() => window.__vice.clearHeat());
  await expect(page.locator("#result-modal")).toBeVisible();
  await expect(page.locator("#result-title")).toHaveText("Job complete.");
  const complete = await snapshot(page);
  expect(complete.cash).toBe(before.cash + 1500);
  expect(complete.missionCount).toBe(1);
  expect(complete.paused).toBe(true);
  await page.getByRole("button", { name: "KEEP EXPLORING" }).click();
  await page.waitForTimeout(200);
  expect((await snapshot(page)).cash).toBe(complete.cash);
  expect(await page.evaluate(() => window.__vice.destination())).toEqual({
    x: 96,
    z: 73,
  });
  await page.reload();
  await page.getByRole("button", { name: "HIT THE STREETS" }).click();
  expect((await snapshot(page)).cash).toBe(complete.cash);
  expect((await snapshot(page)).missionCount).toBe(1);
});

test("recovery repairs damage, charges the stated fee and clears heat", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.press("e");
  await page.evaluate(() => window.__vice.setHealth(20));
  const before = await snapshot(page);
  await page.keyboard.press("r");
  await expect(page.locator("#result-modal")).toBeVisible();
  const after = await snapshot(page);
  expect(after.cash).toBe(before.cash - 250);
  expect(after.health).toBe(100);
  expect(after.wanted).toBe(0);
  expect(after.speed).toBe(0);
  expect(after.paused).toBe(true);
  expect(after.onFoot).toBe(true);
  expect(after.missionStep).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#result-modal")).toBeHidden();
  await page.waitForTimeout(250);
  expect((await snapshot(page)).cash).toBe(before.cash - 250);
  expect((await snapshot(page)).missionCount).toBe(0);
});

test("mobile layout fits the screen and touch controls move the character", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page);
  await expect(
    page.getByRole("button", { name: "Move forward", exact: true }),
  ).toBeVisible();
  const before = await snapshot(page);
  const button = await page.locator('[data-control="w"]').boundingBox();
  if (!button) throw new Error("Touch move button is missing");
  await page.mouse.move(
    button.x + button.width / 2,
    button.y + button.height / 2,
  );
  await page.mouse.down();
  await expect
    .poll(async () => (await snapshot(page)).z)
    .toBeLessThan(before.z - 1);
  await page.mouse.up();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
  if (process.env.UPDATE_SCREENSHOTS)
    await page.screenshot({ path: "artifacts/mobile.png" });
  await context.close();
});
