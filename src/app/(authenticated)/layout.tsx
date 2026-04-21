import { redirect } from "next/navigation";

import { BottomNav } from "@/components/bottom-nav";
import { SessionProvider } from "@/components/session-provider";
import { resolveSessionUser } from "@/libs/server/auth";
import { StoreProviders } from "@/providers/store-providers";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const result = await resolveSessionUser();

  if (!result.authenticated) {
    if (result.error === "not_invited") {
      redirect("/sign-in?error=not_invited");
    }

    redirect("/sign-in");
  }

  return (
    <SessionProvider user={result.user}>
      <StoreProviders>
        <main className="flex min-h-screen flex-col pb-16">{children}</main>
        <BottomNav />
      </StoreProviders>
    </SessionProvider>
  );
}
