import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";

export default async function Home() {
  const { user } = await withAuth();

  if (user) {
    redirect("/dashboard");
  }

  redirect("/sign-in");
}
