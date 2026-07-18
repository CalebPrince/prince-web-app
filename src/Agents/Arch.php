<?php

declare(strict_types=1);

namespace App\Agents;

use App\Support\AiAgentEngine;
use App\Support\Database;
use App\Support\Jwt;
use App\Support\Mailer;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;
use PDO;

/**
 * Arch — the Website Builder agent (Architecture + AI).
 *
 * Two jobs, one per public endpoint:
 *
 *  1. chat()      — a friendly, one-question-at-a-time conversation that walks a
 *                   client through five requirement steps (business, look, pages,
 *                   features, content) and returns a running structured brief plus
 *                   a reliable "Step X of 5" progress signal. The model does the
 *                   talking and the extraction (via the single update_brief tool),
 *                   running on the same Gemini -> OpenRouter -> Groq fallback the
 *                   rest of the studio's agents use (AiAgentEngine); the server
 *                   owns readiness so a chatty model can't jump the gun.
 *
 *  2. generate()  — turns a completed brief into a real, deployable website written
 *                   to public/generated-sites/{slug}/ and served statically at
 *                   /generated-sites/{slug}/. Every required feature (responsive
 *                   Bootstrap 5, dark/light theme, WhatsApp button, contact form
 *                   with email notification, SEO meta, Google Fonts, scroll
 *                   animations, footer) is assembled from a template we control
 *                   (ArchSiteBuilder), with the LLM supplying the on-brand copy;
 *                   if the copy call fails the brief itself still fills the
 *                   template, so a site is always delivered. Opting into the CMS
 *                   writes a self-contained, password-protected PHP admin panel
 *                   beside the site using the same HS256 JWT scheme as the portfolio.
 *
 * Kept as a plain agent class (not a Controller) because the two thin endpoint
 * files under public/api/v1/arch/ own the HTTP shell; this holds the logic.
 */
class Arch
{
    public const AGENT_NAME = 'Arch';
    public const TOTAL_STEPS = 5;

    private const MAX_MESSAGE_LENGTH = 2000;
    private const MAX_TRANSCRIPT_TURNS = 40;

    /** Style and theme choices offered in the flow — validated so generation never sees junk. */
    private const STYLES = ['modern', 'classic', 'minimal', 'bold'];
    private const THEMES = ['dark', 'light'];

    /** Directory (under public/) every generated site lives in. */
    private const SITES_DIR = 'generated-sites';

    /**
     * POST /api/v1/arch/chat — body: {message, transcript?: [{role,text}], brief?: {...}}.
     * Returns {reply, brief, step, total_steps, ready}.
     */
    public static function chat(): void
    {
        // A turn is a single short chat round-trip across up to three providers;
        // give it headroom for a slow free-tier fallback without hanging forever.
        set_time_limit(120);

        if (!self::aiConfigured()) {
            Response::error('The website builder is not available right now — please use the contact form.', 503);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $message = trim((string) ($data['message'] ?? ''));
        $transcript = is_array($data['transcript'] ?? null) ? $data['transcript'] : [];
        $brief = is_array($data['brief'] ?? null) ? $data['brief'] : [];

        if ($message === '' || mb_strlen($message) > self::MAX_MESSAGE_LENGTH) {
            Response::error('A message under ' . self::MAX_MESSAGE_LENGTH . ' characters is required.', 422);
        }
        if (count($transcript) > self::MAX_TRANSCRIPT_TURNS) {
            $transcript = array_slice($transcript, -self::MAX_TRANSCRIPT_TURNS);
        }
        // Normalise transcript turns to the {role,text} shape the engine expects.
        $transcript = array_values(array_filter(array_map(static function ($t) {
            if (!is_array($t)) {
                return null;
            }
            $role = ($t['role'] ?? '') === 'user' ? 'user' : 'assistant';
            $text = trim((string) ($t['text'] ?? ''));
            return $text === '' ? null : ['role' => $role, 'text' => $text];
        }, $transcript)));
        $transcript[] = ['role' => 'user', 'text' => $message];

        // The tool executor is the only way the model mutates the brief. It
        // returns the merged brief back to the model so its next question is
        // grounded in exactly what's now on record.
        $executor = function (string $name, array $args) use (&$brief): array {
            if ($name !== 'update_brief') {
                return ['error' => 'Unknown tool.'];
            }
            $brief = self::mergeBrief($brief, $args);
            return [
                'ok' => true,
                'collected' => $brief,
                'next_step' => self::nextStep($brief),
                'complete' => self::briefIsComplete($brief),
            ];
        };

        $result = AiAgentEngine::run(
            self::chatSystemPrompt(),
            [self::updateBriefToolDeclaration()],
            $executor,
            $transcript
        );

        $reply = $result['reply'];
        if ($reply === null) {
            // Every provider failed or produced no text — keep the flow alive
            // with a deterministic next question rather than a dead end.
            $reply = self::deterministicPrompt($brief);
        } else {
            $reply = SharedAgentTools::stripMarkdown($reply);
        }

        $complete = self::briefIsComplete($brief);
        Response::json([
            'reply' => $reply,
            'brief' => $brief,
            'step' => self::currentStep($brief),
            'total_steps' => self::TOTAL_STEPS,
            'ready' => $complete,
        ]);
    }

    /**
     * POST /api/v1/arch/generate — body: {brief: {...}}.
     * Builds and writes the site, returns {slug, preview_url, download_url,
     * has_cms, admin_url?, admin_password?}.
     */
    public static function generate(): void
    {
        // Generation runs one (sometimes two) LLM copy calls plus disk writes.
        // AiText walks all three providers, so budget real headroom.
        set_time_limit(180);

        if (!self::aiConfigured()) {
            Response::error('The website builder is not available right now — please use the contact form.', 503);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $brief = is_array($data['brief'] ?? null) ? $data['brief'] : [];
        $brief = self::normaliseBrief($brief);

        $missing = self::missingRequired($brief);
        if ($missing !== []) {
            Response::error('The brief is missing required details: ' . implode(', ', $missing) . '.', 422);
        }

        $slug = self::uniqueSlug((string) $brief['business_name']);
        $baseDir = self::sitesRoot() . '/' . $slug;
        if (!self::ensureDir($baseDir)) {
            Response::error('Could not create the site directory on the server.', 500);
        }

        // Ask the model for on-brand copy; fall back to brief-derived copy so a
        // provider outage never blocks delivery.
        $content = ArchSiteBuilder::generateContent($brief);
        $usedProvider = $content['_provider'] ?? 'template';
        unset($content['_provider']);

        $hasCms = !empty($brief['wants_cms']);
        $adminPassword = null;
        $adminHash = null;

        if ($hasCms) {
            // A fresh, human-readable per-site password — never the portfolio's
            // own admin password. Shown once to the client and stored hashed.
            $adminPassword = self::generatePassword();
            $adminHash = password_hash($adminPassword, PASSWORD_DEFAULT);
            ArchSiteBuilder::writeCmsSite($baseDir, $slug, $brief, $content, $adminHash);
        } else {
            ArchSiteBuilder::writeStaticSite($baseDir, $slug, $brief, $content);
        }

        // Persist the delivered site (drives the Team page's "sites built" stat).
        $pdo = Database::get();
        $pdo->prepare(
            'INSERT INTO generated_sites
                (slug, business_name, business_type, client_name, client_email, brief_json, has_cms, admin_password_hash, provider)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $slug,
            (string) $brief['business_name'],
            (string) ($brief['business_type'] ?? ''),
            (string) ($brief['client_name'] ?? ''),
            (string) ($brief['email'] ?? ''),
            json_encode($brief),
            $hasCms ? 1 : 0,
            $adminHash,
            $usedProvider,
        ]);

        $previewUrl = '/' . self::SITES_DIR . '/' . $slug . '/';
        $downloadUrl = '/api/v1/arch/download.php?slug=' . rawurlencode($slug);

        self::notifyOwner($brief, $slug, $previewUrl, $hasCms);
        self::notifyClient($brief, $slug, $previewUrl, $hasCms, $adminPassword);

        Response::json([
            'slug' => $slug,
            'preview_url' => $previewUrl,
            'download_url' => $downloadUrl,
            'has_cms' => $hasCms,
            'admin_url' => $hasCms ? $previewUrl . 'admin/' : null,
            'admin_password' => $adminPassword,
        ]);
    }

    /** Count of sites Arch has actually delivered — the Team page headline stat. */
    public static function sitesBuilt(PDO $pdo): int
    {
        try {
            return (int) $pdo->query('SELECT COUNT(*) FROM generated_sites')->fetchColumn();
        } catch (\Throwable $e) {
            return 0;
        }
    }

    // ---- Conversation: brief shape, merging, readiness ---------------------

    /**
     * Merge a model-supplied update_brief payload into the running brief.
     * Scalars overwrite; list fields (pages/features/services/socials) merge
     * and de-duplicate so the client can add to them across turns without
     * losing earlier answers. Unknown keys are ignored.
     */
    private static function mergeBrief(array $brief, array $args): array
    {
        $scalars = [
            'business_name', 'business_type', 'primary_color', 'secondary_color',
            'style', 'theme', 'tagline', 'description', 'phone', 'email',
            'whatsapp', 'client_name',
        ];
        foreach ($scalars as $key) {
            if (isset($args[$key]) && is_scalar($args[$key])) {
                $val = trim((string) $args[$key]);
                if ($val !== '') {
                    $brief[$key] = $val;
                }
            }
        }

        foreach (['pages', 'features', 'services', 'socials'] as $key) {
            if (!isset($args[$key])) {
                continue;
            }
            $incoming = self::toList($args[$key]);
            $existing = self::toList($brief[$key] ?? []);
            $merged = [];
            foreach (array_merge($existing, $incoming) as $item) {
                $item = trim((string) $item);
                if ($item !== '' && !in_array(strtolower($item), array_map('strtolower', $merged), true)) {
                    $merged[] = $item;
                }
            }
            $brief[$key] = $merged;
        }

        // Booleans and step markers the model may pass.
        if (array_key_exists('wants_cms', $args)) {
            $brief['wants_cms'] = self::toBool($args['wants_cms']);
        }
        // The model can flag a step as answered even when the client's answer was
        // "none" (e.g. no extra features) — otherwise an empty list would keep
        // the flow stuck on that step forever.
        foreach (['features_done', 'content_done'] as $flag) {
            if (array_key_exists($flag, $args)) {
                $brief[$flag] = self::toBool($args[$flag]);
            }
        }

        return self::normaliseBrief($brief);
    }

    /** Coerce/clamp fields to valid values so generation never has to. */
    private static function normaliseBrief(array $brief): array
    {
        if (isset($brief['style'])) {
            $s = strtolower(trim((string) $brief['style']));
            $brief['style'] = in_array($s, self::STYLES, true) ? $s : 'modern';
        }
        if (isset($brief['theme'])) {
            $t = strtolower(trim((string) $brief['theme']));
            $brief['theme'] = in_array($t, self::THEMES, true) ? $t : 'light';
        }
        foreach (['pages', 'features', 'services', 'socials'] as $key) {
            if (isset($brief[$key])) {
                $brief[$key] = self::toList($brief[$key]);
            }
        }
        if (isset($brief['email'])) {
            $email = trim((string) $brief['email']);
            $brief['email'] = filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : '';
        }
        return $brief;
    }

    /**
     * The five requirement steps, each a predicate over the brief. Readiness and
     * the progress indicator both derive from this single source of truth, so the
     * UI's "Step X of 5" can never disagree with what generation actually needs.
     *
     * @return array<int,bool> 1-indexed step => done?
     */
    private static function stepStatus(array $brief): array
    {
        $has = static fn(string $k): bool => isset($brief[$k]) && trim((string) $brief[$k]) !== '';
        $hasList = static fn(string $k): bool => !empty($brief[$k]) && is_array($brief[$k]);

        return [
            1 => $has('business_name') && $has('business_type'),
            2 => $has('style'),
            3 => $hasList('pages'),
            // Features are optional in content but the step must be answerable —
            // treat it done once there's at least one feature OR the model marked
            // it explicitly answered (client said "none").
            4 => $hasList('features') || !empty($brief['features_done']),
            // Content step: a tagline or description is enough to consider the
            // client's story captured, or an explicit content_done flag.
            5 => $has('tagline') || $has('description') || !empty($brief['content_done']),
        ];
    }

    private static function briefIsComplete(array $brief): bool
    {
        foreach (self::stepStatus($brief) as $done) {
            if (!$done) {
                return false;
            }
        }
        return true;
    }

    /** 1-based index of the step the client is currently on (first unfinished, capped). */
    private static function currentStep(array $brief): int
    {
        foreach (self::stepStatus($brief) as $step => $done) {
            if (!$done) {
                return $step;
            }
        }
        return self::TOTAL_STEPS;
    }

    /** The step the model should ask about next (for the tool result). */
    private static function nextStep(array $brief): int
    {
        return self::currentStep($brief);
    }

    /** @return string[] required brief keys still missing for generation */
    private static function missingRequired(array $brief): array
    {
        $missing = [];
        if (empty($brief['business_name'])) {
            $missing[] = 'business name';
        }
        if (empty($brief['style'])) {
            $missing[] = 'style';
        }
        if (empty($brief['pages']) || !is_array($brief['pages'])) {
            $missing[] = 'at least one page';
        }
        return $missing;
    }

    // ---- Prompts & tool ----------------------------------------------------

    private static function chatSystemPrompt(): string
    {
        return "You are Arch, a friendly, professional website-builder agent for Prince Caleb "
            . "(princecaleb.dev). Arch stands for Architecture + AI. You guide a client through a short, "
            . "warm conversation to gather everything needed to build their website, then hand off to the "
            . "builder. Speak naturally and plainly — no markdown, no bullet symbols, no emoji spam. Ask "
            . "ONE question at a time and wait for the answer.\n\n"
            . "Gather requirements in these five steps, in order:\n"
            . "Step 1 — Business: their business name and what type it is (restaurant, shop, church, "
            . "portfolio, salon, clinic, etc.).\n"
            . "Step 2 — Look: preferred colors, and a style — one of modern, classic, minimal, or bold. "
            . "Also gently confirm whether they want a light or dark theme.\n"
            . "Step 3 — Pages: which pages they need (Home, About, Services, Contact, Gallery, Blog, Shop). "
            . "Home is always included.\n"
            . "Step 4 — Features: key features — contact form, WhatsApp button, Google Maps, payment, photo "
            . "gallery, booking. If they don't want any extras, that's fine; move on.\n"
            . "Step 5 — Content: their tagline, a short description of the business, a services list if "
            . "relevant, and contact details (phone, email, social links).\n\n"
            . "After EVERY client message, call the update_brief tool to record any new details they gave, "
            . "using the correct fields, before you reply. Set features_done to true once you've asked about "
            . "features (even if they wanted none), and content_done to true once you've captured their "
            . "content. When all five steps are covered, do not keep asking questions — briefly summarise "
            . "what you'll build, tell them you're ready to build it, and ask them to hit the build button "
            . "(or say 'build it'). Keep replies short: a sentence or two, then the next single question. "
            . "Never invent details the client didn't give.";
    }

    private static function updateBriefToolDeclaration(): array
    {
        return [
            'name' => 'update_brief',
            'description' => 'Record structured website requirements the client has provided so far. Call this '
                . 'on every turn with only the fields the client just gave (leave the rest out). List fields '
                . 'accumulate across calls, so you never need to resend earlier answers.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'business_name' => ['type' => 'STRING'],
                    'business_type' => ['type' => 'STRING', 'description' => 'e.g. restaurant, shop, church, portfolio, salon, clinic.'],
                    'primary_color' => ['type' => 'STRING', 'description' => 'Preferred main color, name or hex.'],
                    'secondary_color' => ['type' => 'STRING', 'description' => 'Optional accent color, name or hex.'],
                    'style' => ['type' => 'STRING', 'description' => 'One of: modern, classic, minimal, bold.'],
                    'theme' => ['type' => 'STRING', 'description' => 'One of: light, dark.'],
                    'pages' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING'], 'description' => 'Pages/sections wanted, e.g. Home, About, Services, Contact, Gallery, Blog, Shop.'],
                    'features' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING'], 'description' => 'e.g. contact form, WhatsApp button, Google Maps, payment, photo gallery, booking.'],
                    'features_done' => ['type' => 'BOOLEAN', 'description' => 'True once you have asked about features, even if the client wanted none.'],
                    'tagline' => ['type' => 'STRING'],
                    'description' => ['type' => 'STRING', 'description' => 'A short description of the business.'],
                    'services' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING'], 'description' => 'List of services/offerings.'],
                    'phone' => ['type' => 'STRING'],
                    'whatsapp' => ['type' => 'STRING', 'description' => 'WhatsApp number in international format if given.'],
                    'email' => ['type' => 'STRING'],
                    'socials' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING'], 'description' => 'Social links or handles.'],
                    'content_done' => ['type' => 'BOOLEAN', 'description' => 'True once the tagline/description and contact details are captured.'],
                    'client_name' => ['type' => 'STRING', 'description' => 'The client\'s own name, if they share it.'],
                    'wants_cms' => ['type' => 'BOOLEAN', 'description' => 'True if the client wants a CMS / admin panel to edit content later.'],
                ],
                'required' => [],
            ],
        ];
    }

    /** A deterministic next-question, used only when the AI fallback chain fails entirely. */
    private static function deterministicPrompt(array $brief): string
    {
        return match (self::currentStep($brief)) {
            1 => "Let's start with the basics — what's the name of your business, and what type is it (restaurant, shop, church, portfolio, and so on)?",
            2 => "Great. What colors and overall style are you after? For style, pick one of: modern, classic, minimal, or bold — and let me know if you'd prefer a light or dark look.",
            3 => "Which pages do you need? Common ones are Home, About, Services, Contact, Gallery, Blog, and Shop.",
            4 => "Any key features you'd like? For example a contact form, WhatsApp button, Google Maps, payments, a photo gallery, or online booking. If none, just say so.",
            default => "Last step — tell me your tagline, a short description of the business, your services, and how people can reach you (phone, email, social links).",
        };
    }

    // ---- Site delivery: slug, dirs, notifications --------------------------

    /** Absolute filesystem path to public/generated-sites. */
    public static function sitesRoot(): string
    {
        $docRoot = $_SERVER['DOCUMENT_ROOT'] ?? '';
        if ($docRoot !== '' && is_dir($docRoot)) {
            return rtrim($docRoot, '/') . '/' . self::SITES_DIR;
        }
        // CLI / dev-server fallback: repo public/ dir (src/Agents -> ../../public).
        return dirname(__DIR__, 2) . '/public/' . self::SITES_DIR;
    }

    private static function uniqueSlug(string $businessName): string
    {
        $base = self::slugify($businessName);
        if ($base === '') {
            $base = 'site';
        }
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT 1 FROM generated_sites WHERE slug = ?');
        // Append a short random suffix so two "Joe's Cafe" sites never collide,
        // and so the preview URL isn't trivially guessable/enumerable.
        for ($i = 0; $i < 20; $i++) {
            $slug = $base . '-' . substr(bin2hex(random_bytes(3)), 0, 5);
            $stmt->execute([$slug]);
            if ($stmt->fetchColumn() === false && !is_dir(self::sitesRoot() . '/' . $slug)) {
                return $slug;
            }
        }
        // Astronomically unlikely to reach here; guarantee uniqueness anyway.
        return $base . '-' . bin2hex(random_bytes(6));
    }

    private static function slugify(string $text): string
    {
        $text = strtolower(trim($text));
        $text = preg_replace('/[^a-z0-9]+/', '-', $text) ?? '';
        $text = trim($text, '-');
        return substr($text, 0, 40);
    }

    private static function ensureDir(string $dir): bool
    {
        if (is_dir($dir)) {
            return true;
        }
        return mkdir($dir, 0755, true) && is_dir($dir);
    }

    /** Human-friendly per-site admin password: two short words + digits. */
    private static function generatePassword(): string
    {
        return 'site-' . bin2hex(random_bytes(4)) . '-' . random_int(100, 999);
    }

    private static function notifyOwner(array $brief, string $slug, string $previewUrl, bool $hasCms): void
    {
        $to = Settings::get('mail_from') ?: 'noreply@princecaleb.dev';
        // Prefer the site owner's real notification address if one is configured.
        $to = Settings::get('inquiry_notify_email') ?: $to;
        $preview = 'https://princecaleb.dev' . $previewUrl;
        $lines = [
            'Arch just built a new client website.',
            '',
            'Business: ' . ($brief['business_name'] ?? '(unnamed)'),
            'Type: ' . ($brief['business_type'] ?? 'n/a'),
            'Style: ' . ($brief['style'] ?? 'n/a') . ' / ' . ($brief['theme'] ?? 'light') . ' theme',
            'Pages: ' . implode(', ', self::toList($brief['pages'] ?? [])),
            'Features: ' . (implode(', ', self::toList($brief['features'] ?? [])) ?: 'none'),
            'CMS admin panel: ' . ($hasCms ? 'yes' : 'no'),
            'Client: ' . ($brief['client_name'] ?? 'n/a') . ' <' . ($brief['email'] ?? 'n/a') . '>',
            '',
            'Preview: ' . $preview,
            'Slug: ' . $slug,
        ];
        Mailer::send($to, 'New site built by Arch: ' . ($brief['business_name'] ?? $slug), implode("\n", $lines));
    }

    private static function notifyClient(array $brief, string $slug, string $previewUrl, bool $hasCms, ?string $adminPassword): void
    {
        $email = trim((string) ($brief['email'] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return;
        }
        $preview = 'https://princecaleb.dev' . $previewUrl;
        $lines = [
            'Hi ' . ($brief['client_name'] ?: 'there') . ',',
            '',
            'Your new website for "' . ($brief['business_name'] ?? 'your business') . '" is ready to preview:',
            $preview,
            '',
        ];
        if ($hasCms && $adminPassword !== null) {
            $lines[] = 'You asked for an admin panel to edit your content. Sign in here:';
            $lines[] = $preview . 'admin/';
            $lines[] = 'Password: ' . $adminPassword;
            $lines[] = '(Keep this password safe — it is shown only once.)';
            $lines[] = '';
        }
        $lines[] = 'Built with Arch, the AI website builder at princecaleb.dev.';
        Mailer::send($email, 'Your new website is ready — ' . ($brief['business_name'] ?? 'preview inside'), implode("\n", $lines));
    }

    // ---- Small shared helpers ----------------------------------------------

    public static function aiConfigured(): bool
    {
        return !empty(Settings::get('gemini_api_key'))
            || !empty(Settings::get('openrouter_api_key'))
            || !empty(Settings::get('groq_api_key'));
    }

    /** @return string[] */
    public static function toList(mixed $value): array
    {
        if (is_array($value)) {
            return array_values(array_filter(array_map(
                static fn($v) => is_scalar($v) ? trim((string) $v) : '',
                $value
            ), static fn($v) => $v !== ''));
        }
        if (is_string($value) && trim($value) !== '') {
            // Accept a comma/newline-separated string too (some models pass one).
            return array_values(array_filter(array_map('trim', preg_split('/[,\n]+/', $value) ?: []), static fn($v) => $v !== ''));
        }
        return [];
    }

    public static function toBool(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }
        if (is_string($value)) {
            return in_array(strtolower(trim($value)), ['1', 'true', 'yes', 'y', 'on'], true);
        }
        return (bool) $value;
    }

    /** JWT for the generated CMS panels — same HS256 scheme as the portfolio. */
    public static function cmsSecret(): string
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        return (string) (appConfig()['jwt_secret'] ?? 'dev-secret-change-me-in-production');
    }
}
