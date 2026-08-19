"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function ClientForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.clientForgotPassword({ email });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="relative flex min-h-screen items-center justify-center px-6 py-24">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/10 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
      </div>

      <div className="w-full max-w-[420px] rounded-[24px] border border-hairline bg-card p-8 md:p-10 shadow-2xl shadow-bg-2/50 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <p className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-accent">
          Client portal
        </p>

        {sent ? (
          <div className="text-center py-4">
            <h1 className="mb-3 text-3xl font-extrabold tracking-tight">Check your email</h1>
            <p className="mb-8 text-sm text-text-2">
              If an account exists for that address, a reset link is on its way.
            </p>
            <Button asChild variant="outline" className="w-full h-12">
              <Link href="/client/login">Back to login</Link>
            </Button>
          </div>
        ) : (
          <>
            <h1 className="mb-3 text-center text-3xl font-extrabold tracking-tight">Reset password</h1>
            <p className="mb-8 text-center text-sm text-text-2">
              Enter your email and we'll send you a reset link.
            </p>

            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="label mb-2 block font-medium">Email</label>
                <input 
                  type="email" 
                  id="email" 
                  required 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-12 w-full rounded-[var(--radius)] border border-hairline-strong bg-bg/60 px-4 text-text placeholder:text-muted transition-colors focus:border-accent/60 focus:outline-none" 
                />
              </div>

              {error && (
                <div className="rounded border border-red-900/50 bg-red-900/10 p-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full h-12 mt-2">
                {loading ? "Sending..." : "Send reset link"}
              </Button>
            </form>

            <div className="mt-8 text-center">
              <Link href="/client/login" className="text-sm font-medium text-text-2 transition-colors hover:text-text">
                &larr; Back to login
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
