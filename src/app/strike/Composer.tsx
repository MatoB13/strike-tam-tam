"use client";

import { useMemo, useState } from "react";
import styles from "./strike.module.css";
import { describeWalletError } from "@/app/lib/wallet";
import { getRarityInfo } from "@/app/lib/rarity";
import {
  BROADCAST_BATCH_SIZE,
  ENCRYPTED_PLACEHOLDER,
  MAX_MESSAGE_LENGTH,
  sendStrikeBroadcast,
  sendStrikeMessage,
  type BroadcastResult,
} from "./lib/strikeSend";
import { buildStrikeCardSvg, svgToBase64DataUri } from "./lib/strikeCard";
import { isNewerBuildLive, STALE_PAGE_MESSAGE } from "./lib/strikeVersion";
import { isAddressOnCurrentNetwork, txExplorerUrl } from "./lib/strikeConfig";
import { shortAddress, traderDisplayName, type StrikeTrader } from "./lib/strikeTypes";
import type { ConnectedWallet } from "./lib/strikeWallet";

type ComposerProps = {
  wallet: ConnectedWallet | null;
  /** One or more Cardano recipients; each gets their own message NFT. */
  recipients: StrikeTrader[];
  /** Sender name printed on the card; defaults to the short wallet address. */
  senderLabel?: string;
  onConnectClick: () => void;
};

type Status = "idle" | "building" | "signing" | "sent";

export default function Composer({ wallet, recipients, senderLabel, onConnectClick }: ComposerProps) {
  const [message, setMessage] = useState("");
  const [encrypt, setEncrypt] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<BroadcastResult[]>([]);

  const busy = status === "building" || status === "signing";
  const many = recipients.length > 1;
  const wrongNetwork = recipients.some((r) => !isAddressOnCurrentNetwork(r.address));
  const transactions = Math.ceil(recipients.length / BROADCAST_BATCH_SIZE);

  const fromLabel = wallet ? senderLabel ?? shortAddress(wallet.address) : "You";
  const firstName = recipients[0] ? traderDisplayName(recipients[0]) : "";
  const recipientsLabel = many ? `${recipients.length} traders` : firstName;

  // The exact card the (first) recipient will see; only the thread number is known after minting.
  const previewUri = useMemo(() => {
    const svg = buildStrikeCardSvg({
      senderAddress: wallet?.address ?? "addr1-preview-sender",
      fromLabel,
      toLabel: firstName,
      text: encrypt ? ENCRYPTED_PLACEHOLDER : message.trim() || "Your message appears here.",
      rarityCode: getRarityInfo(new Date()).code,
      threadIndex: "···",
    });
    return svgToBase64DataUri(svg);
  }, [wallet, fromLabel, firstName, encrypt, message]);

  async function send(targets: StrikeTrader[]) {
    setError(null);
    if (!wallet || targets.length === 0) return;
    if (!message.trim()) {
      setError("Write a message first.");
      return;
    }
    if (encrypt) {
      if (!passphrase.trim()) {
        setError("Choose a passphrase, or turn encryption off.");
        return;
      }
      if (passphrase.trim() !== confirmPassphrase.trim()) {
        setError("Passphrase and confirmation don't match.");
        return;
      }
    }

    setStatus("building");
    if (await isNewerBuildLive()) {
      setError(STALE_PAGE_MESSAGE);
      setStatus("idle");
      return;
    }

    const common = {
      lucid: wallet.lucid,
      senderAddress: wallet.address,
      message,
      passphrase: encrypt ? passphrase.trim() : undefined,
      fromLabel,
    };

    if (targets.length === 1) {
      const target = targets[0];
      const label = traderDisplayName(target);
      try {
        const result = await sendStrikeMessage({
          ...common,
          recipientAddress: target.address,
          toLabel: label,
          onAwaitingSignature: () => setStatus("signing"),
        });
        setResults([{ address: target.address, label, txHash: result.txHash }]);
        setStatus("sent");
      } catch (e) {
        console.error(e);
        setError(describeWalletError(e) ?? "Sending failed.");
        setStatus("idle");
      }
      return;
    }

    setResults([]);
    const all = await sendStrikeBroadcast({
      ...common,
      recipients: targets.map((t) => ({ address: t.address, label: traderDisplayName(t) })),
      onBatch: (i, total) => {
        setStatus("building");
        setProgress(`Preparing transaction ${i + 1} of ${total}…`);
      },
      onAwaitingSignature: () => {
        setStatus("signing");
        setProgress((p) => p.replace("Preparing", "Confirm in your wallet:"));
      },
      onResults: setResults,
    }).catch((e) => {
      setError(e instanceof Error ? e.message : "Sending failed.");
      return [] as BroadcastResult[];
    });
    setProgress("");
    setStatus(all.some((r) => r.txHash) ? "sent" : "idle");
  }

  function reset() {
    setMessage("");
    setPassphrase("");
    setConfirmPassphrase("");
    setEncrypt(false);
    setResults([]);
    setError(null);
    setStatus("idle");
  }

  const sent = results.filter((r) => r.txHash);
  const failed = results.filter((r) => r.error);

  if (status === "sent") {
    return (
      <div className={styles.success}>
        <p className={styles.successTitle}>
          {results.length === 1 ? `Message sent to ${results[0].label}.` : `Sent to ${sent.length} of ${results.length} traders.`}
        </p>
        <p className={styles.hint}>
          It shows up in their wallet once the transaction is confirmed, usually within a minute or two.
          {encrypt && " Share the passphrase with them through another channel."}
        </p>
        {results.length > 1 && <ResultLog results={results} />}
        <div className={styles.row}>
          {results.length === 1 && results[0].txHash && (
            <a className={styles.ghostButton} href={txExplorerUrl(results[0].txHash)} target="_blank" rel="noreferrer">
              View transaction ↗
            </a>
          )}
          {failed.length > 0 && (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void send(recipients.filter((r) => failed.some((f) => f.address === r.address)))}
            >
              Retry {failed.length} failed
            </button>
          )}
          <button type="button" className={styles.ghostButton} onClick={reset}>
            Send another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.composer}>
      <div className={styles.fieldHead}>
        <label className={styles.fieldLabel} htmlFor="strike-message">
          Message
        </label>
        <span className={styles.counter}>
          {message.length}/{MAX_MESSAGE_LENGTH}
        </span>
      </div>
      <textarea
        id="strike-message"
        className={`${styles.input} ${styles.textarea}`}
        placeholder={many ? `Write to ${recipients.length} traders…` : `Say hi to ${firstName}…`}
        maxLength={MAX_MESSAGE_LENGTH}
        rows={4}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={busy}
      />

      <label className={styles.toggleRow}>
        <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} disabled={busy} />
        <span>
          Encrypt the message
          <span className={styles.toggleHint}>
            Only a passphrase you share separately can unlock it. The text never appears on-chain in readable form.
            {many && " Everyone gets the same passphrase."}
          </span>
        </span>
      </label>

      {encrypt && (
        <div className={styles.passphraseGrid}>
          <input
            type="password"
            className={styles.input}
            placeholder="Passphrase"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete="new-password"
            disabled={busy}
          />
          <input
            type="password"
            className={styles.input}
            placeholder="Confirm passphrase"
            value={confirmPassphrase}
            onChange={(e) => setConfirmPassphrase(e.target.value)}
            autoComplete="new-password"
            disabled={busy}
          />
        </div>
      )}

      <div className={styles.cardPreview}>
        <span className={styles.fieldLabel}>
          Preview · {many ? `what each of the ${recipients.length} traders receives` : `what ${firstName} receives`}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUri} alt="Preview of the message NFT" />
      </div>

      <p className={styles.costNote}>
        {many
          ? `Each trader gets their own message NFT: ${recipients.length} messages in ${transactions} transaction${transactions === 1 ? "" : "s"} (${BROADCAST_BATCH_SIZE} per transaction, one wallet signature each). Costs about ${(recipients.length * 1.5).toFixed(1)}–${(recipients.length * 2).toFixed(1)} ADA: roughly 1.2 ADA travels with each NFT to its recipient, plus network fees.`
          : "Costs about 1.5–2 ADA: roughly 1.2 ADA travels with the message NFT to the recipient and 0.3–0.6 ADA is the Cardano network fee."}{" "}
        Strike tam-tam itself charges nothing. Your wallet shows the exact amount before you sign.
      </p>

      {error && <p className={styles.error}>{error}</p>}
      {busy && progress && <p className={styles.hint}>{progress}</p>}
      {busy && results.length > 0 && <ResultLog results={results} />}

      {wrongNetwork ? (
        <p className={styles.notice}>This deployment mints on a different Cardano network than the recipient&apos;s address.</p>
      ) : wallet ? (
        <button type="button" className={styles.primaryButton} onClick={() => void send(recipients)} disabled={busy}>
          {status === "building"
            ? "Preparing transaction…"
            : status === "signing"
            ? "Confirm in your wallet…"
            : `Send to ${recipientsLabel}`}
        </button>
      ) : (
        <button type="button" className={styles.primaryButton} onClick={onConnectClick}>
          Connect wallet to send
        </button>
      )}
    </div>
  );
}

function ResultLog({ results }: { results: BroadcastResult[] }) {
  return (
    <ul className={styles.resultLog}>
      {results.map((r) => (
        <li key={r.address}>
          <span>{r.label}</span>
          {r.txHash ? (
            <a className={styles.linkMuted} href={txExplorerUrl(r.txHash)} target="_blank" rel="noreferrer">
              View transaction ↗
            </a>
          ) : (
            <span className={styles.error}>{r.error}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
