// المحوّلات: نص المصدر ← عناصر خام موحّدة. لا شبكة هنا.
//
// - rss:       RSS 2.0 و Atom 1.0
// - json_feed: JSON Feed 1.1 (https://jsonfeed.org) — الشكل الأبسط لأي واجهة تنشر قائمة أخبار
//
// لإضافة قناة رسمية لاحقًا (واجهة برمجية لجهة، أو صفحة HTML بعينها): أضف نوعًا إلى
// SourceKind ومحوّلًا هنا يعيد RawItem[]، ولا يتغير شيء آخر.

import type { RawItem, SourceKind } from "./types.ts";
import { decodeEntities, stripTags } from "./text.ts";

const MAX_ITEMS = 100;

function tag(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  if (!match) return null;
  const inner = match[1].trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdata ? cdata[1] : decodeEntities(inner);
}

function atomLink(block: string): string | null {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((match) => match[1]);
  const preferred = links.find((attrs) => /rel=["']alternate["']/i.test(attrs)) ?? links.find((attrs) => !/rel=/i.test(attrs)) ?? links[0];
  const href = preferred?.match(/href=["']([^"']+)["']/i);
  return href ? decodeEntities(href[1]) : null;
}

function toIso(value: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value.trim());
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function parseFeed(xml: string): RawItem[] {
  const items: RawItem[] = [];
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = [...xml.matchAll(isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);

  for (const block of blocks.slice(0, MAX_ITEMS)) {
    const title = stripTags(tag(block, "title") ?? "");
    if (!title) continue;
    const url = isAtom ? atomLink(block) : (tag(block, "link")?.trim() || null);
    const summary = stripTags(
      (isAtom ? tag(block, "summary") ?? tag(block, "content") : tag(block, "description") ?? tag(block, "content:encoded")) ?? "",
    );
    items.push({
      externalId: (isAtom ? tag(block, "id") : tag(block, "guid"))?.trim() || null,
      title,
      url,
      publishedAt: toIso(isAtom ? tag(block, "updated") ?? tag(block, "published") : tag(block, "pubDate") ?? tag(block, "dc:date")),
      summary: summary.slice(0, 4000),
    });
  }
  return items;
}

export function parseJsonFeed(text: string): RawItem[] {
  const data = JSON.parse(text) as { items?: unknown };
  if (!Array.isArray(data.items)) throw new Error("JSON Feed بلا مصفوفة items");
  const items: RawItem[] = [];
  for (const entry of data.items.slice(0, MAX_ITEMS)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const title = typeof row.title === "string" ? stripTags(row.title) : "";
    if (!title) continue;
    const str = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : null);
    items.push({
      externalId: str("id") ?? (typeof row.id === "number" ? String(row.id) : null),
      title,
      url: str("url") ?? str("external_url"),
      publishedAt: toIso(str("date_published") ?? str("date_modified")),
      summary: stripTags(str("content_text") ?? str("summary") ?? str("content_html") ?? "").slice(0, 4000),
    });
  }
  return items;
}

export const ADAPTERS: Record<SourceKind, (body: string) => RawItem[]> = {
  rss: parseFeed,
  json_feed: parseJsonFeed,
};

export const SOURCE_KIND_LABELS_AR: Record<SourceKind, string> = {
  rss: "RSS / Atom",
  json_feed: "JSON Feed",
};
