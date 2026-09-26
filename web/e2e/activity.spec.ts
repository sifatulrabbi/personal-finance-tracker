import { apiWrite, dhakaToday, expect, test } from "./fixtures";
import { navigate, openSheet, openWallet, signIn, toast } from "./login";
import { addRecord, kindRadio, loadMoreWithKeyboard, openAddRecord, typeAmount, walletRadio } from "./records";
import type { Page } from "@playwright/test";

// Activity, the Add/Correct record sheet and record history (overhaul phase F3b). Every test
// starts on a fresh database.

async function signedIn(page: Page, path = "/activity") {
  await page.goto(path);
  await signIn(page);
}

function wallet(page: Page, name: string, extra: object = {}) {
  return apiWrite(page, "/wallets", { name, type: "physical", opening_balance: "10000", ...extra });
}

function record(page: Page, data: object) {
  return apiWrite(page, "/transactions", { kind: "expense", amount: "10", date: dhakaToday(), note: "", ...data });
}

async function setRate(page: Page, rate: string) {
  const settings = await (await page.request.get("/api/v1/settings")).json();
  await apiWrite(page, "/settings", { rate, version: settings.version }, "PUT");
}

function yesterday() {
  const [y, m, d] = dhakaToday().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

const rows = (page: Page) => page.getByTestId("activity-row");
const row = (page: Page, text: string) => rows(page).filter({ hasText: text });

test("records are grouped under sticky Dhaka day headers", async ({ page }) => {
  await signedIn(page);
  const cash = await wallet(page, "Cash");
  await record(page, { wallet_id: cash.id, note: "Today tea" });
  await record(page, { wallet_id: cash.id, note: "Yesterday bus", date: yesterday() });
  await record(page, { wallet_id: cash.id, note: "New year dinner", date: "2025-12-31" });
  await page.reload();
  const days = page.getByTestId("activity-day");
  await expect(days).toHaveCount(3);
  await expect(days.nth(0).getByRole("heading")).toHaveText("Today");
  await expect(days.nth(1).getByRole("heading")).toHaveText("Yesterday");
  await expect(days.nth(2).getByRole("heading")).toHaveText(/^Wed 31 Dec( 2025)?$/);
  // Today's group holds today's record and the opening balance, newest first.
  await expect(days.nth(0).getByTestId("activity-row")).toHaveCount(2);
  await expect(days.nth(0).getByTestId("activity-row").first()).toContainText("Today tea");
  await expect(days.nth(2)).toContainText("New year dinner");
  // Rows show a short author name, never the full email.
  await expect(row(page, "Today tea")).toContainText("You");
  await expect(row(page, "Today tea")).not.toContainText("test@example.test");
  expect(await days.nth(0).getByRole("heading").evaluate((h) => getComputedStyle(h).position)).toBe("sticky");
});

test("filters live in the URL, survive a reload, and open from a deep link", async ({ page }) => {
  await signedIn(page);
  const cash = await wallet(page, "Cash");
  const bank = await wallet(page, "Bank", { type: "bank" });
  await record(page, { wallet_id: cash.id, note: "Cash groceries", category_id: "expense-groceries" });
  await record(page, { wallet_id: bank.id, note: "Bank rent", category_id: "expense-apartment-rent" });
  await record(page, { kind: "income", wallet_id: bank.id, note: "Salary", date: "2025-06-10" });
  await record(page, { kind: "transfer", wallet_id: bank.id, to_wallet_id: cash.id, note: "Cash withdrawal" });
  await page.reload();
  await expect(row(page, "Salary")).toBeVisible();

  await page.getByRole("group", { name: "Record type" }).getByRole("radio", { name: "Expenses" }).check();
  await expect(page).toHaveURL(/kind=expense/);
  await expect(row(page, "Salary")).toHaveCount(0);
  await expect(row(page, "Cash withdrawal")).toHaveCount(0);
  await page.getByLabel("Filter by wallet").selectOption({ label: "Cash" });
  await expect(page).toHaveURL(new RegExp(`wallet=${cash.id}`));
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, "Cash groceries")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("group", { name: "Record type" }).getByRole("radio", { name: "Expenses" })).toBeChecked();
  await expect(page.getByLabel("Filter by wallet")).toHaveValue(cash.id);
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, "Cash groceries")).toBeVisible();

  // Category filter.
  await page.getByLabel("Filter by wallet").selectOption({ label: "All wallets" });
  await page.getByLabel("Filter by category").selectOption({ label: "Apartment rent" });
  await expect(page).toHaveURL(/category=expense-apartment-rent/);
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, "Bank rent")).toBeVisible();

  // A deep link to income in June 2025.
  await page.goto("/activity?kind=income&from=2025-06-01&to=2025-06-30");
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, "Salary")).toBeVisible();
  await expect(page.getByRole("button", { name: "Date range: Jun 2025" })).toBeVisible();

  // The date sheet: "Any date" clears the range and keeps the kind.
  await page.getByRole("button", { name: /^Date range/ }).click();
  const sheet = await openSheet(page);
  await sheet.getByRole("button", { name: "Any date", exact: true }).click();
  await expect(page).not.toHaveURL(/from=/);
  await expect(page).toHaveURL(/kind=income/);

  // A range with nothing in it shows a filtered empty state with a way out.
  await page.goto("/activity?kind=transfer&from=2020-01-01&to=2020-01-31");
  await expect(page.getByText("No records match")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(row(page, "Salary")).toBeVisible();
});

test("the date range sheet applies a typed range", async ({ page }) => {
  await signedIn(page);
  const cash = await wallet(page, "Cash");
  await record(page, { wallet_id: cash.id, note: "March shoes", date: "2025-03-14" });
  await record(page, { wallet_id: cash.id, note: "April phone", date: "2025-04-02" });
  await page.reload();
  await page.getByRole("button", { name: /^Date range/ }).click();
  const sheet = await openSheet(page);
  await sheet.getByLabel("From", { exact: true }).fill("2025-03-01");
  await sheet.getByLabel("To", { exact: true }).fill("2025-03-31");
  await sheet.getByRole("button", { name: "Apply dates" }).click();
  await expect(page).toHaveURL(/from=2025-03-01&to=2025-03-31/);
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, "March shoes")).toBeVisible();
});

test("scrolling loads older records, and a save keeps every loaded row", async ({ page }) => {
  // 110 records are written through the API first.
  test.setTimeout(60_000);
  await signedIn(page);
  const cash = await wallet(page, "Cash");
  for (let i = 0; i < 110; i++)
    await record(page, { wallet_id: cash.id, note: `Old record ${i}`, date: "2026-01-15" });
  await page.reload();
  const old = page.getByText(/^Old record \d+$/);
  await expect(old).toHaveCount(49);
  // The button is the accessible way to load the next page.
  await loadMoreWithKeyboard(page);
  await expect(old).toHaveCount(99);
  // Infinite scroll: reaching the end loads the next page without a click.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(old).toHaveCount(110);
  await expect(page.getByRole("button", { name: "Load more records" })).toHaveCount(0);

  await addRecord(page, { amount: "12.50", note: "Saved after paging" });
  await expect(page.getByText("Saved after paging", { exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(old).toHaveCount(110);
  await expect(page.getByText("Old record 0", { exact: true })).toBeAttached();
});

test("expense, income and transfer are added with the keyboard in the new sheet", async ({ page }) => {
  await signedIn(page);
  await wallet(page, "Cash");
  await wallet(page, "Bank", { type: "bank", opening_balance: "50000" });
  await wallet(page, "Payoneer", { type: "digital", currency: "USD", opening_balance: "300" });
  await setRate(page, "120");
  await page.reload();

  // Expense: type the amount key by key and submit with Enter.
  let sheet = await openAddRecord(page);
  await expect(kindRadio(sheet, "expense")).toBeChecked();
  await walletRadio(sheet, "Wallet", "Cash").check();
  await sheet.getByLabel("Note", { exact: true }).fill("Keyboard expense");
  await typeAmount(sheet, "1250.75");
  await sheet.getByLabel("Amount", { exact: true }).press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(toast(page, "Record saved")).toBeVisible();
  await expect(row(page, "Keyboard expense")).toContainText("−৳1,250.75");

  // Income on a USD wallet: the rate field appears, empty means the default rate.
  sheet = await openAddRecord(page);
  await kindRadio(sheet, "income").check();
  await walletRadio(sheet, "Wallet", "Payoneer").check();
  await expect(sheet.getByLabel("Exchange rate (BDT per USD)")).toHaveAttribute("placeholder", /120/);
  await typeAmount(sheet, "40");
  await sheet.getByLabel("Note", { exact: true }).fill("Freelance");
  await sheet.getByRole("button", { name: "Yesterday", exact: true }).click();
  await sheet.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row(page, "Freelance")).toContainText("+$40.00");
  await expect(page.getByTestId("activity-day").filter({ hasText: "Freelance" }).getByRole("heading")).toHaveText("Yesterday");

  // Transfer across currencies: received amount and rate appear only then.
  sheet = await openAddRecord(page);
  await kindRadio(sheet, "transfer").check();
  await walletRadio(sheet, "From wallet", "Bank").check();
  await walletRadio(sheet, "To wallet", "Cash").check();
  await expect(sheet.getByLabel("Amount received (BDT)")).toHaveCount(0);
  await walletRadio(sheet, "From wallet", "Payoneer").check();
  await expect(sheet.getByLabel("Amount received (BDT)")).toBeVisible();
  await typeAmount(sheet, "10");
  await sheet.getByLabel("Amount received (BDT)").pressSequentially("1,190");
  await sheet.getByLabel("Note", { exact: true }).fill("Moved dollars");
  await sheet.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row(page, "Moved dollars")).toContainText("$10.00");
  await expect(row(page, "Moved dollars")).toContainText("Payoneer → Cash");
  await row(page, "Moved dollars").click();
  await expect(page.getByRole("dialog")).toContainText("৳1,190.00");
});

test("a server field error is shown at its field and the sheet keeps the values", async ({ page }) => {
  await signedIn(page);
  await wallet(page, "Payoneer", { type: "digital", currency: "USD", opening_balance: "100" });
  await page.reload();
  const sheet = await openAddRecord(page);
  // A malformed amount is caught before sending, at the amount field.
  await typeAmount(sheet, "12,50");
  await sheet.getByRole("button", { name: "Save record", exact: true }).click();
  const amount = sheet.getByLabel("Amount", { exact: true });
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await expect(sheet.locator('[data-field="amount"]')).toContainText("Use a dot for decimals");
  // No default rate is set: the server answers rate_required on the rate field.
  await typeAmount(sheet, "12.50");
  await sheet.getByLabel("Note", { exact: true }).fill("Needs a rate");
  await expect(sheet.getByLabel("Exchange rate (BDT per USD)")).toHaveAttribute("placeholder", "No default rate set");
  await sheet.getByRole("button", { name: "Save record", exact: true }).click();
  const rate = sheet.locator('[data-field="rate"]');
  await expect(rate).toContainText("Enter a BDT per USD rate or set a default rate in Settings.");
  await expect(sheet.getByLabel("Exchange rate (BDT per USD)")).toHaveAttribute("aria-invalid", "true");
  await expect(sheet.getByLabel("Exchange rate (BDT per USD)")).toBeFocused();
  await expect(amount).toHaveValue("12.50");
  await expect(sheet.getByLabel("Note", { exact: true })).toHaveValue("Needs a rate");
  await sheet.getByLabel("Exchange rate (BDT per USD)").pressSequentially("121.5");
  await expect(rate).not.toContainText("Enter a BDT per USD rate");
  await sheet.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row(page, "Needs a rate")).toContainText("−$12.50");
});

// Regression (frontend review): every revision was shown in the current wallet's currency.
test("history shows each revision in its own wallet's currency", async ({ page }) => {
  await signedIn(page);
  await wallet(page, "Cash");
  const usd = await wallet(page, "Payoneer", { type: "digital", currency: "USD", opening_balance: "100" });
  await setRate(page, "122.50");
  await record(page, { wallet_id: usd.id, amount: "20", note: "Phone case" });
  await page.reload();
  await row(page, "Phone case").click();
  await page.getByRole("button", { name: "Correct record" }).click();
  const sheet = page.getByRole("dialog");
  await walletRadio(sheet, "Wallet", "Cash").check();
  await typeAmount(sheet, "2450");
  await sheet.getByLabel("Reason for correction").fill("Paid in cash");
  await sheet.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(toast(page, "Correction saved")).toBeVisible();
  await expect(row(page, "Phone case")).toContainText("−৳2,450.00");
  await row(page, "Phone case").click();
  const entries = page.getByRole("dialog").getByTestId("history-entry");
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(0)).toContainText("Version 2 · Corrected");
  await expect(entries.nth(0).getByTestId("history-amount")).toHaveText("−৳2,450.00");
  await expect(entries.nth(0)).toContainText("Reason: Paid in cash");
  await expect(entries.nth(1)).toContainText("Version 1 · Recorded");
  await expect(entries.nth(1).getByTestId("history-amount")).toHaveText("−$20.00");
  await expect(entries.nth(1)).toContainText("Payoneer");
});

test("a stale correction reloads the latest version and keeps the user's edits for review", async ({ page }) => {
  await signedIn(page);
  const cash = await wallet(page, "Cash");
  const original = await record(page, { wallet_id: cash.id, amount: "200", note: "Market" });
  await page.reload();
  await row(page, "Market").click();
  await page.getByRole("button", { name: "Correct record" }).click();
  const sheet = page.getByRole("dialog");
  await typeAmount(sheet, "180");
  await sheet.getByLabel("Reason for correction").fill("Receipt says 180");
  // Someone else saves a change between opening the form and saving it.
  await apiWrite(
    page,
    `/transactions/${original.id}`,
    { kind: "expense", wallet_id: cash.id, amount: "200", date: original.date, note: "Market with Rumana", version: original.version },
    "PUT",
  );
  await sheet.getByRole("button", { name: "Save correction" }).click();
  await expect(sheet.getByText("Someone changed this record")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Save correction" })).toBeDisabled();
  await sheet.getByRole("button", { name: "Load latest and keep my edits" }).click();
  await expect(sheet.getByText("Loaded version 2")).toBeVisible();
  // Their note arrives, the user's amount and reason stay; nothing is saved yet.
  await expect(sheet.getByLabel("Note", { exact: true })).toHaveValue("Market with Rumana");
  await expect(sheet.getByLabel("Amount", { exact: true })).toHaveValue("180");
  await expect(sheet.getByLabel("Reason for correction")).toHaveValue("Receipt says 180");
  const history = await (await page.request.get(`/api/v1/transactions/${original.id}/history`)).json();
  expect(history).toHaveLength(2);
  await sheet.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row(page, "Market with Rumana")).toContainText("−৳180.00");
  const after = await (await page.request.get(`/api/v1/transactions/${original.id}/history`)).json();
  expect(after).toHaveLength(3);
  expect(after[2]).toMatchObject({ amount: "180.00", note: "Market with Rumana", reason: "Receipt says 180" });
});

test("voided records stay visible, struck through, and reconciliation records cannot be corrected", async ({ page }) => {
  await signedIn(page);
  const cash = await wallet(page, "Cash");
  const rickshaw = await record(page, { wallet_id: cash.id, amount: "600", note: "Rickshaw" });
  await apiWrite(page, `/transactions/${rickshaw.id}/void`, { version: rickshaw.version, reason: "Entered twice" });
  await page.reload();
  const voided = row(page, "Rickshaw");
  await expect(voided).toBeVisible();
  await expect(voided).toHaveAttribute("data-voided", "");
  await expect(voided.getByText("Voided", { exact: true })).toBeVisible();
  const amount = voided.locator("[data-money]");
  await expect(amount).toHaveAttribute("data-voided", "");
  expect(await amount.evaluate((element) => getComputedStyle(element).textDecorationLine)).toContain("line-through");
  expect(
    await voided.getByText("Rickshaw", { exact: true }).evaluate((element) => getComputedStyle(element).textDecorationLine),
  ).toContain("line-through");
  await voided.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("This record was voided.", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Correct record" })).toHaveCount(0);
  await expect(dialog.getByTestId("history-entry").first()).toContainText("Version 2 · Voided");
  await expect(dialog.getByTestId("history-entry").first()).toContainText("Reason: Entered twice");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // The opening balance is a reconciliation record: explained, never correctable.
  await row(page, "Opening balance").click();
  await expect(dialog.getByText(/cannot be corrected or voided/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Correct record" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Void record" })).toHaveCount(0);
});

test("a wallet page lists its own records, and a bank's include its debit card's", async ({ page }) => {
  await signedIn(page);
  const bank = await wallet(page, "City Bank", { type: "bank", opening_balance: "50000" });
  const cash = await wallet(page, "Pocket cash");
  const card = await apiWrite(page, "/wallets", { name: "Debit", type: "card", card_type: "debit", bank_wallet_id: bank.id });
  await record(page, { wallet_id: bank.id, amount: "20", note: "Bank fee" });
  await record(page, { wallet_id: card.id, amount: "850", note: "Card groceries" });
  await record(page, { wallet_id: cash.id, amount: "30", note: "Cash tea" });
  await record(page, { kind: "transfer", wallet_id: bank.id, to_wallet_id: cash.id, amount: "2000", note: "ATM" });
  await page.reload();
  await navigate(page, "Wallets");
  await openWallet(page, "City Bank");
  const details = page.getByRole("region", { name: "Wallet details", exact: true });
  for (const note of ["Bank fee", "Card groceries", "ATM"]) await expect(row(page, note)).toBeVisible();
  await expect(row(page, "Cash tea")).toHaveCount(0);
  await expect(details.getByTestId("activity-day").first().getByRole("heading")).toHaveText("Today");

  // Records open and correct in place; the wallet's list shows the saved version.
  await row(page, "Card groceries").click();
  await page.getByRole("button", { name: "Correct record" }).click();
  const sheet = page.getByRole("dialog");
  await typeAmount(sheet, "800");
  await sheet.getByRole("button", { name: "Save correction" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(row(page, "Card groceries")).toContainText("−৳800.00");

  // The same list in Activity, as a filter.
  await page.getByRole("link", { name: "Filter in Activity" }).click();
  await expect(page).toHaveURL(new RegExp(`/activity\\?wallet=${bank.id}$`));
  await expect(page.getByLabel("Filter by wallet")).toHaveValue(bank.id);
  await expect(row(page, "Card groceries")).toBeVisible();
  await expect(row(page, "Cash tea")).toHaveCount(0);

  // A debit card's own page shows only its own records.
  await navigate(page, "Wallets");
  await openWallet(page, "Debit");
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, "Card groceries")).toBeVisible();
});

test("voiding from the detail sheet needs a reason and keeps the record listed", async ({ page }) => {
  await signedIn(page);
  const cash = await wallet(page, "Cash");
  await record(page, { wallet_id: cash.id, amount: "75", note: "Snacks" });
  await page.reload();
  await row(page, "Snacks").click();
  await page.getByRole("button", { name: "Void record" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Confirm void" }).click();
  await expect(dialog.getByText("Write why this record is being voided.")).toBeVisible();
  await dialog.getByLabel("Reason", { exact: true }).fill("Returned");
  await dialog.getByRole("button", { name: "Confirm void" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(toast(page, "Record voided")).toBeVisible();
  await expect(row(page, "Snacks")).toHaveAttribute("data-voided", "");
});
