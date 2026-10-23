# Strike tam-tam

**On-chain messages for Strike Finance traders.**
Find any Strike trader by nickname, ADA Handle or wallet and send them a message that lands in their Cardano wallet as an NFT, to one trader or up to ten at once.

- **Live:** https://strike.matotam.io
- **Code:** this repository — the site in `src/app/strike`, server routes in `src/app/api/strike`, the matotam helpers it builds on in `src/app/lib`
- Built for the Strike hackathon, 21–23 October 2026, on top of [matotam](https://matotam.io) (wallet-to-wallet messages on Cardano)

> A tam-tam is a drum that carried messages across distance. Every sender gets their own beat.

---

## Why

Hundreds of traders are active on Strike every day, with copy trading and vaults, but there is no way for them to reach each other. A follower can't thank a lead, a trader can't contact the #1 of the month, a vault leader can't reach the people behind the addresses. Discord handles are not wallets, and anyone can claim to be anyone there.

On Cardano, the wallet *is* the identity. Strike tam-tam ties Strike's public trader data to Cardano addresses and turns a message into something the recipient owns:

- **Real sender.** The message is minted and paid for from the sender's wallet, visible on-chain; the inbox shows the sender's Strike nickname, PnL and win rate.
- **Lands in the wallet.** No sign-up, no app to install, no server holding messages. It stays even if this site disappears.
- **Private when needed.** Optional AES-GCM encryption with a passphrase; only a placeholder is readable on-chain.
- **Spam-resistant by design.** Every message costs its sender ADA.

## What it does

| | |
|---|---|
| **Find a trader** | Search Strike's leaderboard by nickname, ADA Handle, account ID or address. See 30-day and all-time PnL, ROI, win rate, volume and 30-day rank before you write. |
| **Your Strike identity** | Connect a CIP-30 wallet (Eternl, Lace, VESPR, …); every address the wallet has used is checked against Strike. Wallets without a Strike account get a sign-up link. |
| **Send** | Write up to 256 characters, optionally encrypt, see a live preview of the exact NFT, sign once. About 1.5–2 ADA, of which ~1.2 ADA travels with the NFT to the recipient. Strike tam-tam charges nothing. |
| **Send to up to 10** | Add more traders to the same message. Each gets their own NFT; two messages go in one transaction, so ten traders take five wallet signatures. Failed transactions can be retried. |
| **Inbox** | Received Strike tam-tam *and* original matotam messages, newest first, with a "Strike trader" badge and stats for senders who trade on Strike. Decrypt in place, reply in one click. Fast for wallets with thousands of tokens. |

## The message NFT

Each message is a CIP-25 NFT with a fully on-chain SVG card in Strike's colours: the text, who sent it to whom, and the **sender's mark** — a hammered gong stamped with the last three characters of the sender's address, with beams of dots growing away from it. The mark is derived only from the sender's address, so the same wallet always has the same mark.

- **Asset name:** `striketamtam-<sss>-<rrr>-<NNN>-<xx>` (last 3 characters of sender and recipient addresses, thread number, random suffix)
- **Policy:** native script `any` of sender key, recipient key, matotam service key — any of them can burn the NFT later; no one else can mint under it
- **Metadata:** `striketamtam-metadata-v1`, field-compatible with matotam (`Sender`, `Receiver`, `Message`, `Thread`, `Thread index`, `matotam_encrypted`, …), so matotam.io's inbox reads and decrypts these too
- **Size:** ≤ 5.1 KB of metadata for the longest message (measured CBOR); a real two-message transaction built from a live wallet is ~11 KB of the 16 KB limit

| Field | Content |
|---|---|
| `name` | asset name |
| `image` | base64 SVG card, in 64-character segments |
| `Message` | text (ASCII-safe); placeholder when encrypted |
| `Sender`, `Receiver` | full addresses, segmented |
| `Thread`, `Thread index` | `striketamtam-<sss>-<rrr>`, `001`… |
| `mark` | `{ style: "dot-beams", tag, color, rays }` |
| `matotam_encrypted` | `{ version, salt, nonce, iterations, cipherText }` when encrypted (AES-GCM, PBKDF2 210k) |
| `source`, `version`, `protocol` | `https://strike.matotam.io`, `striketamtam-metadata-v1`, `striketamtam` |

## How it uses Strike

All reads are public and keyless; Strike tam-tam never trades, holds funds or uses a Strike API key.

| Endpoint | Used for |
|---|---|
| `GET /stat/v1/stats/leaderboard?search=` | find traders by nickname, ADA Handle, account ID, address |
| `GET /stat/v1/stats/leaderboard?addresses=` | your own identity; badges for inbox senders (batch) |
| `GET /stat/v1/stats/leaderboard?locate=` | 30-day rank |

Responses are fetched server-side and cached for a few minutes.

Worth sharing with the Strike team: about 94% of Strike accounts with a wallet use a Cardano address (2,000 Cardano, 88 Ethereum, 34 Solana on the all-time leaderboard), so almost every trader can receive a message today.

## Architecture

```
strike.matotam.io ──▶ Strike tam-tam page (Next.js, client)
  │
  ├─ CIP-30 wallet ─▶ Lucid ─▶ /api/strike/blockfrost   (key stays on the server; allowlist + rate limit)
  ├─ /api/strike/traders  ─▶ Strike leaderboard API
  └─ /api/strike/inbox    ─▶ Koios account_assets + asset_info (Blockfrost as fallback)
```

- **Inbox:** message NFTs are recognised by asset name alone (`striketamtam-…`, `matotam-…`), so only real messages need metadata — two Koios calls for a typical wallet.
- **Several recipients:** one NFT per trader, two per transaction, each transaction signed separately; failed batches can be retried, oversized batches fall back to single messages.
- **Fee guard:** near the 16 KB limit Lucid/CML silently drops the change output and burns the leftover as fee (we measured a three-message transaction with a 9.7 ADA fee). Strike tam-tam refuses to sign any transaction over 15.5 KB or with a fee above 2 ADA.
- **Stale tabs:** before sending, the page checks it is still the live build, so an old tab can't mint with outdated rules.
- **Deployment:** the live site at strike.matotam.io runs this same code as part of the matotam deployment (a `strike.` host rewrite to `/strike`). This repository is the standalone, runnable copy.

## Built during the hackathon vs. reused

**Reused from matotam (existed before, copied into `src/app/lib`):** the minting policy (`matotamPolicy.ts`), passphrase encryption (`encryption.ts`), metadata text helpers (`textEncoding.ts`, `segments.ts`, `quickBurn.ts`, `rarity.ts`), wallet helpers (`wallet.ts`), Lucid's patched Blockfrost provider, and matotam's NFT field layout.

**Built 21–23 October 2026** (~3,700 lines in `src/app/strike` and `src/app/api/strike`): the whole Strike tam-tam site — Strike trader search and identity, the Strike card and sender mark, striketamtam metadata and numbering, the inbox (Koios + Blockfrost), sending to up to ten traders, and the server routes.

Along the way we also fixed a privacy bug in matotam itself: encrypted messages had their plaintext in the NFT image and metadata.

## Limitations

- Only Cardano wallets can receive. Ethereum and Solana traders are shown but marked as unreachable.
- A message costs the sender ~1.5–2 ADA (mostly the min-UTxO that travels with the NFT and returns if the recipient burns it).
- Sending to several traders costs ~1.5–2 ADA per trader and one wallet signature per two traders.
- Strike data is a snapshot of the public API (cached for minutes).

## What's next

- **Notifications inside Strike:** Strike could show "you have a message" by reading `/api/strike/inbox` for the connected wallet.
- **Vaults and copy trading:** vault leader → depositors and lead ↔ follower messages, e.g. with a cheaper shared format for large groups.
- **Clan messages** for clan chiefs and members; recruiting messages.
- **Signed read receipts** (CIP-8) and threaded conversations.
- **Builder Codes:** trade from a message ("join my vault", "copy this position") with Strike Builder Connect.

## Run locally

```bash
npm install
npm run dev
```

`.env.local`:

```
NEXT_PUBLIC_NETWORK=mainnet
BLOCKFROST_KEY=<server-only Blockfrost project id>
KOIOS_API_TOKEN=<optional, server-only>
```

Open http://localhost:3000.

---

Independent project, not affiliated with Strike Finance. Trader data comes from the public Strike Finance API.
