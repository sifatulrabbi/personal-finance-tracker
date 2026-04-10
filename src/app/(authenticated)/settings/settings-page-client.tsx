"use client";

import { PageHeader } from "@/components/page-header";

import { CurrencySection } from "./currency-section";

export function SettingsPageClient() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex flex-1 flex-col gap-6 p-4">
        <CurrencySection />
      </div>
    </>
  );
}
