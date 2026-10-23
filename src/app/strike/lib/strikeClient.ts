// src/app/strike/lib/strikeClient.ts
// Browser-side helpers for /api/strike/traders.
import type { StrikeTrader, StrikeTradersResponse } from "./strikeTypes";

async function getTraders(query: string): Promise<StrikeTrader[]> {
  const resp = await fetch(`/api/strike/traders?${query}`);
  const data = (await resp.json()) as StrikeTradersResponse;
  if (!data.ok) throw new Error(data.error);
  return data.traders;
}

export function searchStrikeTraders(text: string): Promise<StrikeTrader[]> {
  return getTraders(`q=${encodeURIComponent(text)}`);
}

export async function fetchStrikeProfile(address: string): Promise<StrikeTrader | null> {
  const traders = await getTraders(`address=${encodeURIComponent(address)}`);
  return traders[0] ?? null;
}

/** All-time stats for those of the given addresses that belong to Strike traders. */
export function fetchStrikeTradersByAddresses(addresses: string[]): Promise<StrikeTrader[]> {
  if (addresses.length === 0) return Promise.resolve([]);
  return getTraders(`addresses=${encodeURIComponent(addresses.slice(0, 100).join(","))}`);
}

/** First of the wallet's addresses that belongs to a Strike account, with its full profile. */
export async function findOwnStrikeProfile(addresses: string[]): Promise<StrikeTrader | null> {
  const matches = await getTraders(`addresses=${encodeURIComponent(addresses.slice(0, 100).join(","))}`);
  const match = addresses.map((a) => matches.find((t) => t.address === a)).find(Boolean);
  return match ? fetchStrikeProfile(match.address) : null;
}
