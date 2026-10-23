// src/app/strike/lib/strikeMint.ts
//
// CIP-25 metadata for a Strike tam-tam message NFT. Follows matotam's message
// layout (src/app/lib/mint.ts, matotam-metadata-v1) so matotam readers can
// still read it (Sender, Receiver, Message, Thread, matotam_encrypted, ...),
// but the NFT is its own thing:
//   - asset names are striketamtam-<sss>-<rrr>-<NNN>-<xx>, numbered per
//     sender/recipient pair among Strike tam-tam messages only;
//   - the image is the Strike tam-tam card with the sender's mark;
//   - for encrypted messages only a placeholder is readable on-chain.
import { getRarityInfo } from "@/app/lib/rarity";
import { encodeUnitToQuickBurnId } from "@/app/lib/quickBurn";
import { makeSafeMetadataText, splitAsciiIntoSegments } from "@/app/lib/textEncoding";
import { splitIntoSegments } from "@/app/lib/segments";
import type { EncryptedPayload } from "@/app/lib/encryption";
import { buildStrikeCardSvg, senderMarkTraits, svgToBase64DataUri } from "./strikeCard";

export const ASSET_PREFIX = "striketamtam";
export const ENCRYPTED_PLACEHOLDER = "Encrypted message. Read it with the passphrase at strike.matotam.io";

type MetadataFields = Record<string, unknown>;

export type StrikeMintData = {
  unit: string;
  assetNameBase: string;
  metadata721: Record<string, Record<string, MetadataFields>>;
};

export type BuildStrikeMintDataParams = {
  senderAddress: string;
  recipientAddress: string;
  policyId: string;
  /** Plain message text (already trimmed and length-checked). */
  text: string;
  encryptedPayload?: EncryptedPayload;
  /** Names printed on the card. */
  fromLabel: string;
  toLabel: string;
  /** Blockfrost-compatible base URL used to find the next thread number. */
  blockfrostApi: string;
  blockfrostKey: string;
};

function last3(address: string): string {
  const t = address.trim();
  return t.length >= 3 ? t.slice(-3).toLowerCase() : "xxx";
}

function textToHex(text: string): string {
  return Array.from(new TextEncoder().encode(text))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToText(hex: string): string {
  try {
    const bytes = new Uint8Array((hex.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function rand2(): string {
  const a = new Uint8Array(2);
  crypto.getRandomValues(a);
  return (a[0] % 36).toString(36) + (a[1] % 36).toString(36);
}

const seqCacheKey = (policyId: string, prefix: string) => `${ASSET_PREFIX}_seq:${policyId}:${prefix}`;

function readCachedSeq(policyId: string, prefix: string): number {
  try {
    const n = Number(localStorage.getItem(seqCacheKey(policyId, prefix)));
    return Number.isInteger(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeCachedSeq(policyId: string, prefix: string, seq: number) {
  try {
    localStorage.setItem(seqCacheKey(policyId, prefix), String(seq));
  } catch {
    // Private mode or blocked storage: the on-chain lookup still applies.
  }
}

/**
 * Next thread number for this sender/recipient pair: highest NNN among the
 * pair policy's striketamtam assets + 1. Same approach as matotam (on-chain
 * scan plus a local cache so a not-yet-indexed send isn't reused).
 */
async function nextThreadIndex(api: string, key: string, policyId: string, prefix: string): Promise<number> {
  let maxSeq = 0;
  try {
    for (let page = 1; page <= 10; page++) {
      const resp = await fetch(`${api}/assets/policy/${policyId}?page=${page}&count=100`, {
        headers: { project_id: key },
      });
      if (!resp.ok) break; // 404 = policy never minted
      const rows = (await resp.json()) as { asset_name?: string }[];
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const row of rows) {
        const name = hexToText(String(row.asset_name ?? ""));
        if (!name.startsWith(prefix)) continue;
        const n = Number(name.slice(prefix.length).split("-")[0]);
        if (Number.isInteger(n) && n > maxSeq) maxSeq = n;
      }
      if (rows.length < 100) break;
    }
  } catch {
    // Network trouble: fall back to the local cache below.
  }
  const seq = Math.min(999, Math.max(maxSeq + 1, readCachedSeq(policyId, prefix) + 1));
  writeCachedSeq(policyId, prefix, seq);
  return seq;
}

export async function buildStrikeMintData(params: BuildStrikeMintDataParams): Promise<StrikeMintData> {
  const { senderAddress, recipientAddress, policyId, text, encryptedPayload } = params;
  const isEncrypted = !!encryptedPayload;
  const visibleText = isEncrypted ? ENCRYPTED_PLACEHOLDER : text;

  const rarityCode = getRarityInfo(new Date()).code;
  const threadId = `${ASSET_PREFIX}-${last3(senderAddress)}-${last3(recipientAddress)}`;
  const prefix = `${threadId}-`;
  const seq = await nextThreadIndex(params.blockfrostApi, params.blockfrostKey, policyId, prefix);
  const threadIndex = String(seq).padStart(3, "0");
  const assetNameBase = `${prefix}${threadIndex}-${rand2()}`; // 27 bytes, under the 32-byte limit
  const unit = policyId + textToHex(assetNameBase);

  const card = buildStrikeCardSvg({
    senderAddress,
    fromLabel: params.fromLabel,
    toLabel: params.toLabel,
    text: visibleText,
    rarityCode,
    threadIndex,
  });
  const mark = senderMarkTraits(senderAddress);
  const safeText = makeSafeMetadataText(visibleText);

  const fields: MetadataFields = {
    name: assetNameBase,
    description: safeText.length > 60 ? `${safeText.slice(0, 57)}...` : safeText || "Strike tam-tam message",
    image: splitIntoSegments(svgToBase64DataUri(card), 64),
    mediaType: "image/svg+xml",
    source: "https://strike.matotam.io",
    version: "striketamtam-metadata-v1",
    protocol: ASSET_PREFIX,
    messageType: "wallet-message",
    messageMode: isEncrypted ? "encrypted" : "plaintext",
    rarity: rarityCode,
    quickBurnId: splitAsciiIntoSegments(encodeUnitToQuickBurnId(unit), 64),
    Thread: threadId,
    "Thread index": threadIndex,
    createdAt: new Date().toISOString(),
    Sender: splitAsciiIntoSegments(makeSafeMetadataText(senderAddress), 64),
    Receiver: splitAsciiIntoSegments(makeSafeMetadataText(recipientAddress), 64),
    Message: splitAsciiIntoSegments(safeText, 64),
    mark: { style: "dot-beams", tag: mark.tag, color: mark.color, rays: mark.rays },
    agent: {
      readable: "true",
      protocol: ASSET_PREFIX,
      protocolVersion: "1",
      type: "agent-readable-message",
      intent: "wallet-message",
      transport: "cardano-onchain-nft",
      network: "cardano",
      delivery: "wallet-to-wallet",
      storage: "fully-onchain",
      encrypted: isEncrypted ? "true" : "false",
      requiresBackend: "false",
      thread: threadId,
      threadIndex,
    },
  };

  if (encryptedPayload) {
    const cipherText = Array.isArray(encryptedPayload.cipherText)
      ? encryptedPayload.cipherText.join("")
      : encryptedPayload.cipherText;
    // Same key as matotam, so matotam.io's inbox can decrypt it too.
    fields.matotam_encrypted = { ...encryptedPayload, cipherText: splitAsciiIntoSegments(cipherText, 64) };
  }

  return { unit, assetNameBase, metadata721: { [policyId]: { [assetNameBase]: fields } } };
}
