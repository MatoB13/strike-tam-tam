// src/app/strike/lib/strikeVersion.ts
//
// A tab opened before a deploy keeps running the old page code, and old code
// would mint with old rules (that's how a message once got a matotam-… name
// after the switch to striketamtam-…). Before sending, the page checks that
// it is still the live build; /api/version is matotam's shared build endpoint.

const OWN_BUILD = process.env.APP_BUILD_ID ?? null;

export const STALE_PAGE_MESSAGE = "A newer version of Strike tam-tam is live. Reload the page before sending.";

/** True when the server already serves a different build than this page. */
export async function isNewerBuildLive(): Promise<boolean> {
  if (!OWN_BUILD) return false;
  try {
    const resp = await fetch("/api/version", { cache: "no-store" });
    const json = (await resp.json()) as { build?: string | null };
    return !!json.build && json.build !== OWN_BUILD;
  } catch {
    return false; // offline or mid-deploy: don't block on the check itself
  }
}
