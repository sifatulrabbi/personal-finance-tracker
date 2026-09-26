import { expect, test } from "./fixtures";
import {
  mainNavigation,
  navigate,
  openSheet,
  openWallet,
  payBill,
  signOut,
  submitLogin,
  toast,
  walletRow,
} from "./login";
import { addRecord } from "./records";

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
  await expect(mainNavigation(page)).toBeVisible();
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
  await addRecord(page, { wallet: `Cash ${suffix}`, amount: "125.50", note: `Groceries ${suffix}` });
  await expect(
    page.getByText(`Groceries ${suffix}`, { exact: true }),
  ).toBeVisible();
  await navigate(page, "Settings");
  await page.getByTestId("rate-row").click();
  await page.getByLabel("Default exchange rate (BDT per USD)").fill("125");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(toast(page, "Settings saved.")).toBeVisible();
  await navigate(page, "Bills");
  await page.getByRole("button", { name: "Add bill", exact: true }).click();
  await page.getByLabel("Bill name", { exact: true }).fill(`Wi-Fi ${suffix}`);
  await page.getByLabel("Expected amount").fill("1000");
  await page
    .getByLabel("Wallet", { exact: true })
    .selectOption({ label: `Cash ${suffix} · BDT` });
  await page.getByRole("button", { name: "Create bill", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const due = page.getByRole("article", { name: `Due Wi-Fi ${suffix}` });
  await payBill(page, `Wi-Fi ${suffix}`);
  await page.getByLabel("Amount paid").fill("1020");
  await page.getByLabel("Note", { exact: true }).fill("Includes charge");
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(due).toHaveCount(0);
  await navigate(page, "Wallets");
  await expect(
    walletRow(page, `Cash ${suffix}`).getByText("৳8,854.50", { exact: true }),
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
  await expect(mainNavigation(page)).toBeVisible();
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
    await addRecord(page, { kind: kind as "expense" | "income" | "transfer", wallet, to, amount, note });
    await expect(page.getByText(note, { exact: true })).toBeVisible();
  };
  await record("expense", `Card ${suffix}`, "200", `Card purchase ${suffix}`);
  // A credit card repayment is a transfer from the bank to the card, not an expense.
  await record("transfer", `Bank ${suffix}`, "150", `Repayment ${suffix}`, `Card ${suffix}`);
  await record("income", `Bank ${suffix}`, "100", `Income ${suffix}`);
  await record("transfer", `USD ${suffix}`, "10", `Exchange ${suffix}`, `Bank ${suffix}`);
  await navigate(page, "Wallets");
  const bank = walletRow(page, `Bank ${suffix}`);
  const card = walletRow(page, `Card ${suffix}`);
  await expect(bank.getByText("৳2,200.00", { exact: true })).toBeVisible();
  await expect(card.getByText("৳50.00", { exact: true })).toBeVisible();
  await openWallet(page, `Bank ${suffix}`);
  await page.getByRole("button", { name: "Adjust balance" }).click();
  await page.getByLabel("Actual balance").fill("2100");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Reconciled bank balance");
  await page.getByRole("button", { name: "Record adjustment" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("wallet-balance")).toHaveText("৳2,100.00");
  await page.getByRole("link", { name: "Back to Wallets" }).click();
  await expect(bank.getByText("৳2,100.00", { exact: true })).toBeVisible();
  await navigate(page, "Activity");
  await page.getByText(`Card purchase ${suffix}`, { exact: true }).click();
  await page.getByRole("button", { name: "Correct record" }).click();
  await page.getByLabel("Amount", { exact: true }).fill("180");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByText(`Card purchase ${suffix}`, { exact: true }).click();
  const latest = page.getByTestId("history-entry").first();
  await expect(latest).toContainText("Version 2 · Corrected");
  await expect(latest.getByTestId("history-amount")).toHaveText("−৳180.00");
  await page.getByRole("button", { name: "Void record", exact: true }).click();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Purchase was canceled");
  await page.getByRole("button", { name: "Confirm void" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Wallets");
  // An overpaid card shows its negative debt with the minus before the currency symbol.
  await expect(card.getByText("−৳150.00", { exact: true })).toBeVisible();
  await signOut(page);
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
  await expect(mainNavigation(page)).toBeVisible();
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
  await payBill(page, billName);
  expect(
    await page
      .getByRole("dialog")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await expect(page.getByLabel("Amount paid")).toHaveValue("");
  const bounds = await (await openSheet(page)).boundingBox();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect(bounds?.y).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(320);
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(700);
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Wallets");
  await expect(
    walletRow(page, name).getByText("৳1,000.00", { exact: true }),
  ).toBeVisible();
});

// ADR 0011: a debit card links to a bank wallet and spends from its balance.
test("a debit card links to its bank and spends from the bank's balance", async ({
  page,
}, testInfo) => {
  const suffix = testInfo.project.name;
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-household-password");
  await submitLogin(page);
  await navigate(page, "Wallets");
  await page.getByRole("button", { name: "Add wallet", exact: true }).click();
  await page.getByLabel("Wallet name").fill(`Bank ${suffix}`);
  await page.getByLabel("Wallet type").selectOption("bank");
  await page.getByLabel("Opening balance").fill("5000");
  await page.getByRole("button", { name: "Create wallet", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Add wallet", exact: true }).click();
  await page.getByLabel("Wallet name").fill(`Debit ${suffix}`);
  await page.getByLabel("Wallet type").selectOption("card");
  await expect(page.getByLabel("Opening balance")).toHaveCount(0);
  await page
    .getByLabel("Bank account")
    .selectOption({ label: `Bank ${suffix} · BDT` });
  await page.getByRole("button", { name: "Create wallet", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(`Spends from Bank ${suffix}`)).toBeVisible();

  const wallets = await (await page.request.get("/api/v1/wallets")).json();
  const card = wallets.find((w: { name: string }) => w.name === `Debit ${suffix}`);
  const response = await page.request.post("/api/v1/transactions", {
    headers: { "X-CSRF-Protection": "1", "Idempotency-Key": crypto.randomUUID() },
    data: { kind: "expense", wallet_id: card.id, amount: "200", date: "2026-09-14" },
  });
  expect(response.ok()).toBe(true);
  await page.reload();
  const bank = walletRow(page, `Bank ${suffix}`);
  await expect(bank.getByTestId("wallet-balance")).toContainText("4,800.00");
  // The card's own page names its bank and has no balance or adjustment of its own.
  await openWallet(page, `Debit ${suffix}`);
  await expect(page.getByTestId("wallet-detail")).toContainText(`Spends from Bank ${suffix}`);
  await expect(page.getByRole("button", { name: "Adjust balance" })).toHaveCount(0);
});
