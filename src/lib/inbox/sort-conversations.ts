import type { Conversation } from "@/types";

function lastMessageTime(c: Conversation): number {
  if (!c.last_message_at) return 0;
  const t = Date.parse(c.last_message_at);
  return Number.isNaN(t) ? 0 : t;
}

/** Newest `last_message_at` first; threads with no messages go last. */
export function sortConversationsByLastMessage(
  list: Conversation[],
): Conversation[] {
  return [...list].sort((a, b) => lastMessageTime(b) - lastMessageTime(a));
}
