import { DEFAULT_TIME_ZONE } from "@figbud/ui";
import { Fragment, type ReactNode } from "react";

/** Replaces `{name}` placeholders in a dictionary string. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

/** Like `fill`, but placeholders can be React nodes (links, emphasis). */
export function fillNodes(template: string, values: Record<string, ReactNode>): ReactNode {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={i}>{key && key in values ? values[key] : part}</Fragment>;
  });
}

/**
 * A long, localised calendar date, as it was in East Africa Time (the display
 * zone, owner's brief of 14 Nov 2026), so a post published late in the
 * evening there shows that day. A fixed zone, so server and client agree.
 */
export function formatDate(iso: string, languageTag: string): string {
  return new Intl.DateTimeFormat(languageTag, { dateStyle: "long", timeZone: DEFAULT_TIME_ZONE }).format(
    new Date(iso),
  );
}
