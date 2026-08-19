// Ported from public/js/ai-widget.js's Carbon-style code-card parsing and
// syntax highlighting. Pure functions so both the chat widget and any
// future consumer can reuse them without touching the DOM directly.

export type Segment = { type: "text"; value: string } | { type: "code"; lang: string; value: string };

const CODE_FENCE_RE = /```([\w+#.-]*)[ \t]*\n?([\s\S]*?)```/g;

export function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  CODE_FENCE_RE.lastIndex = 0;
  while ((m = CODE_FENCE_RE.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: "text", value: text.slice(last, m.index) });
    segments.push({ type: "code", lang: (m[1] || "").toLowerCase(), value: m[2].replace(/\n+$/, "") });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return segments;
}

export function hasCode(text: string): boolean {
  CODE_FENCE_RE.lastIndex = 0;
  return CODE_FENCE_RE.test(text);
}

// Reply text with fenced code stripped - reading code aloud is noise, so the
// speaker button and auto read-aloud only ever get the prose.
export function proseOnly(text: string): string {
  return parseSegments(text)
    .filter((s): s is { type: "text"; value: string } => s.type === "text")
    .map((s) => s.value)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Light, dependency-free highlighter. One combined regex tokenizes comments,
// strings, numbers, and common keywords (JS/PHP/CSS/Python-ish); each token
// and every gap between tokens is HTML-escaped before being wrapped, so the
// result is always safe to assign as innerHTML.
const HL_RULES: { cls: string; src: string }[] = [
  { cls: "tok-com", src: "//[^\\n]*|/\\*[\\s\\S]*?\\*/|<!--[\\s\\S]*?-->|#[^\\n]*" },
  { cls: "tok-str", src: "\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|`(?:\\\\.|[^`\\\\])*`" },
  { cls: "tok-num", src: "\\b\\d+(?:\\.\\d+)?\\b" },
  {
    cls: "tok-kw",
    src: "\\b(?:const|let|var|function|fn|return|if|else|elif|for|foreach|while|switch|case|break|new|class|extends|implements|public|private|protected|static|echo|print|use|namespace|import|export|from|default|async|await|yield|true|false|null|undefined|None|True|False|def|in|of|as|is|not|and|or|try|catch|except|finally|throw|raise|require|include|this|self|super)\\b",
  },
];
const HL_RE = new RegExp(HL_RULES.map((r) => "(" + r.src + ")").join("|"), "g");

export function highlightCode(code: string): string {
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  HL_RE.lastIndex = 0;
  while ((m = HL_RE.exec(code)) !== null) {
    if (m.index > last) out += escapeHtml(code.slice(last, m.index));
    let cls = "";
    for (let g = 1; g <= HL_RULES.length; g++) {
      if (m[g] !== undefined) {
        cls = HL_RULES[g - 1].cls;
        break;
      }
    }
    out += '<span class="' + cls + '">' + escapeHtml(m[0]) + "</span>";
    last = m.index + m[0].length;
    if (HL_RE.lastIndex === m.index) HL_RE.lastIndex++; // guard against zero-width matches
  }
  out += escapeHtml(code.slice(last));
  return out;
}
