import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import styles from "./strike.module.css";

const display = Space_Grotesk({
  variable: "--strike-font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = IBM_Plex_Sans({
  variable: "--strike-font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const mono = IBM_Plex_Mono({
  variable: "--strike-font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const siteUrl = "https://strike.matotam.io";
const description =
  "Send on-chain messages to Strike Finance traders by nickname or ADA Handle. Every message is a Cardano NFT, delivered wallet to wallet. Built on matotam.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Strike tam-tam",
  description,
  applicationName: "Strike tam-tam",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Strike tam-tam",
    title: "Strike tam-tam",
    description,
  },
  twitter: {
    card: "summary",
    title: "Strike tam-tam",
    description,
  },
};

export default function StrikeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`${display.variable} ${body.variable} ${mono.variable} ${styles.shell}`}>
      {children}
    </div>
  );
}
