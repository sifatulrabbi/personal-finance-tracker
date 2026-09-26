import { apiWrite, dhakaToday, expect, test } from "./fixtures";
import {
  chooseMonth,
  dueBill,
  editTarget,
  monthText,
  navigate,
  openWallet,
  payBill,
  signIn,
  skipBill,
  toast,
  walletRow,
} from "./login";
import type { Page } from "@playwright/test";

// The F3a screens: Home, grouped Wallets with a detail route, Bills sections, the Monthly
// month stepper and inherited target, and the readable change log.

async function signedIn(page: Page, path = "/") {
  await page.goto(path);
  await signIn(page);
}

// A Dhaka calendar date a number of days from today.
function dhakaDay(offset: number) {
  const [y, m, d] = dhakaToday().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}

function previousMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

test("sign-in lands on Home, whose figures are the server's summary", async ({ page }) => {
  await signedIn(page);
  await expect(page).toHaveURL(/\/home$/);
  const cash = await apiWrite(page, "/wallets", { name: "Cash", type: "physical", opening_balance: "10000" });
  await apiWrite(page, "/wallets", { name: "Bank", type: "bank", opening_balance: "5000" });
  await apiWrite(page, "/wallets", {
    name: "Visa",
    type: "card",
    card_type: "credit",
    credit_limit: "5000",
    opening_balance: "1200",
  });
  await apiWrite(page, "/transactions", {
    kind: "expense",
    wallet_id: cash.id,
    amount: "250",
    date: dhakaToday(),
    note: "Groceries today",
  });
  const month = dhakaToday().slice(0, 7);
  const monthly = await (await page.request.get(`/api/v1/monthly?month=${month}`)).json();
  await apiWrite(page, `/monthly/${month}/target`, { amount: "200", version: monthly.target.version }, "PUT");
  await apiWrite(page, "/schedules", {
    name: "Rent",
    wallet_id: cash.id,
    amount: "1000",
    frequency: "monthly",
    start_date: dhakaDay(-3),
  });
  const summary = await (await page.request.get("/api/v1/summary")).json();
  const bdt = summary.totals.find((t: { currency: string }) => t.currency === "BDT");
  expect(bdt).toEqual({ currency: "BDT", cash: "14750.00", card_debt: "1200.00", available_credit: "3800.00" });
  expect(summary.bills.due_count).toBe(1);

  await page.reload();
  await expect(page.getByTestId("home-cash-BDT")).toHaveText("৳14,750.00");
  await expect(page.getByTestId("home-debt-BDT")).toHaveText("৳1,200.00");
  await expect(page.getByTestId("home-available-BDT")).toHaveText("৳3,800.00");
  // No USD money, so no USD line.
  await expect(page.getByTestId("home-totals-USD")).toHaveCount(0);
  await expect(page.getByTestId("home-spent")).toHaveText("৳250.00");
  await expect(page.getByTestId("home-target")).toHaveText("৳200.00");
  await expect(page.getByTestId("home-over-target")).toHaveText("৳50.00 over target");
  await expect(page.getByRole("progressbar", { name: "Spent against this month's target" })).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
  await expect(page.getByTestId("home-due-count")).toHaveText("1 bill due");
  await expect(page.getByTestId("home-bills")).toContainText("Oldest 3 days overdue");
  await expect(page.getByTestId("home-recent").getByTestId("activity-row")).toHaveCount(
    summary.recent.length,
  );
  await expect(page.getByTestId("legacy-debit-notice")).toHaveCount(0);

  // A refresh keeps the loaded figures on screen: no skeleton comes back.
  const skeletons = page.getByTestId("home-skeleton");
  const refresh = page.waitForResponse((r) => r.url().endsWith("/api/v1/summary"));
  await page.getByRole("button", { name: "Refresh records" }).click();
  await expect(skeletons).toHaveCount(0);
  await refresh;
  await expect(page.getByTestId("home-cash-BDT")).toHaveText("৳14,750.00");

  // The bills row goes to Bills; a recent record goes to Activity.
  await page.getByTestId("home-bills").click();
  await expect(page).toHaveURL(/\/bills$/);
  await navigate(page, "Home");
  await page.getByTestId("home-recent").getByText("Groceries today").click();
  await expect(page).toHaveURL(/\/activity$/);
});

test("Home updates after a record is saved from the Add button", async ({ page }) => {
  await signedIn(page);
  await apiWrite(page, "/wallets", { name: "Cash", type: "physical", opening_balance: "1000" });
  await page.reload();
  await expect(page.getByTestId("home-cash-BDT")).toHaveText("৳1,000.00");
  await page.getByRole("button", { name: "Add record", exact: true }).click();
  await page.getByLabel("Amount", { exact: true }).fill("100");
  await page.getByLabel("Note", { exact: true }).fill("Lunch");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(toast(page, "Record saved")).toBeVisible();
  await expect(page.getByTestId("home-cash-BDT")).toHaveText("৳900.00");
  await expect(page.getByTestId("home-spent")).toHaveText("৳100.00");
  await expect(page.getByTestId("home-recent")).toContainText("Lunch");
});

test("wallets are grouped, open a detail page, and survive a deep-link reload", async ({ page }) => {
  await signedIn(page, "/wallets");
  const bank = await apiWrite(page, "/wallets", { name: "City Bank", type: "bank", opening_balance: "5000" });
  await apiWrite(page, "/wallets", { name: "Pocket cash", type: "physical", opening_balance: "300" });
  await apiWrite(page, "/wallets", { name: "bKash", type: "digital", opening_balance: "40" });
  const visa = await apiWrite(page, "/wallets", {
    name: "Visa",
    type: "card",
    card_type: "credit",
    credit_limit: "5000",
    opening_balance: "1250",
  });
  await apiWrite(page, "/wallets", { name: "Debit", type: "card", card_type: "debit", bank_wallet_id: bank.id });
  const old = await apiWrite(page, "/wallets", { name: "Old purse", type: "physical" });
  await apiWrite(page, `/wallets/${old.id}`, { ...old, archived: true }, "PUT");
  await page.reload();

  const group = (name: string) => page.getByRole("region", { name, exact: true });
  await expect(group("Cash & bank").getByTestId("wallet-row")).toHaveCount(2);
  await expect(group("Cash & bank")).toContainText("Pocket cash");
  await expect(group("Cash & bank")).toContainText("City Bank");
  await expect(group("Digital").getByTestId("wallet-row")).toHaveCount(1);
  await expect(group("Cards").getByTestId("wallet-row")).toHaveCount(2);
  await expect(walletRow(page, "Visa")).toContainText("৳1,250.00");
  await expect(walletRow(page, "Visa")).toContainText("৳3,750.00 available of ৳5,000.00");
  await expect(walletRow(page, "Debit")).toContainText("Spends from City Bank");
  // Archived wallets are folded away at the bottom.
  await expect(walletRow(page, "Old purse")).toHaveCount(0);
  await page.getByRole("button", { name: "Show archived wallets (1)" }).click();
  await expect(
    page.getByRole("region", { name: "Archived wallets" }).getByTestId("wallet-row"),
  ).toContainText("Old purse");

  await openWallet(page, "Visa");
  await expect(page).toHaveURL(new RegExp(`/wallets/${visa.id}$`));
  await expect(page.getByTestId("wallet-balance")).toHaveText("৳1,250.00");
  await expect(page.getByRole("progressbar", { name: "Credit used" })).toHaveAttribute("aria-valuenow", "25");
  // The Wallets tab stays marked on a wallet's page.
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Wallets", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Visa");
  await expect(page.getByTestId("wallet-balance")).toHaveText("৳1,250.00");
  await expect(page.getByRole("link", { name: "Filter in Activity" })).toBeVisible();

  // Archive from the detail page, with a confirmation and a toast.
  await page.getByRole("link", { name: "Back to Wallets" }).click();
  await openWallet(page, "City Bank");
  await page.getByRole("button", { name: "Archive wallet" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Archive wallet" }).click();
  await expect(toast(page, "Wallet archived")).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore wallet" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Wallets" }).click();
  await expect(page.getByRole("button", { name: "Show archived wallets (2)" })).toBeVisible();

  await page.goto("/wallets/does-not-exist");
  await expect(page.getByText("Wallet not found", { exact: true })).toBeVisible();
});

test("bills are split into overdue, due soon, upcoming, and history", async ({ page }) => {
  await signedIn(page, "/bills");
  const cash = await apiWrite(page, "/wallets", { name: "Cash", type: "physical", opening_balance: "50000" });
  const schedule = (name: string, start: string, frequency = "yearly") =>
    apiWrite(page, "/schedules", { name, wallet_id: cash.id, amount: "100", frequency, start_date: start });
  await schedule("Rent", dhakaDay(-5));
  await schedule("Water", dhakaDay(-1));
  await schedule("Wi-Fi", dhakaDay(0));
  await schedule("Gas", dhakaDay(3));
  await schedule("School", dhakaDay(20));
  await page.reload();

  const overdue = page.getByRole("region", { name: "Overdue", exact: true });
  await expect(overdue.getByRole("article")).toHaveCount(2);
  const late = dueBill(page, "Rent").getByTestId("due-label");
  await expect(late).toHaveText("5 days overdue");
  await expect(dueBill(page, "Water").getByTestId("due-label")).toHaveText("1 day overdue");
  // The overdue label uses the warning color token, not plain text color.
  const warning = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--warning").trim(),
  );
  const rgb = (hex: string) =>
    `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
  await expect(late).toHaveCSS("color", rgb(warning));

  const soon = page.getByRole("region", { name: "Due soon", exact: true });
  await expect(soon.getByRole("article", { name: "Due Wi-Fi" })).toContainText("Due today");
  await expect(soon.getByTestId("upcoming-row")).toContainText("Due in 3 days");
  await expect(
    page.getByRole("region", { name: "Upcoming", exact: true }).getByTestId("upcoming-row"),
  ).toContainText("Due in 20 days");

  await payBill(page, "Rent");
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  await expect(toast(page, "Payment recorded")).toBeVisible();
  await expect(dueBill(page, "Rent")).toHaveCount(0);
  await expect(page.getByTestId("bill-history")).toContainText("Rent");
  await expect(page.getByTestId("bill-history")).toContainText(`Paid · due`);

  await skipBill(page, "Water");
  await page.getByLabel("Reason", { exact: true }).fill("Meter not read");
  await page.getByRole("button", { name: "Skip this occurrence" }).click();
  await expect(toast(page, "Bill skipped")).toBeVisible();
  await expect(dueBill(page, "Water")).toHaveCount(0);
  await page.getByRole("radio", { name: "Skipped" }).click();
  await expect(page.getByTestId("bill-history")).toContainText("Water");
  await expect(page.getByTestId("bill-history")).not.toContainText("Rent");

  // Pausing a schedule is reachable from the screen.
  await page.getByRole("button", { name: "Edit School", exact: true }).click();
  await page.getByLabel("Status").selectOption("inactive");
  await page.getByRole("button", { name: "Save bill", exact: true }).click();
  await expect(toast(page, "Bill saved")).toBeVisible();
  await expect(page.getByTestId("schedule-row").filter({ hasText: "School" })).toContainText("Paused");
  await expect(page.getByRole("region", { name: "Upcoming", exact: true })).toHaveCount(0);
});

test("the month stepper and picker change months on both engines", async ({ page }) => {
  await signedIn(page, "/monthly");
  const current = dhakaToday().slice(0, 7);
  const label = page.getByTestId("monthly-month");
  await expect(label).toHaveText(monthText(current));
  const previous = page.waitForResponse((r) => r.url().includes(`month=${previousMonth(current)}`));
  await page.getByRole("button", { name: "Previous month" }).click();
  await previous;
  await expect(label).toHaveText(monthText(previousMonth(current)));
  await page.getByRole("button", { name: "Next month" }).click();
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(label).toHaveText(monthText(nextMonth(current)));
  const picked = page.waitForResponse((r) => r.url().includes("month=2024-02"));
  await chooseMonth(page, "2024-02");
  await picked;
  await expect(page.getByTestId("monthly-total")).toHaveText("৳0.00");
  // Across a year boundary with the stepper.
  await chooseMonth(page, "2025-01");
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(label).toHaveText("December 2024");
});

test("a month without its own target shows where it is carried over from", async ({ page }) => {
  await signedIn(page);
  const current = dhakaToday().slice(0, 7);
  const earlier = previousMonth(current);
  const before = await (await page.request.get(`/api/v1/monthly?month=${earlier}`)).json();
  await apiWrite(page, `/monthly/${earlier}/target`, { amount: "3000", version: before.target.version }, "PUT");
  await navigate(page, "Monthly spending");
  const hint = page.getByTestId("inherited-hint");
  await expect(hint).toContainText(`Target carried over from ${monthText(earlier)}`);
  await expect(page.getByTestId("monthly-target")).toHaveText("৳3,000.00");
  await editTarget(page);
  await expect(page.getByLabel("Monthly target (BDT)")).toHaveValue("3000.00");
  await page.getByLabel("Monthly target (BDT)").fill("4500");
  await page.getByRole("button", { name: "Save target", exact: true }).click();
  await expect(toast(page, "Target saved")).toBeVisible();
  await expect(hint).toHaveCount(0);
  await expect(page.getByTestId("monthly-target")).toHaveText("৳4,500.00");
  // The earlier month keeps its own target.
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByTestId("monthly-target")).toHaveText("৳3,000.00");
  await expect(hint).toHaveCount(0);
});

test("the change log reads as sentences with Dhaka times", async ({ page }) => {
  await signedIn(page, "/settings");
  const settings = await (await page.request.get("/api/v1/settings")).json();
  const updated = await apiWrite(page, "/settings", { rate: "125", version: settings.version }, "PUT");
  await apiWrite(page, "/settings", { rate: "126.5", version: updated.version }, "PUT");
  const wallet = await apiWrite(page, "/wallets", { name: "Spare cash", type: "physical" });
  await apiWrite(page, `/wallets/${wallet.id}`, { ...wallet, archived: true }, "PUT");
  await page.reload();
  await page.getByRole("button", { name: "View change log" }).click();
  const entries = page.getByTestId("change-log-entry");
  await expect(entries.first()).toBeVisible();
  await expect(entries.nth(0)).toContainText("You archived the wallet “Spare cash”.");
  await expect(entries.nth(1)).toContainText("You added the wallet “Spare cash”.");
  await expect(entries.nth(2)).toContainText(
    "You changed the default exchange rate from 125.00 to 126.50 BDT per USD.",
  );
  await expect(entries.nth(3)).toContainText("You set the default exchange rate to 125.00 BDT per USD.");
  for (const text of await entries.allTextContents()) {
    expect(text).not.toContain("{");
    expect(text).toMatch(/\d{1,2} [A-Z][a-z]{2} \d{4}, \d{1,2}:\d{2} (AM|PM)/);
  }
  await expect(page.getByTestId("rate-row")).toContainText("126.50");
});
