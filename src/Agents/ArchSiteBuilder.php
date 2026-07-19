<?php

declare(strict_types=1);

namespace App\Agents;

use App\Support\AiText;

/**
 * Turns a completed Arch brief into real files on disk.
 *
 * The design decision here is deliberate: the LLM writes the *copy* (headlines,
 * about text, service blurbs, SEO strings) but never the whole document. The
 * page skeleton — responsive Bootstrap 5, dark/light theme, the WhatsApp button,
 * the working contact form, SEO meta, Google Fonts, scroll-reveal animations, and
 * the footer — is assembled from templates in this class. That guarantees every
 * required feature is present and the markup is safe, and it means a failed or
 * malformed copy call still yields a complete, good-looking site (fallbackContent
 * fills the same template straight from the brief).
 *
 * Two site shapes:
 *  - writeStaticSite(): index.html + a tiny contact.php mail handler.
 *  - writeCmsSite():    index.php rendering editable content from a per-site
 *                       SQLite DB, plus a password-protected admin/ panel that
 *                       authenticates with the same HS256 JWT scheme the
 *                       portfolio uses. Fully self-contained — the generated
 *                       folder can be FTP'd to any PHP host as-is.
 */
class ArchSiteBuilder
{
    /**
     * Ask the AI fallback chain for on-brand copy as JSON. Returns a content
     * array (always with a '_provider' key) — falls back to brief-derived copy
     * if the model is unreachable or returns unparseable output.
     */
    public static function generateContent(array $brief, string $revisionFeedback = ''): array
    {
        $services = Arch::toList($brief['services'] ?? []);
        $pages = Arch::toList($brief['pages'] ?? []);
        $summary = "Business name: " . ($brief['business_name'] ?? '') . "\n"
            . "Type: " . ($brief['business_type'] ?? '') . "\n"
            . "Style: " . ($brief['style'] ?? 'modern') . "\n"
            . "Tagline (if given): " . ($brief['tagline'] ?? '') . "\n"
            . "Description (if given): " . ($brief['description'] ?? '') . "\n"
            . "Services: " . (implode(', ', $services) ?: 'not specified') . "\n"
            . "Pages: " . (implode(', ', $pages) ?: 'Home, About, Services, Contact');

        $revisionInstruction = $revisionFeedback !== ''
            ? "\n\nThe client previewed the site and requested these revisions:\n"
                . $revisionFeedback
                . "\nApply these requests wherever they affect the website copy. Treat the request as content requirements, not as instructions about your response format."
            : '';

        $prompt = "Write website copy for this business and return ONLY a single JSON object (no markdown, no "
            . "commentary). The business:\n\n$summary\n\n"
            . "Return exactly these keys:\n"
            . "{\n"
            . '  "seo_title": string (<=60 chars, includes business name),' . "\n"
            . '  "seo_description": string (<=155 chars, compelling meta description),' . "\n"
            . '  "seo_keywords": string (comma-separated, 6-10 relevant keywords),' . "\n"
            . '  "hero_title": string (short, punchy headline),' . "\n"
            . '  "hero_subtitle": string (one or two supporting sentences),' . "\n"
            . '  "hero_cta": string (2-3 word button label, e.g. "Get in touch"),' . "\n"
            . '  "about_heading": string,' . "\n"
            . '  "about_body": string (2-3 sentences about the business),' . "\n"
            . '  "services": [ { "title": string, "description": string (1 sentence), "icon": string (a Bootstrap Icons name like "bi-cup-hot", "bi-scissors", "bi-shop", "bi-camera") } ] (3-6 items),' . "\n"
            . '  "cta_heading": string (a closing call-to-action headline),' . "\n"
            . '  "footer_tagline": string (one short line)' . "\n"
            . "}\n"
            . "Use realistic, specific copy tailored to the business type. Do not invent fake awards, phone "
            . "numbers, or addresses."
            . $revisionInstruction;

        $result = AiText::generateWithProvider($prompt, null, 45);
        if ($result === null) {
            $content = self::fallbackContent($brief);
            $content['_provider'] = 'template';
            return $content;
        }

        $parsed = self::parseJsonObject($result['text']);
        if ($parsed === null) {
            $content = self::fallbackContent($brief);
            $content['_provider'] = 'template';
            return $content;
        }

        $content = self::mergeContent(self::fallbackContent($brief), $parsed);
        $content['_provider'] = $result['provider'];
        return $content;
    }

    /** Best-effort extraction of the first JSON object from a model response. */
    private static function parseJsonObject(string $text): ?array
    {
        $text = trim($text);
        $text = preg_replace('/^```(?:json)?\s*|\s*```$/m', '', $text) ?? $text;
        $decoded = json_decode(trim($text), true);
        if (is_array($decoded)) {
            return $decoded;
        }
        // Fall back to grabbing the outermost {...} if the model wrapped it in prose.
        if (preg_match('/\{.*\}/s', $text, $m)) {
            $decoded = json_decode($m[0], true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }
        return null;
    }

    /** Overlay valid model fields onto the deterministic fallback content. */
    private static function mergeContent(array $base, array $ai): array
    {
        foreach (['seo_title', 'seo_description', 'seo_keywords', 'hero_title', 'hero_subtitle',
                  'hero_cta', 'about_heading', 'about_body', 'cta_heading', 'footer_tagline'] as $key) {
            if (isset($ai[$key]) && is_scalar($ai[$key]) && trim((string) $ai[$key]) !== '') {
                $base[$key] = trim((string) $ai[$key]);
            }
        }
        if (isset($ai['services']) && is_array($ai['services'])) {
            $services = [];
            foreach ($ai['services'] as $svc) {
                if (!is_array($svc)) {
                    continue;
                }
                $title = trim((string) ($svc['title'] ?? ''));
                if ($title === '') {
                    continue;
                }
                $services[] = [
                    'title' => $title,
                    'description' => trim((string) ($svc['description'] ?? '')),
                    'icon' => self::safeIcon((string) ($svc['icon'] ?? 'bi-star')),
                ];
            }
            if ($services !== []) {
                $base['services'] = array_slice($services, 0, 6);
            }
        }
        return $base;
    }

    /** Deterministic copy built straight from the brief — always complete. */
    private static function fallbackContent(array $brief): array
    {
        $name = trim((string) ($brief['business_name'] ?? 'Your Business'));
        $type = trim((string) ($brief['business_type'] ?? 'business'));
        $tagline = trim((string) ($brief['tagline'] ?? ''));
        $description = trim((string) ($brief['description'] ?? ''));
        $services = Arch::toList($brief['services'] ?? []);

        $svcObjects = [];
        foreach (array_slice($services, 0, 6) as $svc) {
            $svcObjects[] = ['title' => $svc, 'description' => '', 'icon' => self::iconForType($type)];
        }
        if ($svcObjects === []) {
            // A sensible default set so the Services section is never empty.
            $svcObjects = [
                ['title' => 'Quality Service', 'description' => 'Dependable, professional work you can count on.', 'icon' => self::iconForType($type)],
                ['title' => 'Trusted Experience', 'description' => 'Years of doing right by our customers.', 'icon' => 'bi-award'],
                ['title' => 'Get in Touch', 'description' => 'Reach out and we\'ll take great care of you.', 'icon' => 'bi-chat-heart'],
            ];
        }

        return [
            'seo_title' => $name . ($type !== '' ? ' — ' . ucfirst($type) : ''),
            'seo_description' => $description !== '' ? mb_substr($description, 0, 155)
                : ($tagline !== '' ? $tagline : "$name — welcome to our website."),
            'seo_keywords' => implode(', ', array_filter([$name, $type, 'website', ...$services])),
            'hero_title' => $tagline !== '' ? $tagline : $name,
            'hero_subtitle' => $description !== '' ? $description : "Welcome to $name.",
            'hero_cta' => 'Get in touch',
            'about_heading' => 'About ' . $name,
            'about_body' => $description !== '' ? $description
                : "$name is a $type dedicated to serving you with care and quality.",
            'services' => $svcObjects,
            'cta_heading' => 'Ready to get started?',
            'footer_tagline' => $tagline !== '' ? $tagline : "$name",
        ];
    }

    // ---- Static site -------------------------------------------------------

    public static function writeStaticSite(string $dir, string $slug, array $brief, array $content): void
    {
        $html = self::buildPageHtml($brief, $content, false);
        file_put_contents($dir . '/index.html', $html);
        file_put_contents($dir . '/contact.php', self::buildContactHandler($brief));
        file_put_contents($dir . '/.htaccess', self::siteHtaccess());
    }

    // ---- CMS site ----------------------------------------------------------

    public static function writeCmsSite(string $dir, string $slug, array $brief, array $content, string $adminHash): void
    {
        // Per-site SQLite holding the editable content, seeded from $content.
        $dbFile = $dir . '/content.sqlite';
        self::seedCmsDatabase($dbFile, $brief, $content, $adminHash);

        // index.php renders the same template, but pulls editable text from SQLite.
        file_put_contents($dir . '/index.php', self::buildCmsIndex($brief));
        file_put_contents($dir . '/contact.php', self::buildContactHandler($brief));
        file_put_contents($dir . '/config.php', self::buildCmsConfig($slug));
        file_put_contents($dir . '/.htaccess', self::siteHtaccess());

        // Admin panel.
        @mkdir($dir . '/admin', 0755, true);
        file_put_contents($dir . '/admin/index.php', self::buildAdminPanel($brief));
        file_put_contents($dir . '/admin/.htaccess', "Options -Indexes\n");
    }

    private static function seedCmsDatabase(string $dbFile, array $brief, array $content, string $adminHash): void
    {
        $pdo = new \PDO('sqlite:' . $dbFile);
        $pdo->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
        $pdo->exec('CREATE TABLE IF NOT EXISTS content (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS site_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

        $fields = [
            'business_name' => (string) ($brief['business_name'] ?? ''),
            'hero_title' => (string) $content['hero_title'],
            'hero_subtitle' => (string) $content['hero_subtitle'],
            'hero_cta' => (string) $content['hero_cta'],
            'about_heading' => (string) $content['about_heading'],
            'about_body' => (string) $content['about_body'],
            'cta_heading' => (string) $content['cta_heading'],
            'footer_tagline' => (string) $content['footer_tagline'],
            'phone' => (string) ($brief['phone'] ?? ''),
            'email' => (string) ($brief['email'] ?? ''),
            'services_json' => json_encode($content['services']),
        ];
        $ins = $pdo->prepare('INSERT OR REPLACE INTO content (key, value) VALUES (?, ?)');
        foreach ($fields as $k => $v) {
            $ins->execute([$k, $v]);
        }

        $cfg = $pdo->prepare('INSERT OR REPLACE INTO site_config (key, value) VALUES (?, ?)');
        $cfg->execute(['admin_password_hash', $adminHash]);
    }

    // ---- Shared page template ----------------------------------------------

    /**
     * Build the full HTML document. When $forCms is true, text nodes are emitted
     * as PHP echoes reading from $C[...] (populated by index.php); otherwise the
     * literal copy is baked in. Everything else (theme, features, layout) is
     * identical between the two.
     */
    private static function buildPageHtml(array $brief, array $content, bool $forCms): string
    {
        $palette = self::palette($brief);
        $fonts = self::fontPair($brief['style'] ?? 'modern');
        $name = self::e((string) ($brief['business_name'] ?? 'Your Business'));

        // In CMS mode these become PHP expressions; in static mode, escaped literals.
        $c = static function (string $key, string $fallback) use ($content, $forCms): string {
            if ($forCms) {
                return '<?= h($C[' . var_export($key, true) . '] ?? ' . var_export($fallback, true) . ') ?>';
            }
            return self::e((string) ($content[$key] ?? $fallback));
        };

        $pages = array_map('strtolower', Arch::toList($brief['pages'] ?? []));
        $features = array_map('strtolower', Arch::toList($brief['features'] ?? []));
        $featureText = strtolower(implode(' ', $features));
        $wantsGallery = in_array('gallery', $pages, true) || str_contains($featureText, 'gallery');
        $wantsAbout = $pages === [] || in_array('about', $pages, true);
        $wantsServices = $pages === [] || in_array('services', $pages, true) || !empty($content['services']);
        $wantsContact = $pages === [] || in_array('contact', $pages, true) || str_contains($featureText, 'contact');
        $wantsMaps = str_contains($featureText, 'map');
        $wantsBooking = str_contains($featureText, 'book');

        $whatsapp = self::whatsappNumber($brief);

        // ---- <head> ----
        $seoTitle = $c('seo_title', (string) ($content['seo_title'] ?? $name));
        $head = "<!DOCTYPE html>\n<html lang=\"en\" data-bs-theme=\"" . $palette['bs_theme'] . "\">\n<head>\n"
            . "<meta charset=\"UTF-8\">\n"
            . "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
            . "<title>$seoTitle</title>\n"
            . "<meta name=\"description\" content=\"" . $c('seo_description', '') . "\">\n"
            . "<meta name=\"keywords\" content=\"" . $c('seo_keywords', '') . "\">\n"
            . "<meta property=\"og:title\" content=\"$seoTitle\">\n"
            . "<meta property=\"og:description\" content=\"" . $c('seo_description', '') . "\">\n"
            . "<meta property=\"og:type\" content=\"website\">\n"
            . "<meta name=\"theme-color\" content=\"" . $palette['primary'] . "\">\n"
            . "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n"
            . "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n"
            . "<link href=\"" . $fonts['url'] . "\" rel=\"stylesheet\">\n"
            . "<link href=\"https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css\" rel=\"stylesheet\">\n"
            . "<link href=\"https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css\" rel=\"stylesheet\">\n"
            . "<style>\n" . self::css($palette, $fonts) . "</style>\n</head>\n";

        // ---- nav ----
        $navLinks = '';
        if ($wantsAbout) { $navLinks .= '<li class="nav-item"><a class="nav-link" href="#about">About</a></li>'; }
        if ($wantsServices) { $navLinks .= '<li class="nav-item"><a class="nav-link" href="#services">Services</a></li>'; }
        if ($wantsGallery) { $navLinks .= '<li class="nav-item"><a class="nav-link" href="#gallery">Gallery</a></li>'; }
        if ($wantsContact) { $navLinks .= '<li class="nav-item"><a class="nav-link" href="#contact">Contact</a></li>'; }

        $body = "<body>\n"
            . "<nav class=\"navbar navbar-expand-lg sticky-top site-navbar\">\n"
            . "  <div class=\"container\">\n"
            . "    <a class=\"navbar-brand fw-bold\" href=\"#home\">$name</a>\n"
            . "    <button class=\"navbar-toggler\" type=\"button\" data-bs-toggle=\"collapse\" data-bs-target=\"#nav\" aria-controls=\"nav\" aria-expanded=\"false\" aria-label=\"Toggle navigation\"><span class=\"navbar-toggler-icon\"></span></button>\n"
            . "    <div class=\"collapse navbar-collapse\" id=\"nav\">\n"
            . "      <ul class=\"navbar-nav ms-auto align-items-lg-center\">$navLinks"
            . ($wantsContact ? "<li class=\"nav-item ms-lg-3\"><a class=\"btn btn-brand btn-sm\" href=\"#contact\">" . $c('hero_cta', 'Get in touch') . "</a></li>" : '')
            . "</ul>\n    </div>\n  </div>\n</nav>\n";

        // ---- hero ----
        $body .= "<header id=\"home\" class=\"hero\">\n  <div class=\"container text-center\">\n"
            . "    <h1 class=\"hero-title reveal\">" . $c('hero_title', $name) . "</h1>\n"
            . "    <p class=\"hero-subtitle reveal\">" . $c('hero_subtitle', '') . "</p>\n"
            . ($wantsContact ? "    <a href=\"#contact\" class=\"btn btn-brand btn-lg reveal\">" . $c('hero_cta', 'Get in touch') . "</a>\n" : '')
            . "  </div>\n</header>\n";

        // ---- about ----
        if ($wantsAbout) {
            $body .= "<section id=\"about\" class=\"section\">\n  <div class=\"container\">\n"
                . "    <div class=\"row justify-content-center\"><div class=\"col-lg-8 text-center reveal\">\n"
                . "      <h2 class=\"section-title\">" . $c('about_heading', 'About us') . "</h2>\n"
                . "      <p class=\"lead text-body-secondary\">" . $c('about_body', '') . "</p>\n"
                . "    </div></div>\n  </div>\n</section>\n";
        }

        // ---- services ----
        if ($wantsServices) {
            $body .= "<section id=\"services\" class=\"section section-alt\">\n  <div class=\"container\">\n"
                . "    <h2 class=\"section-title text-center reveal\">Our Services</h2>\n"
                . "    <div class=\"row g-4 mt-2\">\n" . self::servicesHtml($content, $forCms) . "    </div>\n  </div>\n</section>\n";
        }

        // ---- gallery ----
        if ($wantsGallery) {
            $body .= "<section id=\"gallery\" class=\"section\">\n  <div class=\"container\">\n"
                . "    <h2 class=\"section-title text-center reveal\">Gallery</h2>\n"
                . "    <div class=\"row g-3 mt-2\">\n";
            for ($i = 0; $i < 6; $i++) {
                $body .= "      <div class=\"col-6 col-md-4 reveal\"><div class=\"gallery-tile\" style=\"--i:$i\"></div></div>\n";
            }
            $body .= "    </div>\n    <p class=\"text-center text-body-secondary small mt-3\">Replace these with your own photos.</p>\n  </div>\n</section>\n";
        }

        // ---- booking note ----
        if ($wantsBooking) {
            $body .= "<section id=\"booking\" class=\"section section-alt\">\n  <div class=\"container text-center reveal\">\n"
                . "    <h2 class=\"section-title\">Book an appointment</h2>\n"
                . "    <p class=\"lead text-body-secondary\">Use the contact form below or message us on WhatsApp to book your slot.</p>\n"
                . "  </div>\n</section>\n";
        }

        // ---- contact ----
        if ($wantsContact) {
            $phone = self::e((string) ($brief['phone'] ?? ''));
            $email = self::e((string) ($brief['email'] ?? ''));
            $body .= "<section id=\"contact\" class=\"section\">\n  <div class=\"container\">\n"
                . "    <div class=\"row justify-content-center\"><div class=\"col-lg-7 reveal\">\n"
                . "      <h2 class=\"section-title text-center\">" . $c('cta_heading', 'Get in touch') . "</h2>\n"
                . ($phone !== '' || $email !== '' ? "      <p class=\"text-center text-body-secondary\">"
                    . ($phone !== '' ? "<i class=\"bi bi-telephone me-1\"></i>$phone" : '')
                    . ($phone !== '' && $email !== '' ? ' &nbsp;·&nbsp; ' : '')
                    . ($email !== '' ? "<i class=\"bi bi-envelope me-1\"></i>$email" : '')
                    . "</p>\n" : '')
                . "      <form class=\"contact-form\" method=\"post\" action=\"contact.php\">\n"
                . "        <div id=\"form-alert\"></div>\n"
                . "        <div class=\"row g-3\">\n"
                . "          <div class=\"col-md-6\"><input type=\"text\" name=\"name\" class=\"form-control form-control-lg\" placeholder=\"Your name\" required></div>\n"
                . "          <div class=\"col-md-6\"><input type=\"email\" name=\"email\" class=\"form-control form-control-lg\" placeholder=\"Your email\" required></div>\n"
                . "          <div class=\"col-12\"><textarea name=\"message\" rows=\"4\" class=\"form-control form-control-lg\" placeholder=\"How can we help?\" required></textarea></div>\n"
                . "          <div class=\"col-12 text-center\"><button type=\"submit\" class=\"btn btn-brand btn-lg px-4\">Send message</button></div>\n"
                . "        </div>\n      </form>\n"
                . "    </div></div>\n"
                . ($wantsMaps ? "    <div class=\"row justify-content-center mt-4\"><div class=\"col-lg-8 reveal\"><div class=\"map-embed text-center text-body-secondary\"><i class=\"bi bi-geo-alt me-1\"></i>Add your Google Maps embed here.</div></div></div>\n" : '')
                . "  </div>\n</section>\n";
        }

        // ---- footer ----
        $year = date('Y');
        $body .= "<footer class=\"site-footer\">\n  <div class=\"container text-center\">\n"
            . "    <p class=\"footer-brand mb-1\">$name</p>\n"
            . "    <p class=\"text-body-secondary small mb-2\">" . $c('footer_tagline', '') . "</p>\n"
            . self::socialsHtml($brief)
            . "    <p class=\"text-body-secondary small mb-0\">&copy; $year $name. All rights reserved.</p>\n"
            . "    <p class=\"text-body-secondary\" style=\"font-size:.72rem;opacity:.6\">Built with Arch · princecaleb.dev</p>\n"
            . "  </div>\n</footer>\n";

        // ---- WhatsApp floating button ----
        if ($whatsapp !== '') {
            $body .= "<a class=\"whatsapp-fab\" href=\"https://wa.me/$whatsapp\" target=\"_blank\" rel=\"noopener\" aria-label=\"Chat on WhatsApp\"><i class=\"bi bi-whatsapp\"></i></a>\n";
        }

        $body .= "<script src=\"https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js\"></script>\n"
            . "<script>" . self::scrollJs() . "</script>\n"
            . self::contactJs()
            . "</body>\n</html>\n";

        return $head . $body;
    }

    private static function servicesHtml(array $content, bool $forCms): string
    {
        if ($forCms) {
            // Rendered by a PHP loop in index.php over the services_json column.
            return "<?php foreach (\$SERVICES as \$svc): ?>\n"
                . "      <div class=\"col-md-6 col-lg-4 reveal\">\n"
                . "        <div class=\"service-card h-100\">\n"
                . "          <div class=\"service-icon\"><i class=\"bi <?= h(\$svc['icon'] ?? 'bi-star') ?>\"></i></div>\n"
                . "          <h3 class=\"h5\"><?= h(\$svc['title'] ?? '') ?></h3>\n"
                . "          <p class=\"text-body-secondary mb-0\"><?= h(\$svc['description'] ?? '') ?></p>\n"
                . "        </div>\n      </div>\n"
                . "<?php endforeach; ?>\n";
        }
        $html = '';
        foreach ($content['services'] as $svc) {
            $html .= "      <div class=\"col-md-6 col-lg-4 reveal\">\n"
                . "        <div class=\"service-card h-100\">\n"
                . "          <div class=\"service-icon\"><i class=\"bi " . self::e(self::safeIcon($svc['icon'] ?? 'bi-star')) . "\"></i></div>\n"
                . "          <h3 class=\"h5\">" . self::e($svc['title'] ?? '') . "</h3>\n"
                . "          <p class=\"text-body-secondary mb-0\">" . self::e($svc['description'] ?? '') . "</p>\n"
                . "        </div>\n      </div>\n";
        }
        return $html;
    }

    private static function socialsHtml(array $brief): string
    {
        $socials = Arch::toList($brief['socials'] ?? []);
        if ($socials === []) {
            return '';
        }
        $html = "    <p class=\"footer-socials mb-2\">\n";
        foreach ($socials as $s) {
            $url = self::socialUrl($s);
            $icon = self::socialIcon($s);
            $html .= "      <a href=\"" . self::e($url) . "\" target=\"_blank\" rel=\"noopener\" aria-label=\"Social link\"><i class=\"bi $icon\"></i></a>\n";
        }
        return $html . "    </p>\n";
    }

    // ---- CMS: index.php + admin panel + config -----------------------------

    private static function buildCmsIndex(array $brief): string
    {
        $template = self::buildPageHtml($brief, self::fallbackContent($brief), true);
        // Escape any literal <?php that could appear in copy — there is none in
        // the template we generate, but keep the bootstrapping explicit.
        return "<?php\n"
            . "// Auto-generated by Arch. Renders editable content from content.sqlite.\n"
            . "require __DIR__ . '/config.php';\n"
            . "\$C = arch_load_content();\n"
            . "\$SERVICES = json_decode(\$C['services_json'] ?? '[]', true) ?: [];\n"
            . "function h(\$s) { return htmlspecialchars((string)\$s, ENT_QUOTES, 'UTF-8'); }\n"
            . "?>\n"
            . $template;
    }

    private static function buildCmsConfig(string $slug): string
    {
        $secret = Arch::cmsSecret();
        return "<?php\n"
            . "// Shared helpers for this generated CMS site. Self-contained — no framework needed.\n"
            . "declare(strict_types=1);\n\n"
            . "const ARCH_JWT_SECRET = " . var_export($secret, true) . ";\n"
            . "const ARCH_SITE_SLUG = " . var_export($slug, true) . ";\n\n"
            . "function arch_db(): PDO {\n"
            . "    static \$pdo = null;\n"
            . "    if (\$pdo === null) {\n"
            . "        \$pdo = new PDO('sqlite:' . __DIR__ . '/content.sqlite');\n"
            . "        \$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);\n"
            . "        \$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);\n"
            . "    }\n"
            . "    return \$pdo;\n"
            . "}\n\n"
            . "function arch_load_content(): array {\n"
            . "    \$out = [];\n"
            . "    foreach (arch_db()->query('SELECT key, value FROM content') as \$row) {\n"
            . "        \$out[\$row['key']] = \$row['value'];\n"
            . "    }\n"
            . "    return \$out;\n"
            . "}\n\n"
            . "function arch_config(string \$key): ?string {\n"
            . "    \$stmt = arch_db()->prepare('SELECT value FROM site_config WHERE key = ?');\n"
            . "    \$stmt->execute([\$key]);\n"
            . "    \$v = \$stmt->fetchColumn();\n"
            . "    return \$v === false ? null : (string)\$v;\n"
            . "}\n\n"
            . self::jwtPhpHelpers();
    }

    /** Self-contained HS256 JWT encode/decode — mirrors src/Support/Jwt.php. */
    private static function jwtPhpHelpers(): string
    {
        return "function arch_b64url(string \$data): string {\n"
            . "    return rtrim(strtr(base64_encode(\$data), '+/', '-_'), '=');\n"
            . "}\n"
            . "function arch_jwt_encode(array \$payload): string {\n"
            . "    \$h = arch_b64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));\n"
            . "    \$b = arch_b64url(json_encode(\$payload));\n"
            . "    \$sig = arch_b64url(hash_hmac('sha256', \"\$h.\$b\", ARCH_JWT_SECRET, true));\n"
            . "    return \"\$h.\$b.\$sig\";\n"
            . "}\n"
            . "function arch_jwt_decode(string \$token): ?array {\n"
            . "    \$parts = explode('.', \$token);\n"
            . "    if (count(\$parts) !== 3) { return null; }\n"
            . "    [\$h, \$b, \$sig] = \$parts;\n"
            . "    \$expected = arch_b64url(hash_hmac('sha256', \"\$h.\$b\", ARCH_JWT_SECRET, true));\n"
            . "    if (!hash_equals(\$expected, \$sig)) { return null; }\n"
            . "    \$payload = json_decode(base64_decode(strtr(\$b, '-_', '+/')), true);\n"
            . "    if (!is_array(\$payload)) { return null; }\n"
            . "    if (isset(\$payload['exp']) && time() >= (int)\$payload['exp']) { return null; }\n"
            . "    return \$payload;\n"
            . "}\n";
    }

    private static function buildAdminPanel(array $brief): string
    {
        $name = self::e((string) ($brief['business_name'] ?? 'Your site'));
        // The admin panel is one self-contained PHP file: JWT-cookie login, then a
        // form to edit every content field. Kept intentionally plain — Bootstrap
        // for looks, no build step, works on any PHP host.
        return <<<PHP
<?php
declare(strict_types=1);
require __DIR__ . '/../config.php';

const ARCH_COOKIE = 'arch_admin';

function current_admin(): ?array {
    \$token = \$_COOKIE[ARCH_COOKIE] ?? '';
    return \$token !== '' ? arch_jwt_decode(\$token) : null;
}

\$error = '';
\$saved = false;

// Logout
if (isset(\$_GET['logout'])) {
    setcookie(ARCH_COOKIE, '', time() - 3600, '/');
    header('Location: index.php');
    exit;
}

// Login
if ((\$_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && isset(\$_POST['password']) && !isset(\$_POST['save'])) {
    \$hash = arch_config('admin_password_hash') ?? '';
    if (\$hash !== '' && password_verify((string)\$_POST['password'], \$hash)) {
        \$token = arch_jwt_encode(['sub' => ARCH_SITE_SLUG, 'role' => 'admin', 'exp' => time() + 86400]);
        setcookie(ARCH_COOKIE, \$token, ['expires' => time() + 86400, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
        header('Location: index.php');
        exit;
    }
    \$error = 'Incorrect password.';
}

\$admin = current_admin();

// Save content
if (\$admin && (\$_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && isset(\$_POST['save'])) {
    \$editable = ['business_name','hero_title','hero_subtitle','hero_cta','about_heading','about_body','cta_heading','footer_tagline','phone','email'];
    \$upd = arch_db()->prepare('INSERT OR REPLACE INTO content (key, value) VALUES (?, ?)');
    foreach (\$editable as \$field) {
        if (isset(\$_POST[\$field])) {
            \$upd->execute([\$field, trim((string)\$_POST[\$field])]);
        }
    }
    \$saved = true;
}

function h(\$s) { return htmlspecialchars((string)\$s, ENT_QUOTES, 'UTF-8'); }
\$C = arch_load_content();
?>
<!DOCTYPE html>
<html lang="en" data-bs-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin — {$name}</title>
<meta name="robots" content="noindex, nofollow">
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet">
<style>body{background:#f6f7f9}.card{max-width:760px;margin:2rem auto}</style>
</head>
<body>
<?php if (!\$admin): ?>
  <div class="card shadow-sm">
    <div class="card-body p-4">
      <h1 class="h4 mb-3"><i class="bi bi-lock me-2"></i>{$name} admin</h1>
      <?php if (\$error): ?><div class="alert alert-danger py-2"><?= h(\$error) ?></div><?php endif; ?>
      <form method="post">
        <label class="form-label">Password</label>
        <input type="password" name="password" class="form-control mb-3" autofocus required>
        <button class="btn btn-primary w-100">Sign in</button>
      </form>
    </div>
  </div>
<?php else: ?>
  <div class="card shadow-sm">
    <div class="card-body p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h1 class="h4 mb-0"><i class="bi bi-pencil-square me-2"></i>Edit content</h1>
        <div><a href="../" target="_blank" class="btn btn-sm btn-outline-secondary">View site</a>
        <a href="?logout=1" class="btn btn-sm btn-outline-danger">Log out</a></div>
      </div>
      <?php if (\$saved): ?><div class="alert alert-success py-2">Changes saved.</div><?php endif; ?>
      <form method="post">
        <input type="hidden" name="save" value="1">
        <?php
        \$labels = [
          'business_name' => 'Business name', 'hero_title' => 'Hero headline',
          'hero_subtitle' => 'Hero subtitle', 'hero_cta' => 'Button label',
          'about_heading' => 'About heading', 'about_body' => 'About text',
          'cta_heading' => 'Contact heading', 'footer_tagline' => 'Footer tagline',
          'phone' => 'Phone', 'email' => 'Email',
        ];
        foreach (\$labels as \$field => \$label):
          \$multiline = in_array(\$field, ['hero_subtitle','about_body'], true);
        ?>
          <div class="mb-3">
            <label class="form-label"><?= h(\$label) ?></label>
            <?php if (\$multiline): ?>
              <textarea name="<?= h(\$field) ?>" rows="3" class="form-control"><?= h(\$C[\$field] ?? '') ?></textarea>
            <?php else: ?>
              <input type="text" name="<?= h(\$field) ?>" class="form-control" value="<?= h(\$C[\$field] ?? '') ?>">
            <?php endif; ?>
          </div>
        <?php endforeach; ?>
        <button class="btn btn-primary"><i class="bi bi-check2 me-1"></i>Save changes</button>
      </form>
      <p class="text-muted small mt-3 mb-0">Tip: to change your services or photos, contact Prince Caleb.</p>
    </div>
  </div>
<?php endif; ?>
</body>
</html>
PHP;
    }

    // ---- Contact form handler (used by both site shapes) -------------------

    private static function buildContactHandler(array $brief): string
    {
        // The recipient is the client's own email (their site's inbox); the
        // business name is baked in for the subject line. Uses PHP mail(), same
        // as the portfolio's Mailer — deliverability depends on the host's SMTP.
        $to = (string) ($brief['email'] ?? '');
        $businessName = (string) ($brief['business_name'] ?? 'Website');
        return "<?php\n"
            . "declare(strict_types=1);\n"
            . "// Auto-generated contact handler. Sends form submissions by email.\n"
            . "\$TO = " . var_export($to, true) . ";\n"
            . "\$BUSINESS = " . var_export($businessName, true) . ";\n\n"
            . "header('Content-Type: application/json');\n"
            . "if ((\$_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit; }\n\n"
            . "\$name = trim((string)(\$_POST['name'] ?? ''));\n"
            . "\$email = trim((string)(\$_POST['email'] ?? ''));\n"
            . "\$message = trim((string)(\$_POST['message'] ?? ''));\n\n"
            . "if (\$name === '' || !filter_var(\$email, FILTER_VALIDATE_EMAIL) || \$message === '') {\n"
            . "    http_response_code(422); echo json_encode(['error' => 'Please fill in your name, a valid email, and a message.']); exit;\n"
            . "}\n"
            . "if (mb_strlen(\$name) > 200 || mb_strlen(\$message) > 5000) {\n"
            . "    http_response_code(422); echo json_encode(['error' => 'That message is too long.']); exit;\n"
            . "}\n\n"
            . "if (\$TO === '' || !filter_var(\$TO, FILTER_VALIDATE_EMAIL)) {\n"
            . "    // No inbox configured yet — accept gracefully so the form still works.\n"
            . "    echo json_encode(['ok' => true, 'note' => 'received']); exit;\n"
            . "}\n\n"
            . "\$subject = 'New enquiry from your website — ' . \$BUSINESS;\n"
            . "\$body = \"You have a new message from your website contact form.\\n\\n\"\n"
            . "    . \"Name: \$name\\nEmail: \$email\\n\\nMessage:\\n\$message\\n\";\n"
            . "\$headers = 'From: ' . \$BUSINESS . ' <noreply@' . (\$_SERVER['HTTP_HOST'] ?? 'localhost') . \">\\r\\n\"\n"
            . "    . 'Reply-To: ' . \$email . \"\\r\\n\" . \"Content-Type: text/plain; charset=UTF-8\\r\\n\";\n"
            . "\$sent = @mail(\$TO, \$subject, \$body, \$headers);\n"
            . "echo json_encode(['ok' => (bool)\$sent]);\n";
    }

    /** Client-side AJAX submit so the contact form never leaves the page. */
    private static function contactJs(): string
    {
        return "<script>\n"
            . "document.querySelectorAll('.contact-form').forEach(function(form){\n"
            . "  form.addEventListener('submit', function(e){\n"
            . "    e.preventDefault();\n"
            . "    var alertBox = form.querySelector('#form-alert');\n"
            . "    var btn = form.querySelector('button[type=submit]');\n"
            . "    btn.disabled = true;\n"
            . "    fetch('contact.php', { method: 'POST', body: new FormData(form) })\n"
            . "      .then(function(r){ return r.json().catch(function(){ return {}; }); })\n"
            . "      .then(function(d){\n"
            . "        if (d && d.ok !== false && !d.error) {\n"
            . "          alertBox.innerHTML = '<div class=\"alert alert-success\">Thanks! Your message has been sent.</div>';\n"
            . "          form.reset();\n"
            . "        } else {\n"
            . "          alertBox.innerHTML = '<div class=\"alert alert-danger\">' + ((d && d.error) || 'Something went wrong. Please try again.') + '</div>';\n"
            . "        }\n"
            . "      })\n"
            . "      .catch(function(){ alertBox.innerHTML = '<div class=\"alert alert-danger\">Network error. Please try again.</div>'; })\n"
            . "      .finally(function(){ btn.disabled = false; });\n"
            . "  });\n"
            . "});\n</script>\n";
    }

    private static function scrollJs(): string
    {
        return "document.documentElement.style.scrollBehavior='smooth';"
            . "(function(){var io=new IntersectionObserver(function(es){es.forEach(function(en){"
            . "if(en.isIntersecting){en.target.classList.add('in');io.unobserve(en.target);}});},{threshold:.12});"
            . "document.querySelectorAll('.reveal').forEach(function(el){io.observe(el);});})();";
    }

    // ---- Theme / palette / fonts / CSS -------------------------------------

    /** @return array{primary:string,accent:string,bg:string,surface:string,text:string,muted:string,bs_theme:string} */
    private static function palette(array $brief): array
    {
        $style = strtolower((string) ($brief['style'] ?? 'modern'));
        $theme = strtolower((string) ($brief['theme'] ?? 'light'));
        $theme = in_array($theme, ['light', 'dark'], true) ? $theme : 'light';

        $defaults = [
            'modern' => ['#4f46e5', '#06b6d4'],
            'classic' => ['#7b1e3b', '#c99a4e'],
            'minimal' => ['#111827', '#6b7280'],
            'bold' => ['#e11d48', '#f59e0b'],
        ];
        [$dp, $da] = $defaults[$style] ?? $defaults['modern'];

        $primary = self::cssColor((string) ($brief['primary_color'] ?? ''), $dp);
        $accent = self::cssColor((string) ($brief['secondary_color'] ?? ''), $da);

        if ($theme === 'dark') {
            return [
                'primary' => $primary, 'accent' => $accent,
                'bg' => '#0b0c0e', 'surface' => '#16181d', 'text' => '#f3f4f6',
                'muted' => '#9aa0a6', 'bs_theme' => 'dark',
            ];
        }
        return [
            'primary' => $primary, 'accent' => $accent,
            'bg' => '#ffffff', 'surface' => '#f6f7f9', 'text' => '#1a1c1f',
            'muted' => '#5b616a', 'bs_theme' => 'light',
        ];
    }

    /** Accept a hex color or a plain CSS color name; otherwise use the fallback. */
    private static function cssColor(string $value, string $fallback): string
    {
        $value = trim($value);
        if ($value === '') {
            return $fallback;
        }
        if (preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $value)) {
            return $value;
        }
        // Bare hex without the hash.
        if (preg_match('/^([0-9a-fA-F]{6})$/', $value)) {
            return '#' . $value;
        }
        // A single CSS color keyword (letters only) — e.g. "teal", "navy".
        if (preg_match('/^[a-zA-Z]{3,20}$/', $value)) {
            return strtolower($value);
        }
        return $fallback;
    }

    /** @return array{url:string,heading:string,body:string} */
    private static function fontPair(string $style): array
    {
        $pairs = [
            'modern' => ['Plus Jakarta Sans', 'Inter'],
            'classic' => ['Playfair Display', 'Lora'],
            'minimal' => ['Inter', 'Inter'],
            'bold' => ['Poppins', 'Inter'],
        ];
        [$heading, $body] = $pairs[strtolower($style)] ?? $pairs['modern'];
        $families = $heading === $body
            ? 'family=' . str_replace(' ', '+', $heading) . ':wght@400;500;600;700;800'
            : 'family=' . str_replace(' ', '+', $heading) . ':wght@600;700;800&family=' . str_replace(' ', '+', $body) . ':wght@400;500;600';
        return [
            'url' => 'https://fonts.googleapis.com/css2?' . $families . '&display=swap',
            'heading' => $heading,
            'body' => $body,
        ];
    }

    private static function css(array $p, array $fonts): string
    {
        return ":root{--brand:{$p['primary']};--accent:{$p['accent']};--bg:{$p['bg']};--surface:{$p['surface']};--text:{$p['text']};--muted:{$p['muted']};}\n"
            . "body{font-family:'{$fonts['body']}',system-ui,sans-serif;color:var(--text);background:var(--bg);line-height:1.65;}\n"
            . "h1,h2,h3,.navbar-brand,.footer-brand{font-family:'{$fonts['heading']}','{$fonts['body']}',sans-serif;font-weight:700;letter-spacing:-.01em;}\n"
            . ".site-navbar{background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid color-mix(in srgb,var(--text) 10%,transparent);}\n"
            . ".navbar-brand{color:var(--brand)!important;}\n"
            . ".btn-brand{background:var(--brand);border:none;color:#fff;font-weight:600;border-radius:10px;padding:.6rem 1.4rem;transition:transform .15s ease,filter .15s ease;}\n"
            . ".btn-brand:hover{color:#fff;filter:brightness(1.08);transform:translateY(-1px);}\n"
            . ".hero{padding:7rem 0 5rem;background:linear-gradient(135deg,color-mix(in srgb,var(--brand) 16%,var(--bg)),var(--bg) 65%);}\n"
            . ".hero-title{font-size:clamp(2.2rem,6vw,3.8rem);margin-bottom:1rem;}\n"
            . ".hero-subtitle{font-size:clamp(1.05rem,2.5vw,1.35rem);color:var(--muted);max-width:640px;margin:0 auto 2rem;}\n"
            . ".section{padding:5rem 0;}\n.section-alt{background:var(--surface);}\n"
            . ".section-title{font-size:clamp(1.6rem,4vw,2.4rem);margin-bottom:1rem;}\n"
            . ".service-card{background:var(--bg);border:1px solid color-mix(in srgb,var(--text) 9%,transparent);border-radius:16px;padding:1.8rem;transition:transform .2s ease,box-shadow .2s ease;}\n"
            . ".service-card:hover{transform:translateY(-4px);box-shadow:0 18px 40px -24px color-mix(in srgb,var(--brand) 60%,transparent);}\n"
            . ".service-icon{width:52px;height:52px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;margin-bottom:1rem;background:color-mix(in srgb,var(--brand) 14%,transparent);color:var(--brand);}\n"
            . ".gallery-tile{aspect-ratio:4/3;border-radius:14px;background:linear-gradient(135deg,color-mix(in srgb,var(--brand) calc(30% + var(--i)*8%),var(--surface)),color-mix(in srgb,var(--accent) 40%,var(--surface)));}\n"
            . ".map-embed{border:2px dashed color-mix(in srgb,var(--text) 20%,transparent);border-radius:14px;padding:3rem 1rem;}\n"
            . ".contact-form .form-control{border-radius:10px;}\n"
            . ".site-footer{padding:3rem 0 2rem;background:var(--surface);border-top:1px solid color-mix(in srgb,var(--text) 8%,transparent);}\n"
            . ".footer-brand{color:var(--brand);font-size:1.3rem;}\n"
            . ".footer-socials a{color:var(--muted);font-size:1.3rem;margin:0 .5rem;transition:color .15s ease;}\n"
            . ".footer-socials a:hover{color:var(--brand);}\n"
            . ".whatsapp-fab{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;background:#25d366;color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.7rem;box-shadow:0 10px 30px -8px rgba(37,211,102,.6);z-index:1030;transition:transform .15s ease;}\n"
            . ".whatsapp-fab:hover{color:#fff;transform:scale(1.08);}\n"
            . ".reveal{opacity:0;transform:translateY(22px);transition:opacity .6s ease,transform .6s ease;}\n"
            . ".reveal.in{opacity:1;transform:none;}\n"
            . "@media(prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none;}}\n";
    }

    // ---- Icon / social / whatsapp helpers ----------------------------------

    private static function safeIcon(string $icon): string
    {
        $icon = trim($icon);
        if (preg_match('/^bi-[a-z0-9-]+$/', $icon)) {
            return $icon;
        }
        if (preg_match('/^[a-z0-9-]+$/', $icon)) {
            return 'bi-' . $icon;
        }
        return 'bi-star';
    }

    private static function iconForType(string $type): string
    {
        $type = strtolower($type);
        $map = [
            'restaurant' => 'bi-cup-hot', 'cafe' => 'bi-cup-hot', 'food' => 'bi-egg-fried',
            'shop' => 'bi-shop', 'store' => 'bi-shop', 'retail' => 'bi-bag',
            'church' => 'bi-book', 'ministry' => 'bi-book',
            'salon' => 'bi-scissors', 'spa' => 'bi-flower1', 'barber' => 'bi-scissors',
            'clinic' => 'bi-heart-pulse', 'health' => 'bi-heart-pulse', 'hospital' => 'bi-heart-pulse',
            'portfolio' => 'bi-briefcase', 'photographer' => 'bi-camera', 'photography' => 'bi-camera',
            'gym' => 'bi-activity', 'fitness' => 'bi-activity',
            'school' => 'bi-mortarboard', 'education' => 'bi-mortarboard',
            'law' => 'bi-bank', 'legal' => 'bi-bank', 'real estate' => 'bi-house',
        ];
        foreach ($map as $needle => $icon) {
            if (str_contains($type, $needle)) {
                return $icon;
            }
        }
        return 'bi-star';
    }

    private static function whatsappNumber(array $brief): string
    {
        $features = strtolower(implode(' ', Arch::toList($brief['features'] ?? [])));
        $raw = trim((string) ($brief['whatsapp'] ?? ''));
        if ($raw === '' && str_contains($features, 'whatsapp')) {
            // WhatsApp button requested but no dedicated number — fall back to phone.
            $raw = trim((string) ($brief['phone'] ?? ''));
        }
        // Digits only (wa.me format). Empty if nothing usable.
        $digits = preg_replace('/\D+/', '', $raw) ?? '';
        return strlen($digits) >= 7 ? $digits : '';
    }

    private static function socialUrl(string $s): string
    {
        $s = trim($s);
        if (preg_match('#^https?://#i', $s)) {
            return $s;
        }
        // A bare @handle or "instagram: name" — best-effort to a URL.
        if (preg_match('/instagram/i', $s) && preg_match('/@?([\w.]+)/', $s, $m)) {
            return 'https://instagram.com/' . ltrim($m[1], '@');
        }
        if (preg_match('/facebook/i', $s) && preg_match('/@?([\w.]+)/', $s, $m)) {
            return 'https://facebook.com/' . ltrim($m[1], '@');
        }
        if (str_starts_with($s, '@')) {
            return 'https://instagram.com/' . ltrim($s, '@');
        }
        return $s;
    }

    private static function socialIcon(string $s): string
    {
        $s = strtolower($s);
        foreach (['instagram' => 'bi-instagram', 'facebook' => 'bi-facebook', 'twitter' => 'bi-twitter-x',
                  'x.com' => 'bi-twitter-x', 'linkedin' => 'bi-linkedin', 'youtube' => 'bi-youtube',
                  'tiktok' => 'bi-tiktok', 'whatsapp' => 'bi-whatsapp'] as $needle => $icon) {
            if (str_contains($s, $needle)) {
                return $icon;
            }
        }
        return 'bi-globe';
    }

    private static function siteHtaccess(): string
    {
        // Keep the per-site SQLite content DB unreachable over HTTP.
        return "<Files \"content.sqlite\">\n  Require all denied\n</Files>\n"
            . "<FilesMatch \"\\.(sqlite|sqlite-.*)\$\">\n  Require all denied\n</FilesMatch>\n";
    }

    private static function e(string $s): string
    {
        return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    }
}
