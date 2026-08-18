"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const fieldCls =
  "h-9 w-full rounded-[var(--radius)] border border-hairline-strong bg-bg px-3 text-sm text-text placeholder:text-muted transition-colors focus:border-accent/60 focus:outline-none";

export function LeaveMessageForm({
  prefillMessage,
  showBack,
  onBack,
  onSubmit,
}: {
  prefillMessage?: string;
  showBack?: boolean;
  onBack?: () => void;
  onSubmit: (data: { name: string; email: string; phone: string; message: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(prefillMessage ?? "");
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      await onSubmit({ name, email, phone, message });
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-t border-hairline p-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        required
        className={fieldCls}
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email"
        required
        className={fieldCls}
      />
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone number (optional)"
        className={fieldCls}
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="What can Prince help you with?"
        rows={3}
        required
        className={cn(fieldCls, "h-auto resize-none py-2")}
      />
      <div className="flex gap-2">
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0")}
          >
            Back
          </button>
        )}
        <button
          type="submit"
          disabled={sending}
          className={cn(buttonVariants({ size: "sm" }), "flex-1 disabled:opacity-40")}
        >
          {sending ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
