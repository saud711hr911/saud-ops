// بصمة العنصر — معرّف مستند حتمي يمنع معالجة الخبر نفسه مرتين.

import { normalizeForMatch } from "./text.ts";
import type { RawItem } from "./types.ts";

/** FNV-1a 64 بت كنص سداسي — خالص وبلا مكتبات، يكفي لمنع التكرار لا للتشفير */
export function fnv1a64(value: string): string {
  const mask = BigInt("0xffffffffffffffff");
  const prime = BigInt("0x100000001b3");
  let hash = BigInt("0xcbf29ce484222325");
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_")) url.searchParams.delete(key);
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "")}${url.search}`;
  } catch {
    return value.trim();
  }
}

export function itemFingerprint(sourceId: number, item: RawItem): string {
  const basis = item.externalId?.trim() || (item.url ? canonicalUrl(item.url) : "") || normalizeForMatch(item.title);
  return `${sourceId}__${fnv1a64(basis)}`;
}
