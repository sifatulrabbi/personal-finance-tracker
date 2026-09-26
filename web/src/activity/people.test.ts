import { describe, expect, test } from "bun:test";
import { authorName, dhakaDateTime, longDate, revisionCurrencies } from "./people";

describe("author names", () => {
  test("the signed-in person is You, others a short name", () => {
    expect(authorName("Sifat@Example.test", "sifat@example.test")).toBe("You");
    expect(authorName("rumana.k@example.test", "sifat@example.test")).toBe("Rumana.k");
    expect(authorName("noatsign")).toBe("Noatsign");
  });
});

// Regression (frontend review, "edit history shows every revision in the current wallet's
// currency"): a record corrected from a USD wallet to a BDT wallet showed its USD revision
// with the taka sign.
describe("per-revision currency", () => {
  const wallets = [
    { id: "usd", currency: "USD" as const },
    { id: "bdt", currency: "BDT" as const },
  ];

  test("each revision uses its own wallet's currency", () => {
    expect(revisionCurrencies({ wallet_id: "usd" }, wallets)).toEqual({ currency: "USD", toCurrency: undefined });
    expect(revisionCurrencies({ wallet_id: "bdt" }, wallets)).toEqual({ currency: "BDT", toCurrency: undefined });
  });

  test("a transfer's received side uses the destination wallet", () => {
    expect(revisionCurrencies({ wallet_id: "usd", to_wallet_id: "bdt" }, wallets)).toEqual({
      currency: "USD",
      toCurrency: "BDT",
    });
  });

  test("an unknown wallet falls back to BDT", () => {
    expect(revisionCurrencies({ wallet_id: "gone", to_wallet_id: "gone" }, wallets)).toEqual({
      currency: "BDT",
      toCurrency: "BDT",
    });
  });
});

describe("readable times", () => {
  test("instants are shown in Dhaka time", () => {
    // 09:41 UTC is 15:41 in Dhaka.
    expect(dhakaDateTime("2026-09-26T09:41:00.000000000Z")).toBe("26 Sep 2026, 3:41 pm");
    // Late evening UTC is already the next day in Dhaka.
    expect(dhakaDateTime("2026-09-25T20:30:00Z")).toBe("26 Sep 2026, 2:30 am");
    expect(dhakaDateTime("not a time")).toBe("not a time");
  });

  test("calendar dates read as day month year", () => {
    expect(longDate("2026-09-04")).toBe("4 Sep 2026");
  });
});
