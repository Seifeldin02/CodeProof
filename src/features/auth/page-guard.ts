import { redirect } from "next/navigation";
import { getCurrentUser } from "./session";
import type { AuthUser } from "./store";

export async function requirePageUser(nextPath: string): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(nextPath)}`);
  return user;
}
