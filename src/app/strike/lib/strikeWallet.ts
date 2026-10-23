// src/app/strike/lib/strikeWallet.ts
//
// CIP-30 wallet connection for Strike tam-tam. Same flow as
// src/app/lib/wallet.ts (connectWithWallet), but Lucid talks to Strike
// tam-tam's own Blockfrost proxy (/api/strike/blockfrost), because the main
// matotam proxy only accepts requests coming from matotam.io.
import type { Lucid, WalletApi } from "lucid-cardano";
import { CARDANO_NETWORK } from "@/app/lib/constants";
import { describeWalletError } from "@/app/lib/wallet";

export const STRIKE_BLOCKFROST_API = "/api/strike/blockfrost";
// The proxy attaches the real key server-side; this placeholder only satisfies Lucid.
// (The inbox doesn't use the proxy: /api/strike/inbox reads Blockfrost server-side.)
export const STRIKE_BLOCKFROST_KEY = "via-server-proxy";

export type ConnectedWallet = {
  walletId: string;
  lucid: Lucid;
  address: string;
  stakeAddress: string | null;
  /** Every address this wallet has used; a Strike account may be tied to any of them. */
  knownAddresses: string[];
};

type InjectedWallet = { enable?: () => Promise<WalletApi> };

function injectedWallets(): Record<string, InjectedWallet> {
  if (typeof window === "undefined") return {};
  return (window as unknown as { cardano?: Record<string, InjectedWallet> }).cardano ?? {};
}

/** IDs of injected CIP-30 wallets (eternl, lace, vespr, ...). */
export function detectWallets(): string[] {
  const cardano = injectedWallets();
  return Object.keys(cardano).filter((key) => {
    try {
      return !!cardano[key]?.enable;
    } catch {
      return false;
    }
  });
}

export async function connectStrikeWallet(walletId: string): Promise<ConnectedWallet> {
  const injected = injectedWallets()[walletId];
  if (!injected?.enable) throw new Error("Selected wallet is not available.");

  try {
    const api = await injected.enable();

    const { Lucid, C, fromHex } = await import("lucid-cardano");
    const { createPatchedBlockfrostProvider } = await import("@/app/lib/patchedBlockfrost");

    const provider = await createPatchedBlockfrostProvider(
      STRIKE_BLOCKFROST_API,
      STRIKE_BLOCKFROST_KEY
    );
    const lucid = await Lucid.new(provider, CARDANO_NETWORK);
    lucid.selectWallet(api);

    const address: string = await lucid.wallet.address();
    const stakeAddress: string | null = (await lucid.wallet.rewardAddress()) ?? null;

    const usedHex: string[] = await api.getUsedAddresses().catch(() => []);
    const used = usedHex.slice(0, 50).flatMap((hex) => {
      try {
        return [C.Address.from_bytes(fromHex(hex)).to_bech32(undefined)];
      } catch {
        return [];
      }
    });

    return {
      walletId,
      lucid,
      address,
      stakeAddress,
      knownAddresses: [...new Set([address, ...used])],
    };
  } catch (e) {
    throw new Error(describeWalletError(e) ?? "Failed to connect wallet.");
  }
}
