// src/app/strike/lib/strikeConfig.ts
import { CARDANO_NETWORK } from "@/app/lib/constants";

/** Sign-up link for wallets without a Strike account (the project's referral code). */
export const STRIKE_REFERRAL_URL =
  "https://app.strikefinance.org/trade/BTC?referralCode=23854f3798bd4f2586197052347bd0d8";

const EXPLORER_HOST =
  CARDANO_NETWORK === "Mainnet"
    ? "cardanoscan.io"
    : CARDANO_NETWORK === "Preview"
    ? "preview.cardanoscan.io"
    : "preprod.cardanoscan.io";

export function txExplorerUrl(txHash: string): string {
  return `https://${EXPLORER_HOST}/transaction/${txHash}`;
}

/** Cardanoscan token page; takes an asset fingerprint (asset1...) or unit. */
export function tokenExplorerUrl(fingerprintOrUnit: string): string {
  return `https://${EXPLORER_HOST}/token/${fingerprintOrUnit}`;
}

/** pool.pm shows the NFT image in full size; it takes an asset fingerprint (asset1…). */
export function poolPmUrl(fingerprint: string): string {
  return `https://pool.pm/${fingerprint}`;
}

/** Whether an address belongs to the Cardano network this deployment mints on. */
export function isAddressOnCurrentNetwork(address: string): boolean {
  return CARDANO_NETWORK === "Mainnet" ? address.startsWith("addr1") : address.startsWith("addr_test1");
}
