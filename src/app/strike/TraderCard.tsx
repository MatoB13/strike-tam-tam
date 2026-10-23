"use client";

import { useState } from "react";
import styles from "./strike.module.css";
import {
  isStrikeTrader,
  shortAddress,
  traderDisplayName,
  type StrikeStats,
  type StrikeTrader,
} from "./lib/strikeTypes";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function signedUsd(value: number): string {
  return `${value > 0 ? "+" : ""}${usd.format(value)}`;
}

function pct(value: number | null): string {
  if (value === null) return "–";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function tone(value: number | null): string {
  if (value === null || value === 0) return "";
  return value > 0 ? styles.positive : styles.negative;
}

function StatRow({ label, stats }: { label: string; stats: StrikeStats }) {
  return (
    <div className={styles.statRow}>
      <span className={styles.statLabel}>{label}</span>
      <span className={`${styles.statValue} ${tone(stats.pnl)}`}>{signedUsd(stats.pnl)}</span>
      <span className={`${styles.statValue} ${tone(stats.roi)}`}>{pct(stats.roi)}</span>
      <span className={styles.statValue}>
        {stats.winRatePct === null ? "–" : `${stats.winRatePct.toFixed(0)}%`}
      </span>
      <span className={styles.statValue}>{compactUsd.format(stats.volume)}</span>
    </div>
  );
}

type TraderCardProps = {
  trader: StrikeTrader;
  /** Short line above the name, e.g. "Your Strike identity". */
  caption?: string;
  action?: React.ReactNode;
};

export default function TraderCard({ trader, caption, action }: TraderCardProps) {
  const name = traderDisplayName(trader);
  const canReceive = trader.chain === "cardano";
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const showAvatar = !!trader.avatarUrl && failedAvatar !== trader.avatarUrl;

  return (
    <div className={styles.traderCard}>
      <div className={styles.traderHead}>
        <div className={styles.avatar} aria-hidden>
          {showAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={trader.avatarUrl} alt="" onError={() => setFailedAvatar(trader.avatarUrl)} />
          ) : (
            name.replace(/^\$/, "").slice(0, 1).toUpperCase()
          )}
        </div>
        <div className={styles.traderIdentity}>
          {caption && <span className={styles.caption}>{caption}</span>}
          <span className={styles.traderName}>{name}</span>
          <span className={styles.traderMeta}>
            {trader.adaHandle && trader.nickname && <span>${trader.adaHandle}</span>}
            <span className={styles.mono}>{shortAddress(trader.address)}</span>
            {trader.rank30d ? <span className={styles.rank}>#{trader.rank30d} · 30d PnL</span> : null}
            {!isStrikeTrader(trader) && <span>No Strike account</span>}
          </span>
        </div>
        {action}
      </div>

      {isStrikeTrader(trader) && (
      <div className={styles.statTable}>
        <div className={`${styles.statRow} ${styles.statHeader}`}>
          <span />
          <span>PnL</span>
          <span>ROI</span>
          <span>Win rate</span>
          <span>Volume</span>
        </div>
        {trader.last30d && <StatRow label="30 days" stats={trader.last30d} />}
        <StatRow label="All time" stats={trader.allTime} />
      </div>
      )}

      {!canReceive && (
        <p className={styles.notice}>
          This trader uses a {trader.chain === "evm" ? "Ethereum" : trader.chain === "solana" ? "Solana" : "non-Cardano"}{" "}
          wallet, so they can&apos;t receive Cardano messages.
        </p>
      )}
    </div>
  );
}
