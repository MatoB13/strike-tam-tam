// src/app/api/strike/inbox/route.ts
//
// Strike tam-tam inbox: ?stake=<stake1…> (preferred) or ?address=<addr1…>.
// Returns Strike tam-tam and original matotam messages held by the wallet.
// Reads Koios (KOIOS_API_TOKEN) with the shared Blockfrost key as fallback,
// so it is throttled per IP and each wallet's result is cached briefly.
import { NextRequest, NextResponse } from "next/server";
import { loadInbox } from "@/app/strike/lib/strikeInboxServer";
import type { StrikeInboxResponse } from "@/app/strike/lib/strikeTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAKE_RE = /^stake(_test)?1[0-9a-z]{50,70}$/;
const ADDRESS_RE = /^addr(_test)?1[0-9a-z]{50,120}$/;

const RESULT_TTL_MS = 60_000;
const results = new Map<string, { at: number; body: StrikeInboxResponse }>();

// Best-effort per-IP throttle per warm instance, as in the Blockfrost proxy.
const WINDOW_MS = 60_000;
const MAX_LOADS_PER_WINDOW = 8;
const loads = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loads.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    loads.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_LOADS_PER_WINDOW;
}

function reply(body: StrikeInboxResponse, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const stake = request.nextUrl.searchParams.get("stake")?.trim() || null;
  const address = request.nextUrl.searchParams.get("address")?.trim() || null;

  if (stake ? !STAKE_RE.test(stake) : !address || !ADDRESS_RE.test(address)) {
    return reply({ ok: false, error: "Pass a valid ?stake= or ?address=" }, 400);
  }
  const key = stake ?? address!;
  const cached = results.get(key);
  const fresh = request.nextUrl.searchParams.get("fresh") === "1";
  if (cached && !fresh && Date.now() - cached.at < RESULT_TTL_MS) return reply(cached.body);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  if (isRateLimited(ip)) return reply({ ok: false, error: "Too many inbox loads, try again in a minute" }, 429);

  try {
    const body: StrikeInboxResponse = { ok: true, ...(await loadInbox(stake, stake ? null : address)) };
    results.set(key, { at: Date.now(), body });
    return reply(body);
  } catch (error) {
    return reply({ ok: false, error: error instanceof Error ? error.message : "Couldn't load the inbox" }, 502);
  }
}
