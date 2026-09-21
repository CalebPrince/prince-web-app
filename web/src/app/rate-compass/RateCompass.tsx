"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Compass, FileText, LoaderCircle, RotateCcw, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

type Option = { label: string; detail: string; factor: number };
type Currency = "GHC" | "USD";

const PROJECTS = [
  { name: "Simple website / landing page", low: 3000, high: 8000 },
  { name: "Business / custom website", low: 8000, high: 20000 },
  { name: "E-commerce site", low: 15000, high: 35000 },
  { name: "Web app / SaaS (MVP)", low: 25000, high: 70000 },
  { name: "Mobile app — one platform", low: 20000, high: 45000 },
  { name: "AI agent / automation", low: 12000, high: 40000 },
];

const COMPLEXITY: Option[] = [
  { label: "Simple", detail: "Mostly standard components, little custom logic", factor: 0.85 },
  { label: "Moderate", detail: "Custom features, a couple of integrations", factor: 1 },
  { label: "Complex", detail: "Several integrations, payments, real-time", factor: 1.25 },
  { label: "Highly complex", detail: "AI/automation, scale or compliance needs", factor: 1.5 },
];
const TIMELINE: Option[] = [
  { label: "Relaxed", detail: "Flexible deadline", factor: 0.9 },
  { label: "Normal", detail: "A few weeks to a couple months", factor: 1 },
  { label: "Rushed", detail: "Tight or urgent deadline", factor: 1.3 },
];
const EXPERIENCE: Option[] = [
  { label: "New to it", detail: "First time building this kind of thing", factor: 0.85 },
  { label: "Comfortable", detail: "Done similar work before", factor: 1 },
  { label: "A specialty", detail: "Deeply experienced in this exact area", factor: 1.18 },
];
const MARKET: Option[] = [
  { label: "Local Ghana client", detail: "Paying in GHC", factor: 1 },
  { label: "International client", detail: "Paying in USD / GBP / EUR", factor: 1.65 },
];
const RELATIONSHIP: Option[] = [
  { label: "One-off", detail: "Unlikely to return", factor: 1.05 },
  { label: "Repeat / referral", detail: "Known client or strong referral", factor: 1 },
  { label: "Retainer potential", detail: "Could grow into ongoing work", factor: 0.95 },
];
const SUPPORT: Option[] = [
  { label: "None included", detail: "Project ends at handover", factor: 0.94 },
  { label: "Basic support", detail: "Bug fixes for a set period", factor: 1 },
  { label: "Ongoing retainer", detail: "Paid maintenance included", factor: 1.12 },
];

const format = (value: number, currency: Currency) =>
  `${currency === "GHC" ? "GH₵" : "$"}${Math.round(value).toLocaleString("en-US")}`;

export function RateCompass() {
  const [projectIndex, setProjectIndex] = useState(0);
  const [currency, setCurrency] = useState<Currency>("GHC");
  const [price, setPrice] = useState(15000);
  const [complexity, setComplexity] = useState(1);
  const [timeline, setTimeline] = useState(1);
  const [experience, setExperience] = useState(1);
  const [market, setMarket] = useState(0);
  const [relationship, setRelationship] = useState(1);
  const [support, setSupport] = useState(1);
  const [ranges, setRanges] = useState(PROJECTS);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [assumptionsOpen, setAssumptionsOpen] = useState(true);
  const [showResult, setShowResult] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const result = useMemo(() => {
    const factor = COMPLEXITY[complexity].factor * TIMELINE[timeline].factor * EXPERIENCE[experience].factor * MARKET[market].factor * RELATIONSHIP[relationship].factor * SUPPORT[support].factor;
    const lowGhc = ranges[projectIndex].low * factor;
    const highGhc = ranges[projectIndex].high * factor;
    const enteredGhc = currency === "USD" ? price * 15 : price;
    const ratio = (enteredGhc - lowGhc) / Math.max(1, highGhc - lowGhc);
    const verdict = enteredGhc < lowGhc * 0.8 ? "Well below range" : enteredGhc < lowGhc ? "A little low" : enteredGhc <= highGhc ? "Fairly priced" : enteredGhc <= highGhc * 1.25 ? "Premium, but defensible" : "Well above range";
    return { factor, lowGhc, highGhc, ratio, verdict };
  }, [complexity, timeline, experience, market, relationship, support, ranges, projectIndex, currency, price]);

  const checkPrice = () => {
    setShowResult(true);
    window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };
  const reset = () => {
    setProjectIndex(0); setCurrency("GHC"); setPrice(15000); setComplexity(1); setTimeline(1);
    setExperience(1); setMarket(0); setRelationship(1); setSupport(1); setShowResult(false);
  };
  const fromGhc = (amount: number) => currency === "USD" ? amount / 15 : amount;
  const marker = Math.min(96, Math.max(4, result.ratio * 72 + 14));

  return (
    <main className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-[1380px] px-5 pb-28 pt-28 sm:px-8 md:pt-36">
        <header className="mb-12">
          <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[.22em] text-accent"><Compass className="size-4" /> Pricing sense-check</p>
          <h1 className="mt-8 max-w-[1200px] font-serif text-[clamp(3rem,6.1vw,5.7rem)] font-bold leading-[.98] tracking-[-.035em]">Is your price too low, too high, or fair?</h1>
          <p className="mt-7 max-w-[760px] text-lg leading-relaxed text-text-2 sm:text-xl">Enter what you&apos;re charging for a project and answer a few questions about it. This weighs your price against general patterns in Ghana&apos;s tech services market and tells you where it lands—with room to tune the assumptions to what you actually see in the field.</p>
        </header>

        <section className="sense-card">
          <StageHeading number="1" title="Project & price" description="What you're building, and what you're charging for it." />
          <button type="button" onClick={() => setProposalOpen(!proposalOpen)} className="mt-7 flex w-full items-center gap-3 rounded-2xl border border-dashed border-hairline-strong bg-bg-3 px-5 py-5 text-left text-sm font-bold transition hover:border-accent sm:text-base">
            {proposalOpen ? <ChevronDown className="size-5" /> : <ChevronRight className="size-5" />} Pull the price from a proposal instead of typing it
          </button>
          {proposalOpen && <ProposalReader onPrice={(amount) => { setPrice(amount); setProposalOpen(false); }} />}
          <div className="mt-7">
            <label className="sense-label" htmlFor="project-type">Project type</label>
            <select id="project-type" value={projectIndex} onChange={(e) => setProjectIndex(Number(e.target.value))} className="sense-input mt-2 w-full pr-14">{ranges.map((project, index) => <option key={project.name} value={index}>{project.name}</option>)}</select>
          </div>
          <div className="mt-5">
            <label className="sense-label" htmlFor="project-price">What you&apos;re charging</label>
            <div className="mt-2 grid grid-cols-[112px_1fr] gap-3 sm:grid-cols-[138px_1fr]">
              <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className="sense-input"><option>GHC</option><option>USD</option></select>
              <input id="project-price" type="number" min="0" inputMode="decimal" value={price || ""} placeholder="15000" onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))} className="sense-input min-w-0" />
            </div>
          </div>
        </section>

        <section className="sense-card mt-7">
          <StageHeading number="2" title="About this project" description="Each answer shifts the fair range up or down." />
          <OptionGroup title="Complexity" options={COMPLEXITY} value={complexity} onChange={setComplexity} columns="four" />
          <OptionGroup title="Timeline" options={TIMELINE} value={timeline} onChange={setTimeline} />
          <OptionGroup title="Your experience with this kind of project" options={EXPERIENCE} value={experience} onChange={setExperience} />
          <OptionGroup title="Client market" options={MARKET} value={market} onChange={setMarket} columns="two" />
          <OptionGroup title="Relationship potential" options={RELATIONSHIP} value={relationship} onChange={setRelationship} />
          <OptionGroup title="Support after launch" options={SUPPORT} value={support} onChange={setSupport} />
        </section>

        <div className="mt-7 flex justify-end">
          <button type="button" onClick={checkPrice} className="tilt-3d tilt-glow inline-flex min-h-16 items-center justify-center gap-3 rounded-[var(--control-radius)] bg-accent px-9 text-lg font-bold text-on-accent transition hover:bg-accent-strong focus-visible:outline-none"><Check className="size-5" /> Check my price</button>
        </div>

        {showResult && <Result ref={resultRef} price={price} currency={currency} result={result} marker={marker} fromGhc={fromGhc} />}

        <section className="mt-7 rounded-[var(--radius)] border border-dashed border-hairline-strong bg-bg-3 p-5 sm:p-6">
          <button type="button" onClick={() => setAssumptionsOpen(!assumptionsOpen)} className="flex w-full items-center gap-3 text-left font-bold">{assumptionsOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />} Assumptions this uses (edit to match what you actually see)</button>
          {assumptionsOpen && <div className="mt-6"><p className="text-sm leading-relaxed text-text-2 sm:text-base">Base ranges are a general guide for the Ghana market, not a survey—adjust them if your own experience differs, and they&apos;ll be used the next time you check.</p><div className="mt-6 overflow-x-auto"><div className="min-w-[680px]"><div className="grid grid-cols-[1.8fr_1fr_1fr] border-b border-hairline px-3 pb-3 text-xs font-bold uppercase tracking-[.08em] text-muted"><span>Project type</span><span>Low (GHC)</span><span>High (GHC)</span></div>{ranges.map((project, index) => <div key={project.name} className="grid grid-cols-[1.8fr_1fr_1fr] items-center border-b border-hairline px-3 py-2.5"><span className="font-medium">{project.name}</span><RangeInput value={project.low} onChange={(value) => setRanges((current) => current.map((item, i) => i === index ? { ...item, low: value } : item))} /><RangeInput value={project.high} onChange={(value) => setRanges((current) => current.map((item, i) => i === index ? { ...item, high: value } : item))} /></div>)}</div></div><button type="button" onClick={() => setRanges(PROJECTS)} className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-accent hover:text-accent-strong"><RotateCcw className="size-3.5" /> Restore default ranges</button></div>}
        </section>
        <button type="button" onClick={reset} className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-text"><RotateCcw className="size-4" /> Reset the sense-check</button>
      </div>
      <style jsx global>{`
        .sense-card{border:1px solid var(--hairline);border-radius:var(--radius);background:var(--bg-2);padding:clamp(1.5rem,4vw,2.65rem);box-shadow:var(--card-shadow)}
        .sense-label{display:block;font-size:.9rem;font-weight:750;color:var(--text)}
        .sense-input{height:60px;border:1px solid var(--hairline-strong);border-radius:var(--control-radius);background:var(--bg-3);padding:0 1.1rem;color:var(--text);font-size:1rem;outline:none;transition:border-color .2s,box-shadow .2s}
        .sense-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .sense-input option{background:var(--bg-3);color:var(--text)}
        @media(max-width:640px){.sense-input{height:56px}}
      `}</style>
    </main>
  );
}

function StageHeading({ number, title, description }: { number: string; title: string; description: string }) { return <div><div className="flex items-center gap-4"><span className="grid size-8 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{number}</span><h2 className="font-serif text-2xl font-bold sm:text-3xl">{title}</h2></div><p className="mt-3 text-text-2 sm:text-lg">{description}</p></div>; }

function OptionGroup({ title, options, value, onChange, columns = "three" }: { title: string; options: Option[]; value: number; onChange: (value: number) => void; columns?: "two" | "three" | "four" }) { return <fieldset className="mt-8"><legend className="mb-3 text-sm font-bold sm:text-base">{title}</legend><div className={cn("grid gap-3", columns === "two" ? "md:grid-cols-2" : columns === "four" ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3")}>{options.map((option, index) => <button key={option.label} type="button" aria-pressed={value === index} onClick={() => onChange(index)} className={cn("flex min-h-[96px] items-start gap-4 rounded-[var(--radius)] border px-5 py-4 text-left transition", value === index ? "border-accent bg-accent-soft" : "border-hairline bg-bg-3 hover:border-hairline-strong")}><span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2", value === index ? "border-accent" : "border-hairline-strong")}>{value === index && <span className="size-2.5 rounded-full bg-accent" />}</span><span><b className="block text-sm sm:text-base">{option.label}</b><small className="mt-1 block text-sm leading-relaxed text-text-2">{option.detail}</small></span></button>)}</div></fieldset>; }

const Result = ({ ref, price, currency, result, marker, fromGhc }: { ref: React.Ref<HTMLDivElement>; price: number; currency: Currency; result: { factor: number; lowGhc: number; highGhc: number; verdict: string }; marker: number; fromGhc: (amount: number) => number }) => <section ref={ref} className="mt-7 overflow-hidden rounded-[var(--radius)] border border-accent/40 bg-[radial-gradient(circle_at_85%_20%,var(--accent-soft),transparent_38%),var(--bg-2)] p-7 shadow-[var(--card-shadow-lift)] sm:p-10" aria-live="polite"><div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-center"><div><p className="font-mono text-xs uppercase tracking-[.2em] text-accent">Your result</p><h2 className="mt-4 font-serif text-4xl font-bold tracking-[-.03em] sm:text-5xl">{result.verdict}</h2><p className="mt-4 max-w-md leading-relaxed text-text-2">Your {format(price, currency)} fee is being compared with an adjusted range of <b className="text-text">{format(fromGhc(result.lowGhc), currency)}–{format(fromGhc(result.highGhc), currency)}</b> for this project profile.</p></div><div><div className="relative pt-12"><div className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-lg bg-text px-3 py-2 text-sm font-black text-bg transition-[left] duration-500" style={{ left: `${marker}%` }}>{format(price, currency)}<span className="absolute left-1/2 top-full -translate-x-1/2 border-x-[7px] border-t-[7px] border-x-transparent border-t-text" /></div><div className="grid h-5 grid-cols-[14%_72%_14%] overflow-hidden rounded-full"><span className="bg-[color-mix(in_srgb,var(--accent)_42%,var(--bg-3))]" /><span className="bg-accent" /><span className="bg-[color-mix(in_srgb,var(--accent)_62%,var(--bg))]" /></div><div className="mt-3 grid grid-cols-3 text-xs font-bold text-muted"><span>Too low</span><span className="text-center">Fair range</span><span className="text-right">Premium</span></div></div><div className="mt-8 flex flex-wrap gap-3 text-xs text-muted"><span className="rounded-full border border-hairline px-3 py-2">Base × {result.factor.toFixed(2)} project factor</span><span className="rounded-full border border-hairline px-3 py-2">Indicative, not a market survey</span></div></div></div></section>;

function RangeInput({ value, onChange }: { value: number; onChange: (value: number) => void }) { return <input type="number" min="0" value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))} className="h-10 w-[136px] rounded-[var(--control-radius)] border border-hairline-strong bg-bg-2 px-3 font-mono text-sm italic text-text outline-none focus:border-accent" />; }

function ProposalReader({ onPrice }: { onPrice: (price: number) => void }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState<"idle" | "reading" | "ready" | "empty" | "error">("idle");
  const [amounts, setAmounts] = useState<number[]>([]);

  const findAmounts = (source: string) => {
    const found = [...source.replace(/,/g, "").matchAll(/(?:GHC|GHS|GH₵|USD|\$)?\s*(\d{3,}(?:\.\d{1,2})?)/gi)]
      .map((match) => Number(match[1]))
      .filter((amount) => Number.isFinite(amount) && amount > 0);
    return [...new Set(found)].sort((a, b) => b - a).slice(0, 8);
  };

  const inspectText = (source: string) => {
    const found = findAmounts(source);
    setAmounts(found);
    setStatus(found.length ? "ready" : "empty");
  };

  const readPdf = async (file: File) => {
    setFileName(file.name);
    setStatus("reading");
    setAmounts([]);
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      const data = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjs.getDocument({ data }).promise;
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      }
      const extracted = pages.join("\n");
      setText(extracted);
      inspectText(extracted);
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="mt-3 rounded-[var(--radius)] border border-hairline bg-bg p-4 sm:p-5">
      <label className="group flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-[var(--control-radius)] border border-dashed border-hairline-strong bg-bg-3 px-5 py-6 text-center transition hover:border-accent hover:bg-accent-soft">
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readPdf(file);
            event.target.value = "";
          }}
        />
        {status === "reading" ? <LoaderCircle className="size-6 animate-spin text-accent" /> : <Upload className="size-6 text-accent" />}
        <b className="mt-3 text-sm">{status === "reading" ? "Reading your proposal…" : "Upload a PDF proposal"}</b>
        <span className="mt-1 text-xs text-muted">Processed privately in your browser</span>
      </label>

      {fileName && status !== "reading" && <p className="mt-3 flex items-center gap-2 text-xs text-muted"><FileText className="size-4 text-accent" /> {fileName}</p>}

      {status === "ready" && (
        <div className="mt-4">
          <p className="text-sm font-bold">Choose the project price we found</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {amounts.map((amount) => <button key={amount} type="button" onClick={() => onPrice(amount)} className="rounded-full border border-accent/40 bg-accent-soft px-4 py-2 text-sm font-bold text-accent transition hover:border-accent hover:bg-accent hover:text-on-accent">{amount.toLocaleString("en-US")}</button>)}
          </div>
        </div>
      )}
      {status === "empty" && <p className="mt-4 rounded-[var(--control-radius)] border border-hairline bg-bg-2 p-3 text-sm text-text-2">No price was found. This may be a scanned PDF; paste the section containing the total below.</p>}
      {status === "error" && <p className="mt-4 rounded-[var(--control-radius)] border border-hairline bg-bg-2 p-3 text-sm text-text-2">That PDF could not be read. Try another file or paste the proposal text below.</p>}

      <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[.16em] text-muted"><span className="h-px flex-1 bg-hairline" />or paste text<span className="h-px flex-1 bg-hairline" /></div>
      <label className="sense-label" htmlFor="proposal-text">Proposal text</label>
      <textarea id="proposal-text" value={text} onChange={(e) => { setText(e.target.value); setStatus("idle"); }} placeholder="Paste the section containing your project total…" className="mt-2 min-h-28 w-full resize-y rounded-[var(--control-radius)] border border-hairline-strong bg-bg-3 p-4 text-sm text-text outline-none placeholder:text-muted focus:border-accent" />
      <button type="button" disabled={!text.trim()} onClick={() => inspectText(text)} className="mt-3 rounded-[var(--control-radius)] bg-accent px-4 py-2.5 text-sm font-bold text-on-accent disabled:opacity-40">Find prices in text</button>
    </div>
  );
}
