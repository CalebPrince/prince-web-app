export type CodeAgentTurn = { role: "user" | "agent"; text: string; provider?: string };
export type CodeAgentChat = { id: string; title: string; updatedAt: string; turns: CodeAgentTurn[] };

const KEY = "admin-code-agent-chats-v2";
export const CHAT_EVENT = "code-agent:chats-changed";

export function loadCodeAgentChats(): CodeAgentChat[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export function saveCodeAgentChat(chat: CodeAgentChat) {
  const chats = loadCodeAgentChats().filter((item) => item.id !== chat.id);
  localStorage.setItem(KEY, JSON.stringify([chat, ...chats].slice(0, 30)));
  window.dispatchEvent(new Event(CHAT_EVENT));
}

export function newCodeAgentChatId() {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
