#!/usr/bin/env node
// Build-time (not runtime) partial injection for the static public/*.html
// pages, which have no server-side templating. Canonical markup lives once
// in partials/*.html; each page keeps a marker-comment block that this
// script re-stamps from the canonical source, with a tiny per-page param
// syntax for the handful of things that legitimately vary (active nav
// link, CTA text/href). Deliberately NOT part of `npm run build` / CI —
// run locally, review the diff, commit the expanded HTML like any other
// change, so the committed file is always exactly what deploys.
//
// Usage:
//   node scripts/sync-partials.js          rewrite drifted pages in place
//   node scripts/sync-partials.js --check  exit 1 if any page has drifted
//
// Marker + param syntax in a page:
//   <!-- partial:nav active="/services.html" cta-href="/contact.html" cta-text="Review a workflow" client-login="true" -->
//   ...current rendered output, replaced on sync...
//   <!-- /partial:nav -->
//
// Mini templating available inside partials/*.html:
//   {{VAR}}                 -> params.VAR (kebab-case param name, upper-snake-cased)
//   {{ACTIVE:/href.html}}   -> " active" if params.ACTIVE === "/href.html", else ""
//   {{#if VAR}}...{{/if}}   -> included only if params.VAR is "true"/"1"

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PARTIALS_DIR = path.join(ROOT, "partials");
const PUBLIC_DIR = path.join(ROOT, "public");
const CHECK_MODE = process.argv.includes("--check");

function listHtmlFiles(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "generated-sites") continue; // runtime-created, gitignored
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(listHtmlFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

function parseParams(attrString) {
  const params = {};
  const re = /([\w-]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(attrString))) {
    params[m[1].toUpperCase().replace(/-/g, "_")] = m[2];
  }
  return params;
}

function render(template, params) {
  let out = template;
  out = out.replace(/\{\{#if ([A-Z_]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, name, inner) =>
    params[name] === "true" || params[name] === "1" ? inner : ""
  );
  out = out.replace(/\{\{ACTIVE:([^}]+)\}\}/g, (_, href) =>
    params.ACTIVE === href ? " active" : ""
  );
  out = out.replace(/\{\{([A-Z_]+)\}\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? params[name] : ""
  );
  out = out.replace(/^[ \t]+$/gm, ""); // whitespace-only lines left by a removed {{#if}} block
  return out;
}

function main() {
  const partialCache = {};
  const files = listHtmlFiles(PUBLIC_DIR);
  const markerRe = /<!--\s*partial:([\w-]+)((?:\s+[\w-]+="[^"]*")*)\s*-->([\s\S]*?)<!--\s*\/partial:\1\s*-->/g;

  let driftedFiles = [];
  let touchedFiles = 0;

  for (const file of files) {
    const original = fs.readFileSync(file, "utf8");
    let changed = false;

    const updated = original.replace(markerRe, (whole, name, attrString, currentInner) => {
      if (!partialCache[name]) {
        const partialPath = path.join(PARTIALS_DIR, `${name}.html`);
        if (!fs.existsSync(partialPath)) {
          throw new Error(`${file}: no partials/${name}.html for marker "partial:${name}"`);
        }
        partialCache[name] = fs.readFileSync(partialPath, "utf8");
      }
      const params = parseParams(attrString);
      const rendered = "\n" + render(partialCache[name], params).replace(/\n$/, "") + "\n";
      if (rendered !== currentInner) changed = true;
      return `<!-- partial:${name}${attrString} -->${rendered}<!-- /partial:${name} -->`;
    });

    if (changed) {
      driftedFiles.push(path.relative(ROOT, file));
      if (!CHECK_MODE) {
        fs.writeFileSync(file, updated, "utf8");
        touchedFiles++;
      }
    }
  }

  if (CHECK_MODE) {
    if (driftedFiles.length) {
      console.error(`Partial drift in ${driftedFiles.length} file(s):`);
      driftedFiles.forEach((f) => console.error(`  ${f}`));
      console.error('Run "npm run sync:partials" locally and commit the result.');
      process.exit(1);
    }
    console.log("No partial drift found.");
    return;
  }

  console.log(`Synced ${touchedFiles} file(s) with drift out of ${files.length} scanned.`);
}

main();
