import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

// Run against the production build. API calls are mocked so this never
// creates a real enquiry or depends on the production PHP backend.
const origin = "http://127.0.0.1:3177";
const server = spawn("npm", ["run", "start", "--", "--hostname", "127.0.0.1", "--port", "3177"], {
  stdio: "inherit",
  detached: true,
});
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await fetch(`${origin}/vidkre8`).then((r) => r.ok).catch(() => false)) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(ready, "Production server did not start");
  browser = await chromium.launch();
  const page = await browser.newPage();
  let enquiries = 0;
  let payload;
  await page.route("**/api/v1/**", async (route) => {
    if (route.request().url().endsWith("/inquiries")) {
      enquiries++;
      payload = route.request().postDataJSON();
      await route.fulfill({ status: enquiries === 1 ? 500 : 200, json: enquiries === 1 ? { error: "Test failure. Please retry." } : { id: 1 } });
    } else {
      await route.fulfill({ json: {} });
    }
  });
  await mkdir("artifacts/vidkre8", { recursive: true });
  for (const width of [320, 390, 650, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${origin}/vidkre8`);
    await page.locator(".vk-project-image img").last().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const issues = await page.evaluate(() => {
      const issues = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) issues.push("Horizontal page overflow");
      const overlap = (a, b) => {
        const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
        return Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1;
      };
      const pair = (parent, first, second) => {
        const a = parent.querySelector(first), b = parent.querySelector(second);
        if (a && b && overlap(a, b)) issues.push(`${first} overlaps ${second}`);
      };
      document.querySelectorAll(".vk-project").forEach((card) => {
        pair(card, ".vk-project-stamp", ".vk-project-overlay");
        pair(card, ".vk-project-overlay", ".vk-project-view");
        pair(card, ".vk-project-image", ".vk-project-title");
      });
      document.querySelectorAll(".vk-service").forEach((card) => {
        pair(card, ".vk-service-category", "h3");
        pair(card, "h3", ".vk-service-body");
        pair(card, ".vk-service-body", ".vk-service-tags");
      });
      pair(document, ".vk-reel-frame.is-selected .vk-frame-headline", ".vk-reel-controls");
      pair(document, ".vk-project-detail > p", ".vk-project-detail > a");
      pair(document, ".vk-submit", ".vk-form-privacy");
      const formats = [...document.querySelectorAll(".vk-format")];
      formats.forEach((a, i) => formats.slice(i + 1).forEach((b) => { if (overlap(a, b)) issues.push("Format tiles overlap"); }));
      document.querySelectorAll(".vk-service-body,.vk-project-view,.vk-text-link,.vk-steps p,.vk-brief-form input").forEach((el) => {
        if (el.getBoundingClientRect().height && parseFloat(getComputedStyle(el).fontSize) < 16) issues.push(`${el.className || el.tagName} is below 16px`);
      });
      return issues;
    });
    await page.screenshot({ path: `artifacts/vidkre8/${width}.png`, fullPage: true });
    assert.deepEqual(issues, [], `Layout issues at ${width}px`);
  }
  await page.getByRole("button", { name: "Next project", exact: true }).click();
  await page.locator(".vk-reel-frame.is-selected").filter({ hasText: "BuineePay" }).waitFor();
  await page.getByRole("button", { name: "Play motion preview", exact: true }).click();
  await page.getByRole("button", { name: "Pause motion preview", exact: true }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Layout test");
  await page.getByLabel("Email address", { exact: true }).fill("test@example.com");
  await page.getByLabel("The idea", { exact: true }).fill("A product launch video for our mobile app.");
  await page.getByRole("button", { name: "Send the brief", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Test failure" }).waitFor();
  await page.getByRole("button", { name: "Send the brief", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Your story starts here" }).waitFor();
  assert.equal(enquiries, 2);
  assert(payload.message.includes("VidKre8 video enquiry"));
  console.log("VidKre8: six viewport layouts, readable text, collision checks, preview controls and enquiry retry passed.");
} finally {
  await browser?.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch { /* Server already stopped. */ }
}
