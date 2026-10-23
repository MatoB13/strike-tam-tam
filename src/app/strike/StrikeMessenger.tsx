"use client";

import { useState } from "react";
import styles from "./strike.module.css";
import TraderCard from "./TraderCard";
import TraderSearch from "./TraderSearch";
import Composer from "./Composer";
import Inbox from "./Inbox";
import NewVersionBar from "./NewVersionBar";
import { STRIKE_REFERRAL_URL } from "./lib/strikeConfig";
import { CARDANO_NETWORK, WALLET_LABELS } from "@/app/lib/constants";
import { connectStrikeWallet, detectWallets, type ConnectedWallet } from "./lib/strikeWallet";
import { fetchStrikeProfile, findOwnStrikeProfile } from "./lib/strikeClient";
import { shortAddress, traderDisplayName, type StrikeTrader } from "./lib/strikeTypes";

type Tab = "send" | "inbox";
type ProfileStatus = "idle" | "loading" | "found" | "none" | "error";

/** One message can go to up to this many traders; each gets their own NFT. */
const MAX_RECIPIENTS = 10;

const TABS: { id: Tab; label: string }[] = [
  { id: "send", label: "Send" },
  { id: "inbox", label: "Inbox" },
];

export default function StrikeMessenger() {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [walletChoices, setWalletChoices] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<StrikeTrader | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("idle");

  const [tab, setTab] = useState<Tab>("send");
  const [recipients, setRecipients] = useState<StrikeTrader[]>([]);
  const [adding, setAdding] = useState(false);
  const [recipientNotice, setRecipientNotice] = useState<string | null>(null);

  async function loadOwnProfile(addresses: string[]) {
    setProfileStatus("loading");
    try {
      const found = await findOwnStrikeProfile(addresses);
      setProfile(found);
      setProfileStatus(found ? "found" : "none");
    } catch {
      setProfile(null);
      setProfileStatus("error");
    }
  }

  async function connect(walletId: string) {
    setConnecting(true);
    setError(null);
    setWalletChoices([]);
    try {
      const connected = await connectStrikeWallet(walletId);
      setWallet(connected);
      void loadOwnProfile(connected.knownAddresses);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect wallet.");
    } finally {
      setConnecting(false);
    }
  }

  function onConnectClick() {
    setError(null);
    const ids = detectWallets();
    if (ids.length === 0) {
      setError("No Cardano wallet found in this browser. Install Eternl, Lace, VESPR or another CIP-30 wallet.");
    } else if (ids.length === 1) {
      void connect(ids[0]);
    } else {
      setWalletChoices(ids);
    }
  }

  // Search results carry all-time stats only; fill in 30-day stats and rank.
  function enrich(trader: StrikeTrader) {
    fetchStrikeProfile(trader.address)
      .then((full) => {
        if (full) setRecipients((list) => list.map((r) => (r.address === full.address ? full : r)));
      })
      .catch(() => {});
  }

  function selectRecipient(trader: StrikeTrader) {
    setRecipientNotice(null);
    setAdding(false);
    const name = traderDisplayName(trader);
    const onlyNonCardano = recipients.length === 1 && recipients[0].chain !== "cardano";
    if (recipients.length === 0 || onlyNonCardano) {
      // A single non-Cardano trader can still be viewed; their card explains they can't receive.
      setRecipients([trader]);
    } else if (trader.chain !== "cardano") {
      setRecipientNotice(`${name} uses a non-Cardano wallet, so they can't receive Cardano messages.`);
      return;
    } else if (recipients.some((r) => r.address === trader.address)) {
      setRecipientNotice(`${name} is already a recipient.`);
      return;
    } else if (recipients.length >= MAX_RECIPIENTS) {
      setRecipientNotice(`One message can go to at most ${MAX_RECIPIENTS} traders.`);
      return;
    } else {
      setRecipients([...recipients, trader]);
    }
    enrich(trader);
  }

  function removeRecipient(address: string) {
    setRecipientNotice(null);
    setRecipients((list) => list.filter((r) => r.address !== address));
  }

  function replyTo(trader: StrikeTrader) {
    setRecipientNotice(null);
    setAdding(false);
    setRecipients([trader]);
    enrich(trader);
    setTab("send");
  }

  function disconnect() {
    setWallet(null);
    setProfile(null);
    setProfileStatus("idle");
    setWalletChoices([]);
    setError(null);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden />
          <div>
            <span className={styles.brandName}>Strike tam-tam</span>
            <a className={styles.brandSub} href="https://matotam.io" target="_blank" rel="noreferrer">
              powered by matotam ↗
            </a>
          </div>
        </div>

        <div className={styles.walletArea}>
          {wallet ? (
            <>
              <span className={styles.walletChip}>
                <span className={styles.dot} aria-hidden />
                {WALLET_LABELS[wallet.walletId] ?? wallet.walletId} · {shortAddress(wallet.address)}
              </span>
              <button type="button" className={styles.ghostButton} onClick={disconnect}>
                Disconnect
              </button>
            </>
          ) : (
            <button type="button" className={styles.primaryButton} onClick={onConnectClick} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect wallet"}
            </button>
          )}
        </div>
      </header>

      <NewVersionBar />

      {walletChoices.length > 0 && (
        <div className={styles.walletPicker}>
          <span className={styles.hint}>Choose a wallet:</span>
          {walletChoices.map((id) => (
            <button key={id} type="button" className={styles.ghostButton} onClick={() => void connect(id)}>
              {WALLET_LABELS[id] ?? id}
            </button>
          ))}
        </div>
      )}

      {CARDANO_NETWORK !== "Mainnet" && (
        <p className={styles.devBanner}>
          Running on Cardano {CARDANO_NETWORK}. Strike accounts live on mainnet, so messages sent here won&apos;t reach
          them.
        </p>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <section className={styles.hero}>
        <h1 className={styles.title}>
          Message any <span className={styles.accent}>Strike</span> trader, on-chain.
        </h1>
        <p className={styles.lead}>
          Find a trader by nickname, ADA Handle or wallet and send them a message that lands straight in their Cardano
          wallet as an NFT. No sign-up and no server in between. Optionally encrypted.
        </p>
      </section>

      {wallet && (
        <section className={styles.panel}>
          {profileStatus === "found" && profile ? (
            <TraderCard trader={profile} caption="Your Strike identity" />
          ) : profileStatus === "none" ? (
            <div className={styles.rowBetween}>
              <p className={styles.hint}>
                This wallet isn&apos;t linked to a Strike account. You can still message Strike traders.
              </p>
              <a className={styles.primaryButton} href={STRIKE_REFERRAL_URL} target="_blank" rel="noreferrer">
                New to Strike? Open an account ↗
              </a>
            </div>
          ) : profileStatus === "error" ? (
            <div className={styles.rowBetween}>
              <p className={styles.error}>Couldn&apos;t reach Strike to look up your account.</p>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => void loadOwnProfile(wallet.knownAddresses)}
              >
                Try again
              </button>
            </div>
          ) : (
            <p className={styles.hint}>Looking up your Strike account…</p>
          )}
        </section>
      )}

      <nav className={styles.tabs} aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section className={styles.panel}>
        {tab === "send" && (
          <div className={styles.stack}>
            {recipients.length === 1 && (
              <TraderCard
                trader={recipients[0]}
                caption="Recipient"
                action={
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => removeRecipient(recipients[0].address)}
                  >
                    Change
                  </button>
                }
              />
            )}

            {recipients.length > 1 && (
              <div>
                <div className={styles.fieldHead}>
                  <span className={styles.fieldLabel}>Recipients</span>
                  <span className={styles.counter}>
                    {recipients.length}/{MAX_RECIPIENTS}
                  </span>
                </div>
                <ul className={styles.recipientList}>
                  {recipients.map((r) => (
                    <li key={r.address} className={styles.recipientRow}>
                      <span className={styles.resultName}>{traderDisplayName(r)}</span>
                      {r.rank30d ? <span className={styles.rank}>#{r.rank30d}</span> : null}
                      <span className={styles.mono}>{shortAddress(r.address)}</span>
                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() => removeRecipient(r.address)}
                        aria-label={`Remove ${traderDisplayName(r)}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {recipients.length === 0 || adding ? (
              <TraderSearch onSelect={selectRecipient} />
            ) : (
              recipients[0].chain === "cardano" &&
              recipients.length < MAX_RECIPIENTS && (
                <button type="button" className={styles.linkButton} onClick={() => setAdding(true)}>
                  + Add another recipient (up to {MAX_RECIPIENTS})
                </button>
              )
            )}
            {recipientNotice && <p className={styles.hint}>{recipientNotice}</p>}

            {recipients.length > 0 && recipients.every((r) => r.chain === "cardano") && (
              <Composer
                wallet={wallet}
                recipients={recipients}
                senderLabel={profile ? traderDisplayName(profile) : undefined}
                onConnectClick={onConnectClick}
              />
            )}
          </div>
        )}

        {tab === "inbox" && <Inbox wallet={wallet} onReply={replyTo} />}
      </section>

      <footer className={styles.footer}>
        <p>
          Strike tam-tam is built on{" "}
          <a href="https://matotam.io" target="_blank" rel="noreferrer">
            matotam
          </a>
          : wallet-to-wallet messages minted as Cardano NFTs.
        </p>
        <p>
          Trader data comes from the public Strike Finance API. This is an independent project, not affiliated with
          Strike Finance.
        </p>
      </footer>
    </div>
  );
}
