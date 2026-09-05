/**
 * The facts about this site that both the metadata and the structured data
 * have to agree on. Google reconciles og:site_name, the WebSite schema's
 * name, and the Organization's name into one idea of who this is; if they
 * disagree it trusts none of them, so they are stated once here and read
 * from everywhere rather than retyped per page.
 */

export const SITE_URL = "https://princecaleb.dev";

/** What the site is called. Google's site-name feature reads this from the
 *  WebSite schema and og:site_name, which is the row above the sitelinks in
 *  a branded result. */
export const SITE_NAME = "Prince Caleb";

/** The other way people type it. Feeding Google both spellings is what lets
 *  it match the brand query to the site. */
export const SITE_ALTERNATE_NAME = "princecaleb.dev";

export const PERSON_NAME = "Prince Caleb";
export const PERSON_JOB_TITLE = "Website Designer & Developer";

export const SITE_DESCRIPTION =
  "Custom website design and development by Prince Caleb in Accra, Ghana, working worldwide. Websites, apps and AI tools with clear scope, written agreements and limited quarterly intake.";

/** 1200x630, the size Google and every social card reader expects. Served by
 *  the PHP half of the site, which owns /uploads. */
export const OG_IMAGE = "/uploads/og-image.png";

/** Raster rather than the SVG favicon: Google's Organization logo wants a
 *  bitmap of at least 112x112, and this is the 180x180 touch icon. */
export const LOGO = "/apple-icon.png";

/** Profiles that are demonstrably the same person. sameAs is how Google ties
 *  the site to an entity it already knows, so only real, live profiles
 *  belong here - the footer's placeholder x.com/linkedin.com roots do not. */
export const SAME_AS = [
  "https://www.linkedin.com/in/caleb-akakpo-b7123a89/",
  "https://x.com/princecay77",
  "https://github.com/CalebPrince",
];

export const abs = (path: string) => new URL(path, SITE_URL).toString();

/** Rendered into a page as <script type="application/ld+json">. Next does not
 *  have a first-class slot for structured data, and this is the shape Google
 *  documents for App Router. */
export function jsonLd(data: object) {
  return { __html: JSON.stringify(data) };
}
