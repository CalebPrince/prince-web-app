"use client";

import { useEffect, useState } from "react";
import { EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminApi, asList } from "@/lib/api";

// "Hide client info": a recording mode for screen shares and walkthrough videos. When it is on, every email address,
// phone number and client/contact/lead name on an admin page is blurred, along with whole table columns about clients
// and the name/email/phone form fields. Nothing is changed in the data or the page markup: text is blurred through
// the CSS Custom Highlight API (so React keeps owning its DOM), cells and inputs through a data attribute and CSS.
// The choice lives in this browser only.

const KEY = "admin_privacy";
// The client lists take seconds to load (thousands of leads), so the built name pattern is kept for the browser
// session: a later full page load can blur names at once, then refreshes the list in the background.
const NAMES_CACHE = "admin_privacy_names";
const ATTR = "data-privacy";

// Lists whose records belong to clients. Every name-like field in their answers joins the blur list.
const SOURCES = [
  "/api/v1/admin/clients",
  "/api/v1/admin/contacts",
  "/api/v1/admin/marketing-leads",
  "/api/v1/admin/pipeline",
  "/api/v1/admin/proposals",
  "/api/v1/admin/appointments",
  "/api/v1/admin/chats",
  "/api/v1/admin/inquiries",
  "/api/v1/admin/invoices",
];
const NAME_KEYS = /^(name|full_name|first_name|last_name|client_name|contact_name|customer_name|lead_name|visitor_name|linked_client_name|accepted_by_name|target_name|business_name|call_business_name|company|company_name)$/;
// People's names are also blurred by first name alone, so prose like "Kwame asked for..." is covered.
const PERSON_KEYS = /^(full_name|client_name|contact_name|customer_name|lead_name|visitor_name|linked_client_name|accepted_by_name)$/;
// Never blur the AI team or the owner: they are the point of the walkthrough.
const KEEP = new Set(
  ["lisa", "joan", "sharon", "ledger", "allie", "chloe", "wendy", "chief", "sage", "rocco", "jev", "prince", "caleb", "prince caleb", "admin", "unknown", "client", "guest", "visitor", "test"],
);

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+\d{1,3}[\s.-]?\(?\d{1,4}\)?|\b0\d{1,3}|\(\d{3}\))[\s.-]?\d{3}[\s.-]?\d{3,4}\b/g;
// Web addresses identify a lead's business as surely as its name. The owner's own domain stays readable.
const WEB = /\b(?:https?:\/\/\S+|www\.\S+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|co|io|dev|app|biz|info|me|gh|ng|ke|za|uk|us|ca|au|de|fr|es|in)(?:\.[a-z]{2})?(?:\/\S*)?)/gi;
// Money: deal values and the owner's own finances (Chief's brief has a finance paragraph) are not for a recording.
const MONEY = /(?:GHS|GH₵|USD|US\$|\$|€|£)\s?-?\d[\d,]*(?:\.\d+)?|-?\d[\d,]*(?:\.\d+)?\s?(?:GHS|GH₵|USD|cedis)\b/g;
const OWN = /(^|\.|\/\/)princecaleb\.dev/i;
// Table columns that are about a client as a whole.
const COLUMN = /^(client|contact|customer|lead|business|company|name|email|e-mail|phone|whatsapp|visitor|attendee|recipient)\b/i;

function collect(value: unknown, names: Set<string>, key = "") {
  if (Array.isArray(value)) {
    for (const v of value) collect(v, names, key);
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collect(v, names, k);
    return;
  }
  if (typeof value !== "string" || !NAME_KEYS.test(key)) return;
  const name = value.trim();
  if (name.length < 3 || name.includes("@") || KEEP.has(name.toLowerCase())) return;
  names.add(name);
  if (PERSON_KEYS.test(key)) {
    const first = name.split(/\s+/)[0];
    if (first.length >= 4 && !KEEP.has(first.toLowerCase())) names.add(first);
  }
}

async function loadNames(): Promise<RegExp | null> {
  const names = new Set<string>();
  const answers = await Promise.allSettled(SOURCES.map((p) => adminApi.get<unknown>(p)));
  for (const a of answers) if (a.status === "fulfilled") collect(a.value, names);
  // Client projects and proposals are titled after the client ("Triple P Medical"), and agents name them in their
  // write-ups. Only the record's own title counts: titles nested inside it (milestones) are ordinary words.
  const titled = await Promise.allSettled(
    ["/api/v1/admin/projects", "/api/v1/admin/proposals"].map((p) => adminApi.get<unknown>(p)),
  );
  for (const a of titled) {
    if (a.status !== "fulfilled") continue;
    for (const r of asList<{ title?: unknown }>(a.value)) {
      if (typeof r?.title === "string") collect(r.title, names, "name");
    }
  }
  if (names.size === 0) return null;
  const parts = [...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const source = `(?<![\\p{L}\\p{N}])(?:${parts.join("|")})(?![\\p{L}\\p{N}])`;
  try {
    sessionStorage.setItem(NAMES_CACHE, source);
  } catch {
    // too large or blocked: the next load fetches again
  }
  return new RegExp(source, "gu");
}

function cachedNames(): RegExp | null {
  try {
    const source = sessionStorage.getItem(NAMES_CACHE);
    return source ? new RegExp(source, "gu") : null;
  } catch {
    return null;
  }
}

/** Marks every table cell under a client column so CSS can blur the whole cell. */
function markColumns(root: ParentNode) {
  for (const table of root.querySelectorAll("table")) {
    const heads = [...table.querySelectorAll("thead th")];
    heads.forEach((th, i) => {
      const label = (th.textContent ?? "").trim();
      if (!COLUMN.test(label) || /agent/i.test(label)) return;
      for (const row of table.querySelectorAll("tbody tr")) {
        const cell = row.children[i];
        if (!cell || cell.hasAttribute("data-pii")) continue;
        // A "Name" column on the team or automation pages holds the AI team, not clients.
        const first = (cell.textContent ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
        if (KEEP.has(first)) continue;
        cell.setAttribute("data-pii", "");
      }
    });
  }
}

function highlightText(names: RegExp | null) {
  const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  const HighlightCtor = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  if (!registry || !HighlightCtor) return;
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const el = node.parentElement;
      if (!el || !node.nodeValue || node.nodeValue.trim().length < 3) return NodeFilter.FILTER_REJECT;
      if (el.closest("script,style,noscript,[data-pii-ignore],[data-pii]")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? "";
    for (const re of names ? [EMAIL, PHONE, WEB, MONEY, names] : [EMAIL, PHONE, WEB, MONEY]) {
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        if (!m[0]) {
          re.lastIndex++;
          continue;
        }
        if (re === WEB && OWN.test(m[0])) continue;
        const r = document.createRange();
        r.setStart(node, m.index);
        r.setEnd(node, m.index + m[0].length);
        ranges.push(r);
      }
    }
  }
  registry.set("pii", new HighlightCtor(...ranges));
}

function clearAll() {
  try {
    sessionStorage.removeItem(NAMES_CACHE);
  } catch {
    // blocked: nothing cached
  }
  (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.delete("pii");
  document.documentElement.removeAttribute(ATTR);
  for (const el of document.querySelectorAll("[data-pii]")) el.removeAttribute("data-pii");
}

export function AdminPrivacySwitch() {
  // null until the stored choice is read, so the first render does not undo the pre-paint blur set in the layout.
  const [on, setOn] = useState<boolean | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      let stored = false;
      try {
        stored = localStorage.getItem(KEY) === "on";
      } catch {
        // storage blocked: starts off
      }
      setOn(stored);
    }, 0);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY || e.key === null) setOn(e.newValue === "on");
    };
    window.addEventListener("storage", onStorage);
    return () => {
      clearTimeout(t);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (on === null) return;
    if (!on) {
      clearAll();
      return;
    }
    // "pending" keeps the whole content blurred until the client names are known, so nothing shows for a moment.
    document.documentElement.setAttribute(ATTR, "pending");
    let names: RegExp | null = cachedNames();
    const paint = () => {
      markColumns(document);
      highlightText(names);
    };
    // A short timer rather than a paint frame, so the blur keeps up in a tab that is not being drawn.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      clearTimeout(timer);
      timer = setTimeout(paint, 40);
    };
    let alive = true;
    const ready = (re: RegExp | null) => {
      if (!alive || document.documentElement.getAttribute(ATTR) === "on") return;
      names = re ?? names;
      paint();
      document.documentElement.setAttribute(ATTR, "on");
    };
    if (names) ready(names);
    loadNames().then(
      (re) => {
        names = re ?? names;
        ready(names);
        run();
      },
      () => ready(null),
    );
    // Only if the name lists never arrive is the page shown without them (emails, phones, columns stay covered).
    const fallback = setTimeout(() => ready(null), 30000);
    const observer = new MutationObserver(run);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => {
      alive = false;
      clearTimeout(timer);
      clearTimeout(fallback);
      observer.disconnect();
      clearAll();
    };
  }, [on]);

  const toggle = () => {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(KEY, next ? "on" : "off");
    } catch {
      // storage blocked: this tab still switches
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on === true}
      onClick={toggle}
      className={cn(
        "flex h-9 w-full items-center justify-between gap-2 rounded-[var(--control-radius)] border border-hairline px-3 text-xs font-semibold transition-colors",
        on ? "bg-accent-soft text-accent" : "bg-bg text-text-2 hover:bg-bg-3 hover:text-text",
      )}
    >
      <span className="flex items-center gap-1.5">
        <EyeOff className="size-3.5" aria-hidden="true" />
        Hide client info
      </span>
      <span
        aria-hidden="true"
        className={cn("relative h-4 w-7 rounded-full transition-colors", on ? "bg-accent" : "bg-bg-3")}
      >
        <span
          className={cn(
            "absolute top-0.5 size-3 rounded-full bg-white transition-[left]",
            on ? "left-3.5" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}
