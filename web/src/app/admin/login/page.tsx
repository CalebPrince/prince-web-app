"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // In a full migration, we would use the actual api.ts client here.
      // For now, we fetch directly to the backend proxy route.
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(body?.error || body?.errors?.join(" ") || "Invalid credentials");
      }

      if (body.requires_2fa) {
        // Handle 2FA logic here when ready
        setError("2FA is required but not yet implemented in the Next.js port. Please disable 2FA to test this, or use the legacy login.");
        setIsLoading(false);
        return;
      }

      // Success, route to dashboard
      router.push("/admin");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-bg">
      {/* Brand Panel (Left Column) */}
      <div className="hidden md:flex flex-1 bg-bg-2 border-r border-hairline flex-col justify-center px-12 lg:px-24">
        <div className="max-w-md">
          <Logo className="mb-6 scale-125 origin-left" />
          <p className="text-text-2 text-lg">
            // Portfolio Admin — manage projects, proposals, payments, and content from one place.
          </p>
        </div>
      </div>

      {/* Form Panel (Right Column) */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 md:px-12 lg:px-24">
        <div className="w-full max-w-md mx-auto">
          <div className="mb-8">
            <p className="text-xs text-text-2 font-mono uppercase tracking-wider mb-2">// Admin access</p>
            <h2 className="text-3xl font-bold tracking-tight mb-2">Log in</h2>
            <p className="text-sm text-text-2 md:hidden">Prince Caleb — Portfolio Admin</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2" htmlFor="email">Email</label>
              <input 
                id="email" 
                type="email" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-2 bg-bg border border-hairline rounded-md focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" htmlFor="password">Password</label>
              <div className="relative">
                <input 
                  id="password" 
                  type={showPassword ? "text" : "password"} 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="w-full px-4 py-2 bg-bg border border-hairline rounded-md focus:outline-none focus:border-accent pr-10"
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-text-2 hover:text-text transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-500 text-sm">
                {error}
              </div>
            )}

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full py-2.5 bg-text text-bg rounded-md font-medium hover:bg-text-2 transition-colors disabled:opacity-50"
            >
              {isLoading ? "Logging in..." : "Log in"}
            </button>
          </form>

          <div className="mt-8 text-center md:text-left">
            <a href="/" className="text-sm text-text-2 hover:text-accent transition-colors">
              &larr; Return to website
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
