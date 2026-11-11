import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Pool } from "pg";
import { hashPassword } from "../../packages/auth/src/password-core";
import { test, expect, type Page } from "@playwright/test";

let fixtureAdminId: string | undefined;
test.afterEach(async () => {
  if (!fixtureAdminId) return;
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await db.query("DELETE FROM platform_admins WHERE user_id = $1", [fixtureAdminId]);
    await db.query("DELETE FROM staff_sessions WHERE user_id = $1", [fixtureAdminId]);
  } finally { await db.end(); fixtureAdminId = undefined; }
});

// Creates only uniquely named test shops. Retained locally for inspecting a failed run.
test("owner onboarding, publication and client booking work in both apps", async ({ page: adminPage, browser }) => {
  const suffix = randomUUID().slice(0, 8);
  const slug = `browser-${suffix}`;
  const password = `Browser-only-${randomUUID()}`;
  const errors: string[] = [];
  const observe = (target: Page) => target.on("pageerror", error => errors.push(error.message));
  observe(adminPage);
  fixtureAdminId = randomUUID();
  const adminEmail = `platform-${suffix}@example.invalid`;
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await db.query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)", [fixtureAdminId, adminEmail, await hashPassword(password)]);
    await db.query("INSERT INTO platform_admins (user_id) VALUES ($1)", [fixtureAdminId]);
  } finally { await db.end(); }
  await adminPage.goto("/register");
  await expect(adminPage).toHaveURL(/\/login$/);
  await expect(adminPage.getByRole("heading", { name: "Platform administrator sign in" })).toBeVisible();
  await expect(adminPage.getByRole("link", { name: "Create account", exact: true })).toHaveCount(0);
  await adminPage.locator('[name="email"]').fill(adminEmail);
  await adminPage.locator('[name="password"]').fill(password);
  await adminPage.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(adminPage).toHaveURL(/\/admin$/);
  await adminPage.locator('[name="email"]').fill(`${slug}@example.invalid`);
  await adminPage.locator('[name="password"]').fill(password);
  await adminPage.locator('[name="shopName"]').fill(`Browser Shop ${suffix}`);
  await adminPage.locator('[name="slug"]').fill(slug);
  await adminPage.locator('[name="currency"]').selectOption("USD");
  await adminPage.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(adminPage.getByRole("status")).toContainText("Shop and owner account created");
  await adminPage.reload();
  await expect(adminPage).toHaveURL(/\/admin$/);
  await expect(adminPage.getByRole("link", { name: `Browser Shop ${suffix}`, exact: true })).toBeVisible();
  const ownerContext = await browser.newContext();
  const page = await ownerContext.newPage();
  observe(page);
  await page.goto(`http://localhost:3001/${slug}/login`);
  await page.locator('[name="email"]').fill(`${slug}@example.invalid`);
  await page.locator('[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace/);

  await page.getByText("Contact details and appearance", { exact: true }).click();
  const details = page.locator("form").filter({ has: page.locator('[name="brandColor"]') });
  await details.locator('[name="phone"]').fill("+96170123456");
  await details.locator('[name="address"]').fill("Beirut test address");
  await details.locator('[name="websiteUrl"]').fill("https://example.com/");
  await details.locator('[name="instagramUrl"]').fill("https://www.instagram.com/browser_shop");
  await details.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(details.getByRole("status")).toBeVisible();

  await page.locator("summary").filter({ hasText: "Shop logo" }).click();
  const logoForm = page.locator("form").filter({ has: page.locator('[name="kind"][value="SHOP_LOGO"]') });
  const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#2563eb" } }).png().toBuffer();
  await logoForm.locator('[name="image"]').setInputFiles({ name: "test-logo.png", mimeType: "image/png", buffer: image });
  await logoForm.locator('[name="consent"]').check();
  await logoForm.getByRole("button", { name: "Upload image", exact: true }).click();
  await expect(logoForm.getByRole("status")).toBeVisible();
  await page.locator("summary").filter({ hasText: "Shop photo gallery" }).click();
  const galleryPanel = page.locator("details").filter({ has: page.locator('summary:text-is("Shop photo gallery")') });
  const galleryForm = galleryPanel.locator("form").filter({ has: page.locator('[name="kind"][value="SHOP_GALLERY"]') });
  for (const caption of ["Shop interior", "Work showcase"]) {
    await galleryForm.locator('[name="caption"]').fill(caption);
    await galleryForm.locator('[name="image"]').setInputFiles({ name: "gallery.png", mimeType: "image/png", buffer: image });
    await galleryForm.locator('[name="consent"]').check();
    await galleryForm.getByRole("button", { name: "Upload image", exact: true }).click();
    await expect(galleryPanel.getByText(caption, { exact: true })).toBeVisible();
  }
  const galleryAssetId = (await galleryPanel.getByRole("img", { name: "Shop interior", exact: true }).getAttribute("src"))!.match(/media\/([^?]+)/)![1]!;
  expect((await page.request.get(`http://localhost:3002/${slug}/gallery/${galleryAssetId}`)).status()).toBe(404);


  const service = page.locator("form").filter({ has: page.locator('[name="operation"][value="create"]') }).filter({ has: page.locator('[name="price"]') });
  await service.locator('[name="name"]').fill("Browser haircut");
  await service.locator('[name="price"]').fill("15");
  await service.getByRole("button").click();
  await expect(service.getByRole("status")).toBeVisible();

  const barber = page.locator("form").filter({ has: page.locator('[name="membershipId"]') });
  await barber.locator('[name="membershipId"]').selectOption({ index: 1 });
  await barber.locator('[name="displayName"]').fill("Browser barber");
  await barber.getByRole("button").click();
  await page.locator("summary").filter({ hasText: "Supported services" }).click();
  await expect(page.getByRole("button", { name: "Enable service", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Enable service", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enable service", exact: true })).toHaveCount(0);

  const tomorrow = new Date(Date.now() + 86_400_000);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut", year: "numeric", month: "2-digit", day: "2-digit" }).format(tomorrow);
  const day = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  await page.locator("summary").filter({ hasText: "Working hours and time off" }).click();
  const schedule = page.locator("form").filter({ has: page.locator('[name="operation"][value="period"]') });
  await schedule.locator('[name="dayOfWeek"]').selectOption(String(day));
  await schedule.locator('[name="startTime"]').fill("09:00");
  await schedule.locator('[name="endTime"]').fill("18:00");
  await schedule.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(schedule.getByRole("status")).toBeVisible();

  const policy = page.locator("form").filter({ has: page.locator('[name="operation"][value="policy"]') });
  for (const [field, value] of Object.entries({ slotIntervalMinutes: "15", minimumNoticeMinutes: "0", bufferAfterMinutes: "5", cancellationNoticeMinutes: "0", reschedulingNoticeMinutes: "0" })) await policy.locator(`[name="${field}"]`).fill(value);
  await policy.locator('[name="approvalMode"]').selectOption("AUTOMATIC");
  await policy.getByRole("button").click();
  await expect(policy.getByRole("status")).toBeVisible();

  const publication = page.locator("form").filter({ has: page.locator('[name="operation"][value="publish"]') });
  await publication.locator('[name="confirm"]').check();
  await publication.getByRole("button").click();
  await expect(page.locator('[name="operation"][value="unpublish"]')).toHaveCount(1);

  const context = await browser.newContext();
  const client = await context.newPage();
  observe(client);
  const logo = await client.request.get(`http://localhost:3002/${slug}/logo`);
  expect(logo.status()).toBe(200);
  expect(logo.headers()["content-type"]).toContain("image/jpeg");
  await client.goto(`http://localhost:3002/${slug}`);
  await expect(client.getByRole("link", { name: "Website", exact: true })).toHaveAttribute("href", "https://example.com/");
  await expect(client.getByRole("link", { name: "Instagram", exact: true })).toHaveAttribute("href", "https://www.instagram.com/browser_shop");
  await expect(client.getByRole("img", { name: "Shop interior", exact: true })).toBeVisible();
  const publicImage = await client.request.get(`http://localhost:3002/${slug}/gallery/${galleryAssetId}`);
  expect(publicImage.status()).toBe(200);
  expect(publicImage.headers()["cache-control"]).toBe("no-store");
  await galleryPanel.getByRole("listitem").filter({ hasText: "Shop interior" }).getByRole("button", { name: "Remove image", exact: true }).click();
  await expect(galleryPanel.getByText("Shop interior", { exact: true })).toHaveCount(0);
  expect((await client.request.get(`http://localhost:3002/${slug}/gallery/${galleryAssetId}`)).status()).toBe(404);
  await client.reload();
  await expect(client.getByRole("img", { name: "Shop interior", exact: true })).toHaveCount(0);
  await expect(client.getByRole("img", { name: "Work showcase", exact: true })).toBeVisible();

  await client.goto(`http://localhost:3002/${slug}/register`);
  await client.locator('[name="name"]').fill("Browser client");
  await client.locator('[name="phone"]').fill("+96170123457");
  await client.locator('[name="password"]').fill(password);
  await client.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(client).toHaveURL(new RegExp(`/${slug}/account`));
  await client.goto(`http://localhost:3002/${slug}/book`);
  await client.locator('[name="serviceId"][type="checkbox"]').check();
  await client.locator('[name="date"]').fill(date);
  await client.getByRole("button", { name: "Check availability", exact: true }).click();
  await client.locator('[name="slot"]').selectOption({ index: 1 });
  await client.getByRole("button", { name: "Book selected slot", exact: true }).click();
  await expect(client.getByRole("heading", { name: "Appointment created", exact: true })).toBeVisible();
  await client.goto(`http://localhost:3002/${slug}/account`);
  await expect(client.getByText("Browser haircut", { exact: false }).first()).toBeVisible();
  await client.reload();
  await expect(client.getByText("Browser haircut", { exact: false }).first()).toBeVisible();
  await page.goto(`/workspace?date=${date}`);
  await expect(page.locator('[id^="appointments-"]').getByRole("heading", { name: "Browser client · Browser barber", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record full payment", exact: true }).click();
  await page.getByRole("button", { name: "Confirm payment record", exact: true }).click();
  await expect(page.getByText("Paid in shop", { exact: true })).toBeVisible();
  // Add a second eligible barber to exercise transfer controls in the real client form.
  const transferDb = new Pool({ connectionString: process.env.DATABASE_URL });
  const transferBarberId = randomUUID();
  try {
    const shopId = (await transferDb.query("SELECT id FROM barbershops WHERE slug = $1", [slug])).rows[0].id;
    const transferUserId = randomUUID(), transferMembershipId = randomUUID();
    await transferDb.query("INSERT INTO users (id, email) VALUES ($1, $2)", [transferUserId, `transfer-${suffix}@example.invalid`]);
    await transferDb.query("INSERT INTO shop_memberships (id, barbershop_id, user_id, role) VALUES ($1, $2, $3, 'BARBER')", [transferMembershipId, shopId, transferUserId]);
    await transferDb.query("INSERT INTO barbers (id, barbershop_id, membership_id, display_name) VALUES ($1, $2, $3, 'Transfer barber')", [transferBarberId, shopId, transferMembershipId]);
    await transferDb.query("INSERT INTO barber_services (barbershop_id, barber_id, service_id) SELECT barbershop_id, $1, id FROM services WHERE barbershop_id = $2", [transferBarberId, shopId]);
    await transferDb.query("INSERT INTO barber_schedule_periods (id, barbershop_id, barber_id, day_of_week, kind, start_minute, end_minute) VALUES ($1, $2, $3, $4, 'WORK', 540, 1080)", [randomUUID(), shopId, transferBarberId, day]);
  } finally { await transferDb.end(); }
  await client.getByRole("button", { name: "Reschedule", exact: true }).click();
  await client.getByRole("button", { name: "Find open times", exact: true }).click();
  await client.locator('select[name="barberId"]').selectOption(transferBarberId);
  await expect(client.locator('select[name="startsAt"]')).toHaveCount(0);
  await client.getByRole("button", { name: "Find open times", exact: true }).click();
  await client.locator('select[name="startsAt"]').selectOption({ index: 1 });
  await client.getByRole("button", { name: "Move appointment", exact: true }).click();
  await expect(client.locator('select[name="startsAt"]')).toHaveCount(0);
  await client.reload();
  await expect(client.getByText("Confirmed · Paid in shop", { exact: true })).toBeVisible();
  await expect(client.getByText("Transfer barber", { exact: false }).first()).toBeVisible();
  await client.getByRole("button", { name: "Cancel appointment", exact: true }).click();
  await client.getByRole("button", { name: "Confirm cancellation", exact: true }).click();
  await expect(client.getByRole("button", { name: "Cancel appointment", exact: true })).toHaveCount(0);
  await client.goto(`http://localhost:3002/${slug}/account?view=history`);
  await expect(client.getByText("Cancelled · Paid in shop", { exact: true })).toBeVisible();
  await client.setViewportSize({ width: 375, height: 812 });
  await client.getByRole("combobox", { name: "Language", exact: true }).selectOption("ar");
  await expect(client.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await client.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const invite = page.locator("form").filter({ has: page.locator('[name="operation"][value="invite"]') });
  await invite.locator('[name="email"]').fill(`staff-${suffix}@example.invalid`);
  await invite.locator('[name="displayName"]').fill("Browser receptionist");
  await invite.locator('[name="role"]').selectOption("RECEPTIONIST");
  await invite.locator('[name="manageAppointments"]').check();
  await invite.getByRole("button", { name: "Invite staff member", exact: true }).click();
  const joinLink = invite.locator('a[href^="/join#code="]');
  await expect(joinLink).toBeVisible();
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  observe(staff);
  await staff.goto(`http://localhost:3001${await joinLink.getAttribute("href")}`);
  await expect(staff.locator('[name="code"]')).toHaveValue(/^[a-f0-9]{64}$/);
  expect(staff.url()).not.toContain("#code=");
  await staff.locator('[name="email"]').fill(`staff-${suffix}@example.invalid`);
  await staff.locator('[name="password"]').fill(password);
  await staff.locator("form").getByRole("button").click();
  await expect(staff).toHaveURL(/\/workspace/);
  await staff.goto(`http://localhost:3001/workspace?date=${date}`);
  await expect(staff.getByRole("heading", { name: "Browser client · Transfer barber", exact: true })).toBeVisible();
  await expect(staff.getByRole("button", { name: "Publish booking page", exact: true })).toHaveCount(0);
  await expect(staff.getByRole("button", { name: "Record full payment", exact: true })).toHaveCount(0);

  // The owner controls queue availability; authorized receptionists handle arrivals.
  await expect(staff.getByRole("button", { name: "Turn queue on", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Turn queue on", exact: true }).click();
  await expect(page.getByRole("button", { name: "Turn queue off", exact: true })).toBeVisible();
  await staff.reload();
  await expect(staff.getByRole("button", { name: "Turn queue off", exact: true })).toHaveCount(0);
  const queueForm = staff.locator("form").filter({ has: staff.locator('[name="operation"][value="enqueue"]') });
  for (const name of ["Queue first guest", "Queue second guest"]) {
    await queueForm.locator('[name="serviceId"]').check();
    await queueForm.locator('[name="identityMode"]').selectOption("guest");
    await queueForm.locator('[name="contactName"]').fill(name);
    await queueForm.getByRole("button", { name: "Add to queue", exact: true }).click();
    await expect(staff.getByRole("heading", { name: new RegExp(name) })).toBeVisible();
  }
  await staff.reload();
  const queue = staff.getByRole("region", { name: "Waiting queue", exact: true });
  await expect(queue.getByRole("heading", { level: 4 })).toHaveText(["Waiting queue", "1. Queue first guest", "2. Queue second guest"]);
  // Disabling new arrivals must preserve existing entries and allow removal.
  await page.getByRole("button", { name: "Turn queue off", exact: true }).click();
  await expect(page.getByRole("button", { name: "Turn queue on", exact: true })).toBeVisible();
  await staff.reload();
  await expect(queueForm).toHaveCount(0);
  const first = queue.getByRole("listitem").filter({ hasText: "Queue first guest" });
  await first.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(first).toHaveCount(0);
  await expect(queue.getByRole("heading", { name: "1. Queue second guest", exact: true })).toBeVisible();
  await staff.reload();
  await expect(queue.getByRole("heading", { name: "1. Queue second guest", exact: true })).toBeVisible();
  await queue.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(queue.getByRole("listitem")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Turn queue on", exact: true }).click();
  await expect(page.getByText("Nobody is waiting.", { exact: true })).toBeVisible();
  await staffContext.close();
  expect(errors).toEqual([]);
  await context.close();
  await ownerContext.close();
});
