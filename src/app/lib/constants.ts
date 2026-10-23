// Shared constants (from matotam, trimmed to what Strike tam-tam uses).

export const WALLET_LABELS: Record<string, string> = {
  nami: "Nami",
  eternl: "Eternl",
  lace: "Lace",
  vespr: "VESPR",
  flint: "Flint",
};

// Prefer explicit env, otherwise choose a safe default based on NEXT_PUBLIC_NETWORK.
const NETWORK_ENV = (process.env.NEXT_PUBLIC_NETWORK || "").toLowerCase();

export const CARDANO_NETWORK = (() => {
  if (NETWORK_ENV === "mainnet") return "Mainnet";
  if (NETWORK_ENV === "preview") return "Preview";
  if (NETWORK_ENV === "preprod") return "Preprod";
  return "Preprod";
})() as "Mainnet" | "Preprod" | "Preview";

// Real Blockfrost credentials. SERVER-ONLY (no NEXT_PUBLIC_ prefix), so they are
// never inlined into client JS bundles. Only import these from server code.
export const BLOCKFROST_SERVER_API =
  process.env.BLOCKFROST_API?.trim() ||
  (CARDANO_NETWORK === "Mainnet"
    ? "https://cardano-mainnet.blockfrost.io/api/v0"
    : CARDANO_NETWORK === "Preview"
    ? "https://cardano-preview.blockfrost.io/api/v0"
    : "https://cardano-preprod.blockfrost.io/api/v0");

export const BLOCKFROST_SERVER_KEY = process.env.BLOCKFROST_KEY?.trim() || "";

// Client-safe values (matotam's own proxy route; Strike tam-tam uses /api/strike/blockfrost).
export const BLOCKFROST_API = "/api/blockfrost";
export const BLOCKFROST_KEY = "via-server-proxy";

// matotam service address: one of the keys in every message's minting policy,
// so the matotam service can also burn a message NFT on request.
export const DEV_ADDRESS =
  "addr1q8d5hu0c0x9vyklqdshkx6t0mw3t9tv46c6g4wvqecduqq2e9wy54x7ffcdly855h96s805k9e3z4pgpmeyu5tjfudfsksgfnq";
