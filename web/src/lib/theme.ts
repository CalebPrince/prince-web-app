// One appearance for the whole site: the public pages, the admin backend and the client portal all read and write
// the same `theme` localStorage key (shared with the PHP pages' theme.js), and every open tab follows a change made
// in any other tab. Dark is the absence of the data-theme attribute; light and dusk are values of it.

export type Theme = "light" | "dark" | "dusk";

export const THEME_KEY = "theme";
/** Fired on window in the tab that made the change; other tabs hear it through the `storage` event. */
export const THEME_EVENT = "pc:theme-change";

function isTheme(v: unknown): v is Theme {
  return v === "light" || v === "dark" || v === "dusk";
}

/** The appearance the page is showing right now. */
export function readTheme(): Theme {
  const stamped = document.documentElement.getAttribute("data-theme");
  return stamped === "light" || stamped === "dusk" ? stamped : "dark";
}

function stamp(t: Theme) {
  if (t === "dark") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}

/** What a page should show for a stored value: the stored choice, or the OS preference when there is none. */
function resolve(stored: string | null): Theme {
  if (isTheme(stored)) return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Switch the appearance everywhere: this tab now, every other open tab through the shared key. */
export function setTheme(next: Theme) {
  stamp(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // storage blocked (private mode): this tab still switches
  }
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: next }));
}

/**
 * Calls `onChange` whenever the appearance changes, in this tab or another one. A change from another tab is also
 * applied to this page, so every open page follows without a reload. Returns the unsubscribe function.
 */
export function subscribeTheme(onChange: (t: Theme) => void): () => void {
  const local = (e: Event) => onChange((e as CustomEvent<Theme>).detail);
  const remote = (e: StorageEvent) => {
    if (e.key !== THEME_KEY && e.key !== null) return; // e.key is null when storage was cleared
    const t = resolve(e.key === null ? null : e.newValue);
    stamp(t);
    onChange(t);
  };
  window.addEventListener(THEME_EVENT, local);
  window.addEventListener("storage", remote);
  return () => {
    window.removeEventListener(THEME_EVENT, local);
    window.removeEventListener("storage", remote);
  };
}
