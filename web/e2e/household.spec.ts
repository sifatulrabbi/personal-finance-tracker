import { expect, test, type Page } from "@playwright/test";
import { submitLogin } from "./login";

async function navigate(page: Page, name: string) {
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);
}

test("mobile household can record money and confirm bills", async ({
  page,
}, testInfo) => {
  const suffix = testInfo.project.name;
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-household-password");
  await submitLogin(page);
  await expect(
    page.getByRole("button", { name: "Open menu", exact: true }),
  ).toBeVisible();
  await navigate(page, "Wallets");
  await page.getByRole("button", { name: "Add wallet", exact: true }).click();
  await page.getByLabel("Wallet name").fill(`Cash ${suffix}`);
  await page.getByLabel("Opening balance").fill("10000");
  await page
    .getByRole("button", { name: "Create wallet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText(`Cash ${suffix}`, { exact: true }).first(),
  ).toBeVisible();
  await navigate(page, "Activity");
  await page.getByRole("button", { name: "Add record", exact: true }).click();
  await page
    .getByLabel("Wallet", { exact: true })
    .selectOption({ label: `Cash ${suffix} · BDT` });
  await page.getByLabel("Amount", { exact: true }).fill("125.50");
  await page.getByLabel("Note", { exact: true }).fill(`Groceries ${suffix}`);
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText(`Groceries ${suffix}`, { exact: true }),
  ).toBeVisible();
  await navigate(page, "Settings");
  await page.getByLabel("Default exchange rate (BDT per USD)").fill("125");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
  await navigate(page, "Bills");
  await page.getByRole("button", { name: "Add bill", exact: true }).click();
  await page.getByLabel("Bill name").fill(`Wi-Fi ${suffix}`);
  await page.getByLabel("Expected amount").fill("1000");
  await page
    .getByLabel("Wallet", { exact: true })
    .selectOption({ label: `Cash ${suffix} · BDT` });
  await page.getByRole("button", { name: "Create bill", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const due = page.getByRole("article", { name: `Due Wi-Fi ${suffix}` });
  await due.getByRole("button", { name: "Confirm payment" }).click();
  await page.getByLabel("Amount paid").fill("1020");
  await page.getByLabel("Note", { exact: true }).fill("Includes charge");
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(due).toHaveCount(0);
  await navigate(page, "Wallets");
  await expect(
    page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByText(`Cash ${suffix}`, { exact: true }) })
      .getByText("৳8,854.50", { exact: true }),
  ).toBeVisible();
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);
  await expect(
    page.getByRole("region", { name: "Wallets", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("wallets-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("credit debt, transfers, adjustments, and corrections stay consistent", async ({
  page,
}, testInfo) => {
  const suffix = testInfo.project.name;
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-household-password");
  await submitLogin(page);
  await expect(
    page.getByRole("button", { name: "Open menu", exact: true }),
  ).toBeVisible();
  const write = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api/v1${path}`, {
      headers: {
        "X-CSRF-Protection": "1",
        "Idempotency-Key": crypto.randomUUID(),
      },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  await write("/wallets", {
    name: `Bank ${suffix}`,
    type: "bank",
    opening_balance: "1000",
  });
  await write("/wallets", {
    name: `Card ${suffix}`,
    type: "card",
    card_type: "credit",
    credit_limit: "5000",
    opening_balance: "0",
  });
  await write("/wallets", {
    name: `USD ${suffix}`,
    type: "digital",
    currency: "USD",
    opening_balance: "100",
  });
  const settings = await (await page.request.get("/api/v1/settings")).json();
  const rateResponse = await page.request.put("/api/v1/settings", {
    headers: {
      "X-CSRF-Protection": "1",
      "Idempotency-Key": crypto.randomUUID(),
    },
    data: { rate: "125", version: settings.version },
  });
  expect(rateResponse.ok()).toBe(true);
  await page.reload();
  const record = async (
    kind: string,
    wallet: string,
    amount: string,
    note: string,
    to?: string,
  ) => {
    await navigate(page, "Activity");
    await page.getByRole("button", { name: "Add record", exact: true }).click();
    await page.getByLabel("Transaction type").selectOption(kind);
    await page
      .getByLabel(kind === "transfer" ? "From wallet" : "Wallet", {
        exact: true,
      })
      .selectOption({ label: wallet });
    if (to)
      await page
        .getByLabel("To wallet", { exact: true })
        .selectOption({ label: to });
    await page.getByLabel("Amount", { exact: true }).fill(amount);
    await page.getByLabel("Note", { exact: true }).fill(note);
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(note, { exact: true })).toBeVisible();
  };
  await record(
    "expense",
    `Card ${suffix} · BDT · Credit`,
    "200",
    `Card purchase ${suffix}`,
  );
  await record(
    "transfer",
    `Bank ${suffix} · BDT`,
    "150",
    `Repayment ${suffix}`,
    `Card ${suffix} · BDT · Credit`,
  );
  await record("income", `Bank ${suffix} · BDT`, "100", `Income ${suffix}`);
  await record(
    "transfer",
    `USD ${suffix} · USD`,
    "10",
    `Exchange ${suffix}`,
    `Bank ${suffix} · BDT`,
  );
  await navigate(page, "Wallets");
  const bank = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText(`Bank ${suffix}`, { exact: true }) });
  const card = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText(`Card ${suffix}`, { exact: true }) });
  await expect(bank.getByText("৳2,200.00", { exact: true })).toBeVisible();
  await expect(card.getByText("৳50.00", { exact: true })).toBeVisible();
  await bank.getByRole("button", { name: "Adjust balance" }).click();
  await page.getByLabel("Actual balance").fill("2100");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Reconciled bank balance");
  await page.getByRole("button", { name: "Record adjustment" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(bank.getByText("৳2,100.00", { exact: true })).toBeVisible();
  await navigate(page, "Activity");
  await page.getByText(`Card purchase ${suffix}`, { exact: true }).click();
  await page.getByRole("button", { name: "Correct record" }).click();
  await page.getByLabel("Amount", { exact: true }).fill("180");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByText(`Card purchase ${suffix}`, { exact: true }).click();
  await expect(
    page.getByText("Version 2 · ৳180.00", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Void record", exact: true }).click();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Purchase was canceled");
  await page.getByRole("button", { name: "Confirm void" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Wallets");
  await expect(card.getByText("৳−150.00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});

test("blank payment uses the scheduled amount and long names fit a small phone", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-household-password");
  await submitLogin(page);
  await expect(
    page.getByRole("button", { name: "Open menu", exact: true }),
  ).toBeVisible();
  const name = `${"LongWallet".repeat(9)}-${testInfo.project.name}`;
  const headers = {
    "X-CSRF-Protection": "1",
    "Idempotency-Key": crypto.randomUUID(),
  };
  const walletResponse = await page.request.post("/api/v1/wallets", {
    headers,
    data: { name, type: "physical", opening_balance: "2000" },
  });
  expect(walletResponse.ok()).toBe(true);
  const wallet = await walletResponse.json();
  const billName = `Default bill ${testInfo.project.name}`;
  const scheduleResponse = await page.request.post("/api/v1/schedules", {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: {
      name: billName,
      wallet_id: wallet.id,
      amount: "1000",
      frequency: "yearly",
      start_date: "2026-09-14",
    },
  });
  expect(scheduleResponse.ok()).toBe(true);
  await page.reload();
  await navigate(page, "Wallets");
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await navigate(page, "Bills");
  await page
    .getByRole("article", { name: `Due ${billName}` })
    .getByRole("button", { name: "Confirm payment" })
    .click();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await expect(page.getByLabel("Amount paid")).toHaveValue("");
  const bounds = await page.getByRole("dialog").boundingBox();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect(bounds?.y).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(320);
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(700);
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Wallets");
  await expect(
    page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByText(name, { exact: true }) })
      .getByText("৳1,000.00", { exact: true }),
  ).toBeVisible();
});
