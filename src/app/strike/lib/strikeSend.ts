// src/app/strike/lib/strikeSend.ts
//
// Send a message to a Strike trader as a Strike tam-tam message NFT. Same
// transaction shape as matotam's send flow (src/app/page.tsx,
// src/app/lib/agentMint.ts): matotam's native-script policy (sender OR
// recipient OR matotam dev key may burn it), CIP-25 metadata, NFT paid to the
// recipient. Differences, all local to Strike tam-tam:
//   - Strike tam-tam's own metadata and striketamtam-… asset names
//     (strikeMint.ts), with the Strike card as the image;
//   - no matotam fee output (a separate fee output can't go below the ~1 ADA
//     min-UTxO, so the choice is 1 ADA or nothing; Strike tam-tam is free);
//   - Blockfrost reads go through /api/strike/blockfrost.
import type { Lucid, TxComplete } from "lucid-cardano";
import { buildMatotamPolicy } from "@/app/lib/matotamPolicy";
import { encryptMessageWithPassphrase } from "@/app/lib/encryption";
import { DEV_ADDRESS } from "@/app/lib/constants";
import { describeWalletError } from "@/app/lib/wallet";
import { STRIKE_BLOCKFROST_API, STRIKE_BLOCKFROST_KEY } from "./strikeWallet";
import { buildStrikeMintData } from "./strikeMint";

export { ENCRYPTED_PLACEHOLDER } from "./strikeMint";
export const MAX_MESSAGE_LENGTH = 256;

// Guard against Lucid/CML near the 16 KB limit: when the change output no longer
// fits, it silently drops it and burns the leftover ADA as fee instead of failing
// (measured 23.10.2026: three messages built at 15.8 KB with a 9.7 ADA fee).
// A message transaction normally costs 0.4–0.7 ADA in fees.
const MAX_TX_BYTES = 15_500;
const MAX_FEE_LOVELACE = 2_000_000;

/** Throws (with "size" in the message) instead of letting the wallet sign an oversized or overpriced transaction. */
export function assertSaneTx(built: TxComplete): void {
  const bytes = built.txComplete.to_bytes().length;
  const fee = Number(built.fee);
  if (bytes > MAX_TX_BYTES || fee > MAX_FEE_LOVELACE) {
    throw new Error(
      `Transaction size limit reached (${bytes} bytes, fee ${(fee / 1e6).toFixed(2)} ADA), so it was not sent.`
    );
  }
}

export type SendStrikeMessageParams = {
  lucid: Lucid;
  senderAddress: string;
  recipientAddress: string;
  message: string;
  /** When set, the message is AES-GCM encrypted with this passphrase. */
  passphrase?: string;
  /** Names printed on the card, e.g. Strike nicknames or short addresses. */
  fromLabel: string;
  toLabel: string;
  /** Called when the transaction is built and the wallet is asked to sign. */
  onAwaitingSignature?: () => void;
};

export type SendStrikeMessageResult = {
  txHash: string;
  unit: string;
  assetName: string;
};

export async function sendStrikeMessage(params: SendStrikeMessageParams): Promise<SendStrikeMessageResult> {
  const { lucid, senderAddress, recipientAddress, passphrase, onAwaitingSignature } = params;
  const text = params.message.trim();
  if (!text) throw new Error("Message cannot be empty.");
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error(`Message is longer than ${MAX_MESSAGE_LENGTH} characters.`);

  const { policy, policyId } = buildMatotamPolicy(lucid, senderAddress, recipientAddress, DEV_ADDRESS);

  const encryptedPayload = passphrase ? await encryptMessageWithPassphrase(text, passphrase) : undefined;

  const mintData = await buildStrikeMintData({
    senderAddress,
    recipientAddress,
    policyId,
    text,
    encryptedPayload,
    fromLabel: params.fromLabel,
    toLabel: params.toLabel,
    blockfrostApi: STRIKE_BLOCKFROST_API,
    blockfrostKey: STRIKE_BLOCKFROST_KEY,
  });

  const tx = await lucid
    .newTx()
    .attachMetadata(721, mintData.metadata721)
    .attachMintingPolicy(policy)
    .mintAssets({ [mintData.unit]: 1n })
    .payToAddress(recipientAddress, { [mintData.unit]: 1n })
    .complete();
  assertSaneTx(tx);

  onAwaitingSignature?.();
  const signed = await tx.sign().complete();
  const txHash = await signed.submit();

  return { txHash, unit: mintData.unit, assetName: mintData.assetNameBase };
}

// ---------- one message to several traders (up to 10) ------------------------

/**
 * Messages per transaction. One message is up to ~5.1 KB of metadata plus its
 * policy script, mint entry and output; two keep a transaction well under the
 * 16 KB limit even with a token-heavy change output.
 */
export const BROADCAST_BATCH_SIZE = 2;

export type BroadcastRecipient = { address: string; label: string };

export type BroadcastResult = { address: string; label: string; txHash?: string; error?: string };

export type SendBroadcastParams = {
  lucid: Lucid;
  senderAddress: string;
  recipients: BroadcastRecipient[];
  message: string;
  passphrase?: string;
  fromLabel: string;
  /** Called before each batch: index (0-based), total batches, and the batch's recipients. */
  onBatch?: (index: number, total: number, recipients: BroadcastRecipient[]) => void;
  onAwaitingSignature?: () => void;
  /** Called after each batch with every result so far. */
  onResults?: (results: BroadcastResult[]) => void;
};

export type BuildBroadcastTxParams = {
  lucid: Lucid;
  senderAddress: string;
  batch: BroadcastRecipient[];
  text: string;
  passphrase?: string;
  fromLabel: string;
  blockfrostApi?: string;
  blockfrostKey?: string;
};

/** The unsigned transaction minting one message per recipient in `batch`. */
export async function buildBroadcastTx(params: BuildBroadcastTxParams) {
  const { lucid, senderAddress, batch, text, passphrase, fromLabel } = params;
  let tx = lucid.newTx();
  const metadata: Record<string, Record<string, unknown>> = {};
  for (const r of batch) {
    const { policy, policyId } = buildMatotamPolicy(lucid, senderAddress, r.address, DEV_ADDRESS);
    const encryptedPayload = passphrase ? await encryptMessageWithPassphrase(text, passphrase) : undefined;
    const mintData = await buildStrikeMintData({
      senderAddress,
      recipientAddress: r.address,
      policyId,
      text,
      encryptedPayload,
      fromLabel,
      toLabel: r.label,
      blockfrostApi: params.blockfrostApi ?? STRIKE_BLOCKFROST_API,
      blockfrostKey: params.blockfrostKey ?? STRIKE_BLOCKFROST_KEY,
    });
    metadata[policyId] = { ...(metadata[policyId] ?? {}), ...mintData.metadata721[policyId] };
    tx = tx
      .attachMintingPolicy(policy)
      .mintAssets({ [mintData.unit]: 1n })
      .payToAddress(r.address, { [mintData.unit]: 1n });
  }
  const built = await tx.attachMetadata(721, metadata).complete();
  assertSaneTx(built);
  return built;
}

/**
 * One Strike tam-tam message NFT per recipient, a few per transaction. Each
 * batch is signed separately; a failed batch (e.g. the user declines) is
 * recorded and the remaining batches still run.
 */
export async function sendStrikeBroadcast(params: SendBroadcastParams): Promise<BroadcastResult[]> {
  const { lucid, senderAddress, passphrase, fromLabel } = params;
  const text = params.message.trim();
  if (!text) throw new Error("Message cannot be empty.");
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error(`Message is longer than ${MAX_MESSAGE_LENGTH} characters.`);

  const seen = new Set<string>();
  const recipients = params.recipients.filter((r) => !seen.has(r.address) && seen.add(r.address));
  const queue: BroadcastRecipient[][] = [];
  for (let i = 0; i < recipients.length; i += BROADCAST_BATCH_SIZE) {
    queue.push(recipients.slice(i, i + BROADCAST_BATCH_SIZE));
  }

  const results: BroadcastResult[] = [];
  let done = 0;
  while (queue.length) {
    const batch = queue.shift()!;
    params.onBatch?.(done, done + 1 + queue.length, batch);
    try {
      const built = await buildBroadcastTx({ lucid, senderAddress, batch, text, passphrase, fromLabel });
      params.onAwaitingSignature?.();
      const signed = await built.sign().complete();
      const txHash = await signed.submit();
      for (const r of batch) results.push({ ...r, txHash });
    } catch (e) {
      const error = describeWalletError(e) ?? "Sending failed.";
      // A token-heavy wallet can push two messages past the 16 KB limit: send them one by one instead.
      if (batch.length > 1 && /size/i.test(error)) {
        queue.unshift(...batch.map((r) => [r]));
        continue;
      }
      for (const r of batch) results.push({ ...r, error });
    }
    done++;
    params.onResults?.([...results]);
  }
  return results;
}
