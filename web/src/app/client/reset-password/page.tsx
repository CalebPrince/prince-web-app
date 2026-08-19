"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function ClientResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.clientResetPassword({ token, password });
      window.location.href = "/client/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
      setLoading(false);
    }
  };

  if (token === null) {
    return null; // Initial render
  }

  return (
    <section className="relative flex min-h-screen items-center justify-center px-6 py-24">
      <div className="absolute inset-0 -z-10">
        <div className="absolute right-1/4 top-0 h-[32rem] w-[32rem] translate-x-1/2 rounded-full bg-accent/10 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite_reverse]" />
      </div>

      <div className="w-full max-w-[420px] rounded-[24px] border border-hairline bg-card p-8 md:p-10 shadow-2xl shadow-bg-2/50 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <p className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-accent">
          Client portal
        </p>

        {!token ? (
          <div className="text-center py-6">
            <h1 className="mb-3 text-3xl font-extrabold tracking-tight">Invalid Link</h1>
            <p className="mb-8 text-sm text-text-2">
              Reset links expire after an hour. Request a new one below.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/client/forgot-password">Request a new link</Link>
            </Button>
          </div>
        ) : (
          <>
            <h1 className="mb-3 text-center text-3xl font-extrabold tracking-tight">Choose a new password</h1>
            <p className="mb-8 text-center text-sm text-text-2">
              Must be at least 10 characters.
            </p>

            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <label htmlFor="password" className="label mb-2 block font-medium">New password</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    id="password" 
                    required 
                    minLength={10}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 10 characters"
                    className="h-12 w-full rounded-[var(--radius)] border border-hairline-strong bg-bg/60 pl-4 pr-12 text-text placeholder:text-muted transition-colors focus:border-accent/60 focus:outline-none" 
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-muted transition-colors hover:text-text"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded border border-red-900/50 bg-red-900/10 p-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full h-12 mt-2">
                {loading ? "Resetting..." : "Reset password"}
              </Button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
