import type { Conversation } from "@/types";

function lastMessageTime(c: Conversation): number {
  if (!c.last_message_at) return 0;
  const t = Date.parse(c.last_message_at);
  return Number.isNaN(t) ? 0 : t;
}

/** Inbox only lists threads that have actually sent or received a message. */
export function hasInboxActivity(c: Conversation): boolean {
  return Boolean(c.last_message_at);
}

/** Newest `last_message_at` first. Empty threads are dropped. */
export function sortConversationsByLastMessage(
  list: Conversation[],
): Conversation[] {
  return list
    .filter(hasInboxActivity)
    .sort((a, b) => lastMessageTime(b) - lastMessageTime(a));
}
