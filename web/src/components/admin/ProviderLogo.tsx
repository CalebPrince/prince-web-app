import { BsOpenai } from "react-icons/bs";
import { SiAnthropic, SiGooglegemini, SiOpenrouter } from "react-icons/si";

export function ProviderLogo({ provider, className = "size-5" }: { provider: string; className?: string }) {
  if (provider === "gemini") return <SiGooglegemini className={className} aria-label="Google Gemini" />;
  if (provider === "anthropic") return <SiAnthropic className={className} aria-label="Anthropic" />;
  if (provider === "openai") return <BsOpenai className={className} aria-label="OpenAI" />;
  if (provider === "openrouter") return <SiOpenrouter className={className} aria-label="OpenRouter" />;
  if (provider === "groq") return <span className="font-black lowercase tracking-[-0.08em]" aria-label="Groq">groq</span>;
  return <span className="font-mono text-xs font-bold uppercase">{provider.slice(0, 2)}</span>;
}
