import { ok, toApiErrorResponse } from "@/lib/api/v1/respond";
import { getCurrentAccount } from "@/lib/auth/account";
import { listAccessibleStores } from "@/lib/auth/store";

export async function GET() {
  try {
    const account = await getCurrentAccount();
    const stores = await listAccessibleStores(account);
    return ok({ stores });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
