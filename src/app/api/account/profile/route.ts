import { getAccountsDatabase } from "@/features/accounts/database";
import { fail, ok, readBody, signedInRequest, text } from "@/features/accounts/http";
import { cleanDisplayName, setDisplayName } from "@/features/accounts/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Changes the name shown to the person's own organisation. */
export async function PATCH(request: Request): Promise<Response> {
  const user = await signedInRequest(request);
  if (user instanceof Response) return user;
  const body = await readBody(request);
  const displayName = cleanDisplayName(text(body?.displayName, 200));
  if (!displayName) return fail(400, "INVALID_NAME");
  await setDisplayName((await getAccountsDatabase()).runner, user.id, displayName);
  return ok({ displayName });
}
