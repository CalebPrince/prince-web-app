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
  const mediaRequests = [];
  page.on("request", (request) => { if (request.url().endsWith(".mp4")) mediaRequests.push(request.url()); });
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
      pair(document, ".vk-cinema-screen", ".vk-film-info");
      document.querySelectorAll(".vk-thumbnail").forEach((cover) => {
        pair(cover, ".vk-thumbnail-brand", ".vk-card-play");
        pair(cover, ".vk-card-play", ".vk-thumbnail-title");
        pair(cover, ".vk-thumbnail-title", ".vk-thumbnail-meta");
      });
      document.querySelectorAll(".vk-brief-form select").forEach((el) => {
        const style = getComputedStyle(el);
        if (parseFloat(style.paddingRight) < 48 || !style.backgroundPositionX.includes("18px")) issues.push("Dropdown arrow lacks right inset");
      });
      pair(document, ".vk-project-detail > p", ".vk-project-detail > a");
      pair(document, ".vk-submit", ".vk-form-privacy");
      const formats = [...document.querySelectorAll(".vk-format")];
      formats.forEach((a, i) => formats.slice(i + 1).forEach((b) => { if (overlap(a, b)) issues.push("Format tiles overlap"); }));
      document.querySelectorAll(".vk-service-body,.vk-project-view,.vk-text-link,.vk-steps p,.vk-brief-form input").forEach((el) => {
        if (el.getBoundingClientRect().height && parseFloat(getComputedStyle(el).fontSize) < 16) issues.push(`${el.className || el.tagName} is below 16px`);
      });
      return issues;
    });
    assert.equal(await page.locator(".vk-player-cover").count(), 1, "Custom thumbnail must be shown before playback");
    await page.screenshot({ path: `artifacts/vidkre8/${width}.png`, fullPage: true });
    assert.deepEqual(issues, [], `Layout issues at ${width}px`);
  }
  assert.equal(mediaRequests.length, 0, "Sample videos must not download before playback");
  await page.getByRole("button", { name: "Wedding", exact: true }).click();
  assert.equal(await page.locator(".vk-project").count(), 1);
  await page.getByRole("button", { name: "Watch Every love story", exact: true }).click();
  await page.waitForFunction(() => {
    const video = document.querySelector(".vk-cinema video");
    return video && video.readyState >= 2 && video.currentTime > 0;
  });
  assert.equal(await page.locator(".vk-cinema video").evaluate((video) => Math.round(video.duration * 10) / 10), 2.2);
  assert.equal(await page.locator(".vk-player-cover").count(), 0, "Custom thumbnail should clear when playback starts");
  await page.locator(".vk-cinema video").evaluate((video) => video.pause());
  await page.getByRole("button", { name: "All work", exact: true }).click();
  await page.getByRole("button", { name: "Watch LIID Flo", exact: true }).click();
  await page.waitForFunction(() => {
    const video = document.querySelector(".vk-cinema video");
    return video && video.duration > 20 && video.currentTime > 0;
  });
  await page.locator(".vk-cinema video").evaluate((video) => video.pause());
  await page.getByRole("button", { name: "Podcast", exact: true }).click();
  assert.equal(await page.locator(".vk-project").count(), 1);
  await page.getByRole("button", { name: "All work", exact: true }).click();
  assert.equal(await page.locator(".vk-project").count(), 6);
  assert(!/LCA|walkthrough/i.test(await page.locator(".vk-project-grid").innerText()), "Excluded walkthrough must not appear");
  await page.route("**/vidkre8/videos/voice.mp4", (route) => route.abort());
  await page.getByRole("button", { name: "Watch Meet Lisa", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "video could not load" }).waitFor();
  await page.unroute("**/vidkre8/videos/voice.mp4");
  await page.getByRole("button", { name: "Retry video", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".vk-cinema video")?.readyState >= 2);
  await page.locator(".vk-cinema video").evaluate((video) => video.pause());
  await page.getByLabel("What are we making?", { exact: true }).selectOption("Wedding films & highlights");
  await page.getByLabel("Your name", { exact: true }).fill("Layout test");
  await page.getByLabel("Email address", { exact: true }).fill("test@example.com");
  await page.getByLabel("The idea", { exact: true }).fill("A product launch video for our mobile app.");
  await page.getByRole("button", { name: "Send the brief", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Test failure" }).waitFor();
  await page.getByRole("button", { name: "Send the brief", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Your story starts here" }).waitFor();
  assert.equal(enquiries, 2);
  assert(payload.message.includes("VidKre8 video enquiry"));
  assert(payload.message.includes("Wedding films & highlights"));
  console.log("VidKre8: six viewport layouts, readable text, collision checks, real video playback, wedding/podcast filters, load-on-demand, media-error retry, dropdown spacing and enquiry retry passed.");
} finally {
  await browser?.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch { /* Server already stopped. */ }
}
