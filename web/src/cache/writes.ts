import { useMemo } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ApiClient, WriteOptions } from "@/api/client";
import { useApi } from "@/api/context";
import type {
  CategoryInput,
  MonthlyTargetUpdate,
  PaymentInput,
  ScheduleInput,
  ScheduleUpdate,
  SettingsUpdate,
  SkipInput,
  TransactionCorrection,
  TransactionInput,
  TransactionVoid,
  WalletAdjustment,
  WalletInput,
  WalletUpdate,
} from "@/api/types";
import { effects } from "./effects";

// Every write the UI can make: send it, then apply its cache effect from the server's
// returned record. Forms call these; they never refetch the whole app.
export function createWrites(api: ApiClient, client: QueryClient) {
  return {
    async createWallet(input: WalletInput, o: WriteOptions) {
      const wallet = await api.createWallet(input, o);
      effects.walletCreated(client, wallet);
      return wallet;
    },
    async updateWallet(input: WalletUpdate, o: WriteOptions) {
      const wallet = await api.updateWallet(input, o);
      effects.walletUpdated(client, wallet);
      return wallet;
    },
    async adjustWallet(id: string, input: WalletAdjustment, o: WriteOptions) {
      const record = await api.adjustWallet(id, input, o);
      effects.walletAdjusted(client, record);
      return record;
    },
    async createTransaction(input: TransactionInput, o: WriteOptions) {
      const record = await api.createTransaction(input, o);
      effects.transactionCreated(client, record);
      return record;
    },
    async correctTransaction(id: string, input: TransactionCorrection, o: WriteOptions) {
      const record = await api.correctTransaction(id, input, o);
      effects.transactionRevised(client, record);
      return record;
    },
    async voidTransaction(id: string, input: TransactionVoid, o: WriteOptions) {
      const record = await api.voidTransaction(id, input, o);
      effects.transactionRevised(client, record);
      return record;
    },
    // Reads the record's latest version (for example after a 409) and puts it in every list.
    async refreshTransaction(id: string) {
      const record = await api.transaction(id);
      effects.transactionRefreshed(client, record);
      return record;
    },
    async createCategory(input: CategoryInput, o: WriteOptions) {
      const category = await api.createCategory(input, o);
      effects.categoryCreated(client, category);
      return category;
    },
    async updateSettings(input: SettingsUpdate, o: WriteOptions) {
      const settings = await api.updateSettings(input, o);
      effects.settingsUpdated(client, settings);
      return settings;
    },
    async setMonthlyTarget(month: string, input: MonthlyTargetUpdate, o: WriteOptions) {
      const target = await api.setMonthlyTarget(month, input, o);
      effects.monthlyTargetSet(client, month, target);
      return target;
    },
    async createSchedule(input: ScheduleInput, o: WriteOptions) {
      const schedule = await api.createSchedule(input, o);
      effects.scheduleSaved(client, schedule);
      return schedule;
    },
    async updateSchedule(input: ScheduleUpdate, o: WriteOptions) {
      const schedule = await api.updateSchedule(input, o);
      effects.scheduleSaved(client, schedule);
      return schedule;
    },
    async confirmBill(id: string, input: PaymentInput, o: WriteOptions) {
      const record = await api.confirmBill(id, input, o);
      effects.billConfirmed(client, id, record);
      return record;
    },
    async skipBill(id: string, input: SkipInput, o: WriteOptions) {
      const bill = await api.skipBill(id, input, o);
      effects.billSkipped(client, bill);
      return bill;
    },
  };
}

export type Writes = ReturnType<typeof createWrites>;

export function useWrites(): Writes {
  const api = useApi();
  const client = useQueryClient();
  return useMemo(() => createWrites(api, client), [api, client]);
}
