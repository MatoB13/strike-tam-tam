// src/app/strike/lib/strikeInboxServer.ts
//
// Server-side inbox: finds message NFTs in a wallet without fetching metadata
// for every token. Message NFTs are recognised by their asset name alone
// (striketamtam-… for Strike tam-tam, matotam-… for matotam.io), which the
// wallet's token list already contains, so only actual messages need their
// metadata. Works the same for a wallet with 10 tokens or thousands.
//
// Koios is the primary source: its bulk endpoints return a whole wallet's
// tokens and all message metadata in a couple of calls, and it keeps load off
// the Blockfrost key matotam shares with other services. Blockfrost is the
// fallback when Koios is unavailable.
import type { EncryptedPayload } from "@/app/lib/encryption";
import { BLOCKFROST_SERVER_API, BLOCKFROST_SERVER_KEY, CARDANO_NETWORK } from "@/app/lib/constants";
import type { StrikeInboxMessage } from "./strikeTypes";

const MAX_TOKENS = 5_000;
const MAX_MESSAGES = 300;
const CONCURRENCY = 6;

const KOIOS_API =
  process.env.KOIOS_API?.trim() ||
  (CARDANO_NETWORK === "Mainnet"
    ? "https://api.koios.rest/api/v1"
    : CARDANO_NETWORK === "Preview"
    ? "https://preview.koios.rest/api/v1"
    : "https://preprod.koios.rest/api/v1");
// Optional: without a token Koios still answers, with lower per-IP limits.
const KOIOS_TOKEN = process.env.KOIOS_API_TOKEN?.trim() || "";
const KOIOS_PAGE = 1_000;
const KOIOS_ASSET_BATCH = 50;

type Kind = StrikeInboxMessage["kind"];
type WalletToken = { unit: string; fingerprint?: string };

const toHex = (s: string) => Buffer.from(s, "utf8").toString("hex");
const fromHex = (hex: string) => Buffer.from(hex, "hex").toString("utf8");
const PREFIXES: { hex: string; kind: Kind }[] = [
  { hex: toHex("striketamtam-"), kind: "striketamtam" },
  { hex: toHex("matotam-"), kind: "matotam" },
];

// Minted metadata never changes, so parsed assets are kept for the instance's lifetime.
const assetCache = new Map<string, StrikeInboxMessage | null>();

function kindOfUnit(unit: string): Kind | null {
  const nameHex = unit.slice(56).toLowerCase();
  return PREFIXES.find((p) => nameHex.startsWith(p.hex))?.kind ?? null;
}

function joined(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.map(String).join("");
  if (typeof value === "string") return value;
  return undefined;
}

function parseMessage(
  unit: string,
  kind: Kind,
  meta: Record<string, unknown> | null | undefined,
  fingerprint?: string
): StrikeInboxMessage | null {
  if (!meta) return null;
  const encryptedPayload = meta.matotam_encrypted as EncryptedPayload | undefined;
  // Strike tam-tam's first messages still used matotam-… names; their client field gives them away.
  const fromStrikeTamTam = kind === "striketamtam" || meta.client === "strike.matotam.io";
  // Only on-chain images. Older matotam.io encrypted messages drew their plaintext into the
  // image, so those stay hidden; Strike tam-tam always drew a placeholder.
  const image = joined(meta.image);
  const showImage = !!image && image.startsWith("data:image/") && (!encryptedPayload || fromStrikeTamTam);
  return {
    image: showImage ? image : undefined,
    unit,
    fingerprint,
    kind: fromStrikeTamTam ? "striketamtam" : "matotam",
    fullText: joined(meta.Message) ?? joined(meta.messageSegments) ?? String(meta.description ?? ""),
    createdAt: typeof meta.createdAt === "string" ? meta.createdAt : undefined,
    fromAddress: joined(meta.Sender) ?? joined(meta.fromAddressSegments),
    toAddress: joined(meta.Receiver) ?? joined(meta.toAddressSegments),
    threadId: typeof meta.Thread === "string" ? meta.Thread : undefined,
    threadIndex: typeof meta["Thread index"] === "string" ? meta["Thread index"] : undefined,
    isEncrypted: !!encryptedPayload,
    encryptedPayload,
  };
}

// ---------- Koios ----------------------------------------------------------

async function koios<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (KOIOS_TOKEN) headers.Authorization = `Bearer ${KOIOS_TOKEN}`;
  const resp = await fetch(`${KOIOS_API}/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`Koios responded ${resp.status}`);
  return (await resp.json()) as T;
}

type KoiosAssetRow = { policy_id: string; asset_name: string | null; fingerprint?: string };

async function koiosWalletTokens(stake: string | null, address: string | null) {
  const tokens: WalletToken[] = [];
  let truncated = false;
  for (let offset = 0; offset < MAX_TOKENS; offset += KOIOS_PAGE) {
    const rows = stake
      ? await koios<KoiosAssetRow[]>(`account_assets?offset=${offset}&limit=${KOIOS_PAGE}`, { _stake_addresses: [stake] })
      : await koios<KoiosAssetRow[]>(`address_assets?offset=${offset}&limit=${KOIOS_PAGE}`, { _addresses: [address] });
    for (const r of rows) tokens.push({ unit: r.policy_id + (r.asset_name ?? ""), fingerprint: r.fingerprint });
    if (rows.length < KOIOS_PAGE) break;
    if (offset + KOIOS_PAGE >= MAX_TOKENS) truncated = true;
  }
  return { tokens, truncated };
}

type KoiosAssetInfo = {
  policy_id: string;
  asset_name: string | null;
  asset_name_ascii?: string;
  fingerprint?: string;
  minting_tx_metadata?: Record<string, unknown> | null;
};

async function koiosMessages(candidates: (WalletToken & { kind: Kind })[]) {
  const byUnit = new Map(candidates.map((c) => [c.unit, c]));
  for (let i = 0; i < candidates.length; i += KOIOS_ASSET_BATCH) {
    const batch = candidates.slice(i, i + KOIOS_ASSET_BATCH);
    const infos = await koios<KoiosAssetInfo[]>("asset_info", {
      _asset_list: batch.map((c) => [c.unit.slice(0, 56), c.unit.slice(56)]),
    });
    for (const info of infos) {
      const unit = info.policy_id + (info.asset_name ?? "");
      const candidate = byUnit.get(unit);
      if (!candidate) continue;
      const cip25 = info.minting_tx_metadata?.["721"] as Record<string, Record<string, unknown>> | undefined;
      const name = info.asset_name_ascii || fromHex(info.asset_name ?? "");
      const meta = cip25?.[info.policy_id]?.[name] as Record<string, unknown> | undefined;
      assetCache.set(unit, parseMessage(unit, candidate.kind, meta, info.fingerprint ?? candidate.fingerprint));
    }
  }
}

// ---------- Blockfrost (fallback) -------------------------------------------

async function blockfrost(path: string): Promise<Response> {
  return fetch(`${BLOCKFROST_SERVER_API}/${path}`, {
    headers: { project_id: BLOCKFROST_SERVER_KEY },
    cache: "no-store",
  });
}

async function blockfrostWalletTokens(stake: string | null, address: string | null) {
  const tokens: WalletToken[] = [];
  let truncated = false;
  const maxPages = MAX_TOKENS / 100;

  if (stake) {
    // Pages are fetched a few at a time; a short (or empty) page means the end.
    const fetchPage = async (page: number) => {
      const resp = await blockfrost(`accounts/${stake}/addresses/assets?page=${page}&count=100`);
      if (resp.status === 404) return []; // account never used on-chain
      if (!resp.ok) throw new Error(`Blockfrost responded ${resp.status}`);
      return (await resp.json()) as { unit?: string }[];
    };
    outer: for (let first = 1; first <= maxPages; first += CONCURRENCY) {
      const pageNumbers = Array.from({ length: Math.min(CONCURRENCY, maxPages - first + 1) }, (_, i) => first + i);
      const pages = await Promise.all(pageNumbers.map(fetchPage));
      for (let i = 0; i < pages.length; i++) {
        for (const r of pages[i]) if (r.unit) tokens.push({ unit: r.unit });
        if (pages[i].length < 100) break outer;
        if (pageNumbers[i] === maxPages) truncated = true;
      }
    }
  } else if (address) {
    const resp = await blockfrost(`addresses/${address}`);
    if (resp.ok) {
      const data = (await resp.json()) as { amount?: { unit?: string }[] };
      for (const a of data.amount ?? []) if (a.unit && a.unit !== "lovelace") tokens.push({ unit: a.unit });
    } else if (resp.status !== 404) {
      throw new Error(`Blockfrost responded ${resp.status}`);
    }
  }
  return { tokens, truncated };
}

async function blockfrostMessages(candidates: (WalletToken & { kind: Kind })[]) {
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    await Promise.all(
      candidates.slice(i, i + CONCURRENCY).map(async (c) => {
        const resp = await blockfrost(`assets/${c.unit}`);
        if (!resp.ok) return; // transient; not cached so the next load retries
        const asset = (await resp.json()) as Record<string, unknown>;
        const fingerprint = typeof asset.fingerprint === "string" ? asset.fingerprint : undefined;
        assetCache.set(c.unit, parseMessage(c.unit, c.kind, asset.onchain_metadata as Record<string, unknown>, fingerprint));
      })
    );
  }
}

// ---------- inbox ------------------------------------------------------------

export async function loadInbox(stake: string | null, address: string | null) {
  let provider: "koios" | "blockfrost" = "koios";
  let wallet: { tokens: WalletToken[]; truncated: boolean };
  try {
    wallet = await koiosWalletTokens(stake, address);
  } catch (e) {
    console.warn("Strike tam-tam inbox: Koios unavailable, using Blockfrost", e);
    provider = "blockfrost";
    wallet = await blockfrostWalletTokens(stake, address);
  }

  const candidates = wallet.tokens
    .map((t) => ({ ...t, kind: kindOfUnit(t.unit) }))
    .filter((c): c is WalletToken & { kind: Kind } => c.kind !== null)
    .slice(0, MAX_MESSAGES);

  const missing = candidates.filter((c) => !assetCache.has(c.unit));
  if (missing.length) {
    if (provider === "koios") {
      try {
        await koiosMessages(missing);
      } catch (e) {
        console.warn("Strike tam-tam inbox: Koios asset_info failed, using Blockfrost", e);
        provider = "blockfrost";
      }
    }
    const stillMissing = missing.filter((c) => !assetCache.has(c.unit));
    if (stillMissing.length && provider === "blockfrost") await blockfrostMessages(stillMissing);
  }

  const messages = candidates
    .map((c) => assetCache.get(c.unit))
    .filter((m): m is StrikeInboxMessage => !!m)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  // koiosToken says only whether a token is configured, never its value. With a token set,
  // provider "koios" also means Koios accepted it (a rejected token falls back to Blockfrost).
  return {
    messages,
    scannedTokens: wallet.tokens.length,
    truncated: wallet.truncated,
    provider,
    koiosToken: KOIOS_TOKEN !== "",
  };
}
