import { redirect } from "next/navigation";

import { resolveSessionUser } from "@/libs/server/auth";

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

  return <>{children}</>;
}
