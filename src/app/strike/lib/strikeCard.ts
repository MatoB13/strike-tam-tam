// src/app/strike/lib/strikeCard.ts
//
// The on-chain image of a Strike tam-tam message: a dark card in Strike's
// colours with the message, who sent it to whom, and the sender's mark.
//
// The mark ("dot beams") is derived only from the sender's address, so the
// same wallet always gets the same mark: a hammered gong carrying the last
// three address characters, with beams of dots growing away from it.
//
// Everything here ends up in transaction metadata (16 KB per transaction in
// total), so the SVG is kept compact: one decimal place, dots drawn as
// zero-length round-capped path segments, and base64 instead of URL-encoding.

const MINT = ["#4EFAB0", "#3AD99A", "#7CF5D0", "#26FAB0"];
const WIDTH = 600;
const MAX_LINE_CHARS = 40;
const LINE_HEIGHT = 32;
const MARK_SCALE = 1.3;

/** Deterministic 32-bit hash of `input` for a given `seed` (FNV-1a + avalanche). */
function hash(input: string, seed: number): number {
  let h = (0x811c9dc5 ^ Math.imul(seed + 1, 0x9e3779b1)) >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return h >>> 0;
}

/** Deterministic number in [0, 1). */
function unit(input: string, seed: number): number {
  return (hash(input, seed) % 1000) / 1000;
}

const f = (v: number) => (Math.round(v * 10) / 10).toString();

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type SenderMark = {
  /** Last three characters of the sender address, as shown on the gong. */
  tag: string;
  color: string;
  rays: number;
};

export function senderMarkTraits(senderAddress: string): SenderMark {
  return {
    tag: senderAddress.slice(-3).toUpperCase(),
    color: MINT[hash(senderAddress, 1) % MINT.length],
    rays: 7 + (hash(senderAddress, 4) % 3),
  };
}

/** The sender mark as SVG elements in a 160×100 box (no outer <svg>). */
export function senderMarkSvg(senderAddress: string): string {
  const a = senderAddress;
  const { tag, color, rays } = senderMarkTraits(a);
  const cx = 34;
  const cy = 50;
  const r = 17;

  // Gong with a slightly wobbly rim.
  const lobes = 3 + (hash(a, 2) % 3);
  const phase = unit(a, 3) * 6.283;
  const rim: string[] = [];
  for (let j = 0; j < 24; j++) {
    const t = (j / 24) * 6.283;
    const rr = r + Math.sin(lobes * t + phase);
    rim.push(`${f(cx + rr * Math.cos(t))} ${f(cy + rr * Math.sin(t))}`);
  }

  // Hammer marks on the gong face.
  const hammer: string[] = [];
  for (let i = 0; i < 6; i++) {
    const t = unit(a, 70 + i) * 6.283;
    const d = unit(a, 80 + i) * r * 0.55;
    hammer.push(`M${f(cx + d * Math.cos(t))} ${f(cy + d * Math.sin(t))}h0`);
  }

  // Address tag stamped in a circle on the gong face.
  const tr = r * 0.66;
  const tagPath = `M${f(cx - tr)} ${cy}a${f(tr)} ${f(tr)} 0 1 1 ${f(2 * tr)} 0a${f(tr)} ${f(tr)} 0 1 1 ${f(-2 * tr)} 0`;

  // Dot beams: one group per distance step, dots grow and brighten outward.
  const spread = 30 + unit(a, 5) * 14;
  const beams: string[] = [];
  for (let k = 0; k < 6; k++) {
    const dots: string[] = [];
    for (let i = 0; i < rays; i++) {
      if (unit(a, 200 + i * 6 + k) < 0.18) continue;
      const ang = ((-spread + (2 * spread * i) / (rays - 1)) * Math.PI) / 180;
      const rad = 27 + k * 19;
      const x = cx + rad * Math.cos(ang);
      const y = cy + rad * Math.sin(ang);
      if (x < 153 && y > 7 && y < 93) dots.push(`M${f(x)} ${f(y)}h0`);
    }
    if (dots.length) {
      beams.push(
        `<path d="${dots.join("")}" stroke-width="${f(2 * (1.2 + k * 0.55))}" stroke-opacity="${f(0.45 + k * 0.11)}"/>`
      );
    }
  }

  return (
    `<path d="M${rim.join("L")}Z" fill="${color}"/>` +
    `<path d="${hammer.join("")}" stroke="#0a0a0a" stroke-opacity=".35" stroke-width="2" stroke-linecap="round"/>` +
    `<path id="t" d="${tagPath}" fill="none"/>` +
    `<text font-family="monospace" font-size="5.6" font-weight="bold" fill="#0a0a0a" fill-opacity=".75" letter-spacing=".8"><textPath href="#t" xlink:href="#t">${escapeXml(`${tag} ${tag} ${tag}`)}</textPath></text>` +
    `<circle cx="${cx}" cy="${cy}" r="${f(r * 0.3)}" fill="#0a0a0a" fill-opacity=".45"/>` +
    `<g fill="none" stroke="${color}" stroke-linecap="round">${beams.join("")}</g>`
  );
}

/**
 * Word-wrap to lines of `MAX_LINE_CHARS`; long words are split. 14 lines fit
 * any 256-character message, so nothing is cut in practice.
 */
export function wrapCardText(text: string, maxLines = 14): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  const push = (line: string) => {
    if (lines.length < maxLines) lines.push(line);
  };
  for (let word of words) {
    while (word.length > MAX_LINE_CHARS) {
      if (current) {
        push(current);
        current = "";
      }
      push(word.slice(0, MAX_LINE_CHARS));
      word = word.slice(MAX_LINE_CHARS);
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= MAX_LINE_CHARS) {
      current = candidate;
    } else {
      push(current);
      current = word;
    }
  }
  if (current) push(current);
  return lines;
}

export type StrikeCardParams = {
  senderAddress: string;
  fromLabel: string;
  toLabel: string;
  /** Text shown on the card (for encrypted messages: the placeholder). */
  text: string;
  /** matotam's date-based rarity code, e.g. Y00D294. */
  rarityCode: string;
  /** Thread index, e.g. "001". */
  threadIndex: string;
};

export function buildStrikeCardSvg(params: StrikeCardParams): string {
  const lines = wrapCardText(params.text);
  const textTop = 112;
  const markTop = textTop + Math.max(1, lines.length) * LINE_HEIGHT - 8;
  const height = markTop + Math.round(100 * MARK_SCALE) + 12;
  const label = (s: string) => escapeXml(s.length > 26 ? `${s.slice(0, 25)}…` : s);

  const textSvg = lines
    .map((line, i) => `<text x="40" y="${textTop + i * LINE_HEIGHT}">${escapeXml(line)}</text>`)
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}">` +
    `<rect x="2" y="2" width="${WIDTH - 4}" height="${height - 4}" rx="22" fill="#111" stroke="#4EFAB0" stroke-width="2"/>` +
    `<text x="40" y="58" fill="#a1a1a1" font-size="13" font-family="monospace">FROM ${label(params.fromLabel)} · TO ${label(params.toLabel)}</text>` +
    `<g fill="#fff" font-size="24" font-family="Helvetica,Arial,sans-serif">${textSvg}</g>` +
    `<g transform="translate(24 ${markTop}) scale(${MARK_SCALE})">${senderMarkSvg(params.senderAddress)}</g>` +
    `<text x="560" y="${height - 52}" text-anchor="end" fill="#4EFAB0" font-size="16" font-weight="bold" font-family="Helvetica,Arial,sans-serif">Strike tam-tam</text>` +
    `<text x="560" y="${height - 32}" text-anchor="end" fill="#6b6b6b" font-size="12" font-family="monospace">strike.matotam.io · ${escapeXml(params.rarityCode)} · #${escapeXml(params.threadIndex)}</text>` +
    `</svg>`
  );
}

/** Base64 data URI; UTF-8 safe (emoji, diacritics) and smaller than URL-encoding. */
export function svgToBase64DataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}
