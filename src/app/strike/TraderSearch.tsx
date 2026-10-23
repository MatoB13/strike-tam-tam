"use client";

import { useEffect, useState } from "react";
import styles from "./strike.module.css";
import { searchStrikeTraders } from "./lib/strikeClient";
import { shortAddress, traderDisplayName, type StrikeTrader } from "./lib/strikeTypes";

type TraderSearchProps = {
  onSelect: (trader: StrikeTrader) => void;
};

export default function TraderSearch({ onSelect }: TraderSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StrikeTrader[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      setError(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const traders = await searchStrikeTraders(text);
        if (!cancelled) {
          setResults(traders);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className={styles.search}>
      <label className={styles.fieldLabel} htmlFor="strike-recipient">
        Recipient
      </label>
      <input
        id="strike-recipient"
        className={styles.input}
        placeholder="Strike nickname, $handle or wallet address"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />

      {loading && <p className={styles.hint}>Searching Strike traders…</p>}
      {error && <p className={styles.error}>{error}</p>}
      {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
        <p className={styles.hint}>No Strike trader matches “{query.trim()}”.</p>
      )}

      {results.length > 0 && (
        <ul className={styles.results}>
          {results.map((t) => (
            <li key={t.accountId || t.address}>
              <button
                type="button"
                className={styles.resultItem}
                onClick={() => {
                  onSelect(t);
                  setQuery("");
                  setResults([]);
                }}
              >
                <span className={styles.resultName}>{traderDisplayName(t)}</span>
                <span className={styles.mono}>{shortAddress(t.address)}</span>
                {t.chain !== "cardano" && <span className={styles.badgeMuted}>{t.chain.toUpperCase()}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
