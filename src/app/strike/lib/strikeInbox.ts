// src/app/strike/lib/strikeInbox.ts
// Browser-side helper for /api/strike/inbox (Strike tam-tam and matotam messages).
import type { StrikeInboxResponse } from "./strikeTypes";
import type { ConnectedWallet } from "./strikeWallet";

export async function loadStrikeInbox(wallet: ConnectedWallet, fresh = false) {
  const query = wallet.stakeAddress
    ? `stake=${encodeURIComponent(wallet.stakeAddress)}`
    : `address=${encodeURIComponent(wallet.address)}`;
  const resp = await fetch(`/api/strike/inbox?${query}${fresh ? "&fresh=1" : ""}`);
  const data = (await resp.json()) as StrikeInboxResponse;
  if (!data.ok) throw new Error(data.error);
  return data;
}
