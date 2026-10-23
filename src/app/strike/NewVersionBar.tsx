"use client";

import { useEffect, useState } from "react";
import styles from "./strike.module.css";
import { isNewerBuildLive } from "./lib/strikeVersion";

/** Asks to reload once a newer deploy is live (checked every 2 minutes and on focus). */
export default function NewVersionBar() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const check = async () => {
      if (await isNewerBuildLive()) setStale(true);
    };
    const id = window.setInterval(() => void check(), 120_000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!stale) return null;
  return (
    <div className={styles.versionBar} role="status">
      <span>A newer version of Strike tam-tam is live.</span>
      <button type="button" className={styles.primaryButton} onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}
