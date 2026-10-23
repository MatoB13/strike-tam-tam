// src/app/strike/lib/strikeTypes.ts
// Shapes shared by the Strike API route (server) and the Strike tam-tam UI (client).
import type { EncryptedPayload } from "@/app/lib/encryption";

export type StrikeChain = "cardano" | "evm" | "solana" | "none";

export type StrikeStats = {
  pnl: number;
  roi: number;
  volume: number;
  trades: number;
  winRatePct: number | null;
  maxDrawdownPct: number | null;
  sharpe: number | null;
  equity: number | null;
};

export type StrikeTrader = {
  accountId: string;
  address: string;
  chain: StrikeChain;
  nickname: string;
  adaHandle: string;
  avatarUrl: string;
  vaultName: string;
  allTime: StrikeStats;
  /** Present on profile lookups only. */
  last30d?: StrikeStats | null;
  /** Rank by 30-day PnL among all Strike traders; profile lookups only. */
  rank30d?: number | null;
};

/** A received message: Strike tam-tam's own (striketamtam-…) or an original matotam one. */
export type StrikeInboxMessage = {
  unit: string;
  fingerprint?: string;
  kind: "striketamtam" | "matotam";
  fullText: string;
  createdAt?: string;
  fromAddress?: string;
  toAddress?: string;
  threadId?: string;
  threadIndex?: string;
  isEncrypted: boolean;
  encryptedPayload?: EncryptedPayload;
  /** The NFT image as an on-chain data URI (absent if it would reveal an encrypted text). */
  image?: string;
};

export type StrikeInboxResponse =
  | {
      ok: true;
      messages: StrikeInboxMessage[];
      scannedTokens: number;
      truncated: boolean;
      provider: "koios" | "blockfrost";
      /** Whether the server has a Koios API token configured (never the token itself). */
      koiosToken: boolean;
    }
  | { ok: false; error: string };

export type StrikeTradersResponse =
  | { ok: true; traders: StrikeTrader[] }
  | { ok: false; error: string };

const EMPTY_STATS: StrikeStats = {
  pnl: 0,
  roi: 0,
  volume: 0,
  trades: 0,
  winRatePct: null,
  maxDrawdownPct: null,
  sharpe: null,
  equity: null,
};

/** A Cardano address with no Strike account, e.g. replying to a non-Strike sender. */
export function nonStrikeRecipient(address: string): StrikeTrader {
  return {
    accountId: "",
    address,
    chain: chainOfAddress(address),
    nickname: "",
    adaHandle: "",
    avatarUrl: "",
    vaultName: "",
    allTime: EMPTY_STATS,
  };
}

export function isStrikeTrader(t: StrikeTrader): boolean {
  return t.accountId !== "";
}

export function chainOfAddress(address: string): StrikeChain {
  if (address.startsWith("addr1")) return "cardano";
  if (address.startsWith("0x")) return "evm";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return "solana";
  return "none";
}

export function shortAddress(address: string): string {
  if (address.length <= 18) return address;
  return `${address.slice(0, 10)}…${address.slice(-6)}`;
}

export function traderDisplayName(t: Pick<StrikeTrader, "nickname" | "adaHandle" | "address" | "vaultName">): string {
  if (t.nickname) return t.nickname;
  if (t.adaHandle) return `$${t.adaHandle}`;
  if (t.vaultName) return t.vaultName;
  return shortAddress(t.address);
}
