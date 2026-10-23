// src/app/api/strike/traders/route.ts
//
// Strike trader lookups for Strike tam-tam, backed by the public Strike API:
//   ?q=<text>              search by nickname, ADA handle, account ID or address
//   ?address=<addr>        full profile (all-time + 30-day stats, 30-day rank)
//   ?addresses=<a,b,...>   batch all-time stats, e.g. to badge inbox senders
import { NextRequest, NextResponse } from "next/server";
import { searchTraders, traderProfile, tradersByAddresses } from "@/app/strike/lib/strikeApi";
import type { StrikeTradersResponse } from "@/app/strike/lib/strikeTypes";

export const runtime = "nodejs";

const ADDRESS_RE = /^(addr1[0-9a-z]{50,120}|0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;
const MAX_BATCH = 100;

function reply(body: StrikeTradersResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": status === 200 ? "public, max-age=60" : "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim();
  const address = params.get("address")?.trim();
  const addresses = params.get("addresses");

  try {
    if (address) {
      if (!ADDRESS_RE.test(address)) return reply({ ok: false, error: "Invalid address" }, 400);
      const trader = await traderProfile(address);
      return reply({ ok: true, traders: trader ? [trader] : [] });
    }

    if (addresses !== null) {
      const list = [...new Set(addresses.split(",").map((a) => a.trim()).filter(Boolean))];
      if (list.length > MAX_BATCH || list.some((a) => !ADDRESS_RE.test(a))) {
        return reply({ ok: false, error: `Up to ${MAX_BATCH} valid addresses` }, 400);
      }
      return reply({ ok: true, traders: await tradersByAddresses(list) });
    }

    if (q) {
      if (q.length < 2 || q.length > 120) {
        return reply({ ok: false, error: "Search text must be 2–120 characters" }, 400);
      }
      return reply({ ok: true, traders: await searchTraders(q.replace(/^\$/, "")) });
    }

    return reply({ ok: false, error: "Use ?q=, ?address= or ?addresses=" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return reply({ ok: false, error: message }, 502);
  }
}
