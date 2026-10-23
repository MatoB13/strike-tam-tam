// src/app/api/strike/blockfrost/[...path]/route.ts
//
// Strike tam-tam's own same-origin Blockfrost proxy. A copy of
// src/app/api/blockfrost/[...path]/route.ts (left untouched on purpose) whose
// only difference is the Origin/Referer allowlist: requests from
// strike.matotam.io carry that host as Referer, which the main matotam proxy
// rejects. Keeping it separate means the whole Strike tam-tam can be removed
// by deleting src/app/strike and src/app/api/strike.
//
// Same safeguards as the original: fail-closed resource allowlist, per-IP
// throttle, and Origin/Referer check, so the shared Blockfrost key can't be
// used as an open relay.
import { NextRequest, NextResponse } from "next/server";
import { BLOCKFROST_SERVER_API, BLOCKFROST_SERVER_KEY } from "@/app/lib/constants";

export const dynamic = "force-dynamic";

const ALLOWED_GET_PREFIXES = [
  "epochs",
  "addresses",
  "assets",
  "txs",
  "accounts",
  "scripts",
];

const ALLOWED_ORIGINS = [
  "https://strike.matotam.io",
  "https://matotam.io",
  "https://www.matotam.io",
  "http://strike.localhost:3000",
  "http://localhost:3000",
  "http://localhost:3001",
];

// Best-effort per-IP throttle, per warm server instance (see the original route).
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;
const requestLog = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = requestLog.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    requestLog.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function isAllowedOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  // Privacy-hardened browsers may omit both headers on same-origin requests.
  if (!origin && !referer) return true;

  return ALLOWED_ORIGINS.some(
    (allowed) =>
      (origin && origin === allowed) || (referer && referer.startsWith(allowed))
  );
}

function isAllowedRequest(method: string, path: string[]): boolean {
  if (method === "GET") {
    return ALLOWED_GET_PREFIXES.includes(path[0]);
  }
  if (method === "POST") {
    // Only Lucid's tx submission ever needs a POST through this proxy.
    return path.length === 2 && path[0] === "tx" && path[1] === "submit";
  }
  return false;
}

async function forward(req: NextRequest, path: string[]) {
  if (!BLOCKFROST_SERVER_API || !BLOCKFROST_SERVER_KEY) {
    return NextResponse.json(
      { error: "Blockfrost is not configured on server" },
      { status: 500 }
    );
  }

  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isAllowedRequest(req.method, path)) {
    return NextResponse.json(
      { error: "This Blockfrost resource is not exposed through this proxy" },
      { status: 403 }
    );
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const upstreamUrl = `${BLOCKFROST_SERVER_API}/${path.join("/")}${req.nextUrl.search}`;

  const headers: Record<string, string> = { project_id: BLOCKFROST_SERVER_KEY };
  const contentType = req.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
  };

  if (req.method === "POST") {
    init.body = await req.arrayBuffer();
  }

  const upstreamResp = await fetch(upstreamUrl, init);
  const body = await upstreamResp.arrayBuffer();

  return new NextResponse(body, {
    status: upstreamResp.status,
    headers: {
      "content-type": upstreamResp.headers.get("content-type") || "application/json",
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return forward(req, path);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return forward(req, path);
}
