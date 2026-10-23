// src/app/strike/lib/strikeApi.ts
//
// Server-side reads from Strike Finance's public (keyless) leaderboard API.
// Only ever imported by src/app/api/strike/* routes; responses are cached for
// a few minutes so the UI never hammers Strike.
import { chainOfAddress, type StrikeStats, type StrikeTrader } from "./strikeTypes";

const LEADERBOARD_URL = "https://api.strikefinance.org/stat/v1/stats/leaderboard";
const REVALIDATE_SECONDS = 300;

type RawEntry = Record<string, unknown>;

type RawLeaderboard = {
  entries?: RawEntry[];
  located?: { rank: number; position: number } | null;
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toStats(e: RawEntry): StrikeStats {
  return {
    pnl: num(e.total_pnl),
    roi: num(e.roi),
    volume: num(e.volume),
    trades: num(e.total_trades),
    winRatePct: numOrNull(e.win_rate_pct),
    maxDrawdownPct: numOrNull(e.max_drawdown_pct),
    sharpe: numOrNull(e.sharpe_ratio),
    equity: numOrNull(e.equity),
  };
}

function toTrader(e: RawEntry): StrikeTrader {
  const address = str(e.blockchain_address);
  return {
    accountId: str(e.account_id),
    address,
    chain: address ? chainOfAddress(address) : "none",
    nickname: str(e.nickname),
    adaHandle: str(e.ada_handle),
    avatarUrl: str(e.avatar_url),
    vaultName: str(e.vault_name),
    allTime: toStats(e),
  };
}

async function leaderboard(params: Record<string, string>): Promise<RawLeaderboard> {
  const query = new URLSearchParams({ platform: "strike", ...params });
  const resp = await fetch(`${LEADERBOARD_URL}?${query}`, {
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!resp.ok) throw new Error(`Strike API responded ${resp.status}`);
  return (await resp.json()) as RawLeaderboard;
}

/** Find traders by nickname, ADA handle, account ID or address (all-time leaderboard). */
export async function searchTraders(query: string, limit = 8): Promise<StrikeTrader[]> {
  const data = await leaderboard({
    time_range: "all_time",
    search: query,
    limit: String(limit),
  });
  return (data.entries ?? []).map(toTrader).filter((t) => t.address);
}

/** All-time stats for up to 500 known addresses (e.g. inbox senders). */
export async function tradersByAddresses(addresses: string[]): Promise<StrikeTrader[]> {
  if (addresses.length === 0) return [];
  const data = await leaderboard({
    time_range: "all_time",
    addresses: addresses.join(","),
    limit: String(Math.min(addresses.length, 500)),
  });
  return (data.entries ?? []).map(toTrader);
}

/** Full profile: all-time stats plus 30-day stats and rank. Null if not a Strike trader. */
export async function traderProfile(address: string): Promise<StrikeTrader | null> {
  // `addresses` gives the trader's own row; `locate` gives their rank among everyone
  // (with `addresses`, rank would only be relative to the filtered set).
  const [allTime, recent, located] = await Promise.all([
    leaderboard({ time_range: "all_time", addresses: address, limit: "1" }),
    leaderboard({ time_range: "30d", addresses: address, limit: "1" }),
    leaderboard({ time_range: "30d", locate: address, limit: "1" }),
  ]);

  const entry = allTime.entries?.[0];
  if (!entry) return null;

  const trader = toTrader(entry);
  const recentEntry = recent.entries?.[0];
  trader.last30d = recentEntry ? toStats(recentEntry) : null;
  trader.rank30d = recentEntry ? located.located?.rank ?? null : null;
  return trader;
}
