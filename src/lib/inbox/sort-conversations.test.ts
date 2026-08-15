import { describe, expect, it } from "vitest";
import { sortConversationsByLastMessage } from "./sort-conversations";
import type { Conversation } from "@/types";

function conv(id: string, last_message_at?: string): Conversation {
  return { id, last_message_at } as Conversation;
}

describe("sortConversationsByLastMessage", () => {
  it("puts the newest message first and drops empty threads", () => {
    const older = conv("a", "2026-08-01T10:00:00.000Z");
    const newer = conv("b", "2026-08-15T10:00:00.000Z");
    const empty = conv("c");
    expect(
      sortConversationsByLastMessage([empty, older, newer]).map((c) => c.id),
    ).toEqual(["b", "a"]);
  });
});
