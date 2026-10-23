"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./strike.module.css";
import { decryptMessageWithPassphrase } from "@/app/lib/encryption";
import { loadStrikeInbox } from "./lib/strikeInbox";
import { fetchStrikeTradersByAddresses } from "./lib/strikeClient";
import { poolPmUrl, tokenExplorerUrl } from "./lib/strikeConfig";
import {
  nonStrikeRecipient,
  shortAddress,
  traderDisplayName,
  type StrikeInboxMessage,
  type StrikeTrader,
} from "./lib/strikeTypes";
import type { ConnectedWallet } from "./lib/strikeWallet";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

type InboxProps = {
  wallet: ConnectedWallet | null;
  onReply: (recipient: StrikeTrader) => void;
};

export default function Inbox({ wallet, onReply }: InboxProps) {
  const [messages, setMessages] = useState<StrikeInboxMessage[]>([]);
  const [senders, setSenders] = useState<Record<string, StrikeTrader>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [strikeOnly, setStrikeOnly] = useState(false);

  const load = useCallback(
    async (fresh = false) => {
      if (!wallet) return;
      setLoading(true);
      setError(null);
      try {
        const result = await loadStrikeInbox(wallet, fresh);
        setMessages(result.messages);
        setTruncated(result.truncated);

        const fromAddresses = [...new Set(result.messages.map((m) => m.fromAddress).filter((a): a is string => !!a))];
        const traders = await fetchStrikeTradersByAddresses(fromAddresses).catch(() => []);
        setSenders(Object.fromEntries(traders.map((t) => [t.address, t])));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load your messages.");
      } finally {
        setLoading(false);
      }
    },
    [wallet]
  );

  useEffect(() => {
    setMessages([]);
    setSenders({});
    void load();
  }, [load]);

  const visible = useMemo(
    () => (strikeOnly ? messages.filter((m) => m.fromAddress && senders[m.fromAddress]) : messages),
    [messages, senders, strikeOnly]
  );

  if (!wallet) {
    return <p className={styles.hint}>Connect your wallet to see the messages you&apos;ve received.</p>;
  }

  return (
    <div className={styles.stack}>
      <div className={styles.rowBetween}>
        <label className={styles.toggleRow}>
          <input type="checkbox" checked={strikeOnly} onChange={(e) => setStrikeOnly(e.target.checked)} />
          <span>Only from Strike traders</span>
        </label>
        <button type="button" className={styles.ghostButton} onClick={() => void load(true)} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {!loading && !error && visible.length === 0 && (
        <p className={styles.hint}>
          {messages.length > 0 ? "No messages from Strike traders yet." : "No messages in this wallet yet."}
        </p>
      )}

      {visible.length > 0 && (
        <ul className={styles.messageList}>
          {visible.map((m) => (
            <MessageItem
              key={m.unit}
              message={m}
              sender={m.fromAddress ? senders[m.fromAddress] : undefined}
              onReply={onReply}
            />
          ))}
        </ul>
      )}

      <p className={styles.costNote}>
        Shows Strike tam-tam and matotam messages held by this wallet.
        {truncated && " This wallet has more than 5,000 tokens, so only the first 5,000 were checked."}
      </p>
    </div>
  );
}

type MessageItemProps = {
  message: StrikeInboxMessage;
  sender?: StrikeTrader;
  onReply: (recipient: StrikeTrader) => void;
};

function MessageItem({ message, sender, onReply }: MessageItemProps) {
  const [passphrase, setPassphrase] = useState("");
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);

  const from = message.fromAddress;
  const name = sender ? traderDisplayName(sender) : from ? shortAddress(from) : "Unknown sender";
  const created = message.createdAt ? new Date(message.createdAt) : null;
  const nftUrl = message.fingerprint ? poolPmUrl(message.fingerprint) : tokenExplorerUrl(message.unit);

  async function decrypt() {
    if (!message.encryptedPayload) return;
    setDecrypting(true);
    setDecryptError(null);
    try {
      setDecrypted(await decryptMessageWithPassphrase(message.encryptedPayload, passphrase.trim()));
    } catch {
      setDecryptError("Wrong passphrase or damaged message.");
    } finally {
      setDecrypting(false);
    }
  }

  return (
    <li className={styles.messageItem}>
      <div className={styles.messageHead}>
        <div className={styles.avatarSmall} aria-hidden>
          {name.replace(/^\$/, "").slice(0, 1).toUpperCase()}
        </div>
        <div className={styles.traderIdentity}>
          <span className={styles.messageSender}>
            {name}
            {sender ? (
              <span className={styles.badgeStrike}>Strike trader</span>
            ) : (
              <span className={styles.badgeMuted}>Not on Strike</span>
            )}
            {message.kind === "matotam" && <span className={styles.badgeMuted}>via matotam.io</span>}
          </span>
          <span className={styles.traderMeta}>
            {sender && (
              <span className={sender.allTime.pnl >= 0 ? styles.positive : styles.negative}>
                {sender.allTime.pnl >= 0 ? "+" : ""}
                {usd.format(sender.allTime.pnl)} all-time
              </span>
            )}
            {sender?.allTime.winRatePct != null && <span>{sender.allTime.winRatePct.toFixed(0)}% win rate</span>}
            {created && !Number.isNaN(created.getTime()) && <span>{dateFormat.format(created)}</span>}
          </span>
        </div>
      </div>

      {message.isEncrypted && message.encryptedPayload ? (
        decrypted !== null ? (
          <p className={styles.messageText}>{decrypted}</p>
        ) : (
          <div className={styles.stack}>
            <p className={styles.hint}>🔒 Encrypted message. Enter the passphrase the sender gave you.</p>
            <div className={styles.row}>
              <input
                type="password"
                className={styles.input}
                placeholder="Passphrase"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && passphrase.trim()) void decrypt();
                }}
              />
              <button
                type="button"
                className={styles.ghostButton}
                disabled={decrypting || !passphrase.trim()}
                onClick={() => void decrypt()}
              >
                {decrypting ? "Decrypting…" : "Decrypt"}
              </button>
            </div>
            {decryptError && <p className={styles.error}>{decryptError}</p>}
          </div>
        )
      ) : (
        <p className={styles.messageText}>{message.fullText || "(empty message)"}</p>
      )}

      {message.image && (
        <a className={styles.nftThumb} href={nftUrl} target="_blank" rel="noreferrer" title="Open the NFT in full size">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={message.image} alt="The message NFT" loading="lazy" />
        </a>
      )}

      <div className={styles.row}>
        {from?.startsWith("addr") && (
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => onReply(sender ?? nonStrikeRecipient(from))}
          >
            Reply
          </button>
        )}
        <a className={styles.linkMuted} href={nftUrl} target="_blank" rel="noreferrer">
          {message.fingerprint ? "Full size on pool.pm ↗" : "View NFT ↗"}
        </a>
      </div>
    </li>
  );
}
