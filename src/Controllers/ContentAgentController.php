<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\AiAgentEngine;
use App\Support\AiImage;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;

/**
 * Content agent (default name "Canvas"): a live, admin-session conversation for
 * making content — blog posts, social captions, and flyer graphics. Unlike the
 * pipeline agents (Beacon/Nurturer/Ledger) it has no automated cron side; it
 * only exists as chat() in the "Talk to Agents" console.
 *
 * It can stage real, reviewable drafts rather than just talking: save_blog_draft
 * writes an UNPUBLISHED blog_posts row, save_social_draft writes a social_post_drafts
 * row (status 'draft'), and create_flyer generates an image with Nano Banana
 * (Gemini's image model, see AiImage) sized to a real social platform. Nothing
 * it makes goes public on its own — blog drafts stay is_published = 0 and social
 * drafts stay 'draft', exactly where the Blog and Social Drafts admin pages
 * already expect to review them. Grounds itself in real brand facts and past
 * work via the shared get_site_info / search_content tools.
 */
class ContentAgentController
{
    private const MAX_MESSAGE_LENGTH = 1000;
    private const MAX_CHAT_TRANSCRIPT_TURNS = 30;

    /**
     * Real social platform pixel sizes create_flyer can target. Kept here (not
     * left to the model) so every generated file is an exact, correct size for
     * where it's going, and the tool schema can enumerate the choices.
     *
     * @var array<string,array{width:int,height:int,label:string}>
     */
    private const FLYER_SIZES = [
        'square' => ['width' => 1080, 'height' => 1080, 'label' => 'Square post (1080×1080)'],
        'portrait' => ['width' => 1080, 'height' => 1350, 'label' => 'Portrait post (1080×1350)'],
        'story' => ['width' => 1080, 'height' => 1920, 'label' => 'Story / Reel (1080×1920)'],
        'landscape' => ['width' => 1200, 'height' => 630, 'label' => 'Landscape / link (1200×630)'],
    ];

    /**
     * POST /api/v1/admin/agents/content/chat — body: {message, transcript: [{role,text}, ...]}.
     * Returns {reply, images}. `images` carries any flyers create_flyer produced
     * this turn (URL + label) so the console can render them inline — the engine
     * only hands back text, so they're captured from the tool executor closure,
     * the same way LiveChatController tracks a confirmed booking.
     */
    public static function chat(): void
    {
        AuthMiddleware::requireAuth();
        // A turn can run a text round-trip AND a Nano Banana image generation,
        // which is much slower than a plain reply — give it real headroom.
        set_time_limit(180);

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $message = trim((string) ($data['message'] ?? ''));
        $transcript = is_array($data['transcript'] ?? null) ? $data['transcript'] : [];

        if ($message === '' || mb_strlen($message) > self::MAX_MESSAGE_LENGTH) {
            Response::error('A message under ' . self::MAX_MESSAGE_LENGTH . ' characters is required.', 422);
        }
        if (count($transcript) > self::MAX_CHAT_TRANSCRIPT_TURNS) {
            $transcript = array_slice($transcript, -self::MAX_CHAT_TRANSCRIPT_TURNS);
        }
        $transcript[] = ['role' => 'user', 'text' => $message];

        $pdo = Database::get();
        $generatedImages = [];
        $executor = function (string $name, array $args) use ($pdo, &$generatedImages) {
            $result = self::runTool($name, $args, $pdo);
            if ($name === 'create_flyer' && !empty($result['url'])) {
                $generatedImages[] = ['url' => $result['url'], 'label' => $result['label'] ?? 'Flyer'];
            }
            return $result;
        };

        $result = AiAgentEngine::run(
            self::buildChatSystemPrompt(),
            self::chatToolDeclarations(),
            $executor,
            $transcript
        );
        if ($result['reply'] === null) {
            Response::error('Could not generate a reply — check that an AI provider is configured and reachable.', 502);
        }

        Response::json(['reply' => $result['reply'], 'images' => $generatedImages]);
    }

    private static function chatToolDeclarations(): array
    {
        return [
            SharedAgentTools::siteInfoToolDeclaration(),
            SharedAgentTools::searchContentToolDeclaration(),
            self::createFlyerToolDeclaration(),
            self::saveSocialDraftToolDeclaration(),
            self::saveBlogDraftToolDeclaration(),
        ];
    }

    private static function createFlyerToolDeclaration(): array
    {
        return [
            'name' => 'create_flyer',
            'description' => 'Generate a flyer / social graphic as an actual image, sized for a real social '
                . 'platform. Write a vivid, self-contained visual description (subject, style, mood, colours, '
                . 'and the exact headline/short text to render on it) — the image model only sees this '
                . 'description, not the conversation. Ground the look in Caleb\'s brand (call get_site_info '
                . 'first if unsure). The image is saved and shown to Caleb automatically; to attach it to a '
                . 'post, pass its returned url as image_url on save_social_draft.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'description' => ['type' => 'STRING', 'description' => 'Full visual prompt including any text to render on the flyer.'],
                    'size' => [
                        'type' => 'STRING',
                        'description' => 'One of: square (1080×1080 feed post), portrait (1080×1350 feed post), story (1080×1920 story/reel), landscape (1200×630 link/banner).',
                    ],
                ],
                'required' => ['description', 'size'],
            ],
        ];
    }

    private static function saveSocialDraftToolDeclaration(): array
    {
        return [
            'name' => 'save_social_draft',
            'description' => 'Save a social media post as a draft for Caleb to review on the Social Drafts '
                . 'page. Nothing is published — it lands with status "draft". Call this once the caption is '
                . 'ready; attach a flyer by passing its url from create_flyer as image_url.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'content' => ['type' => 'STRING', 'description' => 'The full post caption/body.'],
                    'short_content' => ['type' => 'STRING', 'description' => 'Optional shorter variant for character-limited platforms (e.g. X).'],
                    'hashtags' => ['type' => 'STRING', 'description' => 'Optional space-separated hashtags, e.g. "#webdesign #ghana".'],
                    'image_url' => ['type' => 'STRING', 'description' => 'Optional flyer/image path, e.g. a url returned by create_flyer.'],
                ],
                'required' => ['content'],
            ],
        ];
    }

    private static function saveBlogDraftToolDeclaration(): array
    {
        return [
            'name' => 'save_blog_draft',
            'description' => 'Save a blog post as an UNPUBLISHED draft for Caleb to review, edit, and publish '
                . 'himself on the Blog page. Never implies it is live. Provide a real title, a one-to-two '
                . 'sentence excerpt, and the full body (Markdown/HTML as the blog editor expects).',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'title' => ['type' => 'STRING'],
                    'excerpt' => ['type' => 'STRING', 'description' => 'Short summary shown in listings and previews.'],
                    'body' => ['type' => 'STRING', 'description' => 'The full article body.'],
                    'category' => ['type' => 'STRING', 'description' => 'Optional category label.'],
                    'cover_image_url' => ['type' => 'STRING', 'description' => 'Optional cover image path, e.g. a url returned by create_flyer (landscape works best).'],
                ],
                'required' => ['title', 'excerpt', 'body'],
            ],
        ];
    }

    private static function runTool(string $name, array $args, \PDO $pdo): array
    {
        return match ($name) {
            'get_site_info' => SharedAgentTools::getSiteInfo(),
            'search_content' => SharedAgentTools::searchContent($pdo, (string) ($args['query'] ?? '')),
            'create_flyer' => self::toolCreateFlyer($args),
            'save_social_draft' => self::toolSaveSocialDraft($args, $pdo),
            'save_blog_draft' => self::toolSaveBlogDraft($args, $pdo),
            default => ['error' => 'Unknown tool.'],
        };
    }

    private static function toolCreateFlyer(array $args): array
    {
        $description = trim((string) ($args['description'] ?? ''));
        $size = strtolower(trim((string) ($args['size'] ?? '')));

        if ($description === '') {
            return ['error' => 'A visual description is required to generate a flyer.'];
        }
        if (!isset(self::FLYER_SIZES[$size])) {
            return ['error' => 'size must be one of: ' . implode(', ', array_keys(self::FLYER_SIZES)) . '.'];
        }

        $spec = self::FLYER_SIZES[$size];
        $image = AiImage::generateFlyer($description, $spec['width'], $spec['height']);
        if ($image === null) {
            return ['error' => 'Image generation failed — the image provider may be unconfigured or unreachable. Tell Caleb you couldn\'t create the flyer right now.'];
        }

        return [
            'url' => $image['url'],
            'label' => $spec['label'],
            'width' => $image['width'],
            'height' => $image['height'],
            'note' => 'The flyer has been generated and shown to Caleb. Pass this url as image_url on save_social_draft to attach it to a post.',
        ];
    }

    private static function toolSaveSocialDraft(array $args, \PDO $pdo): array
    {
        $content = trim((string) ($args['content'] ?? ''));
        if ($content === '') {
            return ['error' => 'content is required to save a social draft.'];
        }
        $shortContent = trim((string) ($args['short_content'] ?? ''));
        $hashtags = trim((string) ($args['hashtags'] ?? ''));
        $imageUrl = trim((string) ($args['image_url'] ?? ''));

        $stmt = $pdo->prepare(
            'INSERT INTO social_post_drafts (source_type, source_id, content, short_content, hashtags, image_url, ai_provider, status) '
            . "VALUES ('general', NULL, ?, ?, ?, ?, 'content-agent', 'draft')"
        );
        $stmt->execute([
            $content,
            $shortContent !== '' ? $shortContent : null,
            $hashtags !== '' ? $hashtags : null,
            $imageUrl !== '' ? $imageUrl : null,
        ]);

        return ['saved' => true, 'id' => (int) $pdo->lastInsertId(), 'note' => 'Saved as a draft on the Social Drafts page for Caleb to review.'];
    }

    private static function toolSaveBlogDraft(array $args, \PDO $pdo): array
    {
        $title = trim((string) ($args['title'] ?? ''));
        $excerpt = trim((string) ($args['excerpt'] ?? ''));
        $body = trim((string) ($args['body'] ?? ''));
        if ($title === '' || $excerpt === '' || $body === '') {
            return ['error' => 'title, excerpt, and body are all required to save a blog draft.'];
        }
        $category = trim((string) ($args['category'] ?? ''));
        $cover = trim((string) ($args['cover_image_url'] ?? ''));
        // blog_posts.cover_image_path is NOT NULL; fall back to the site's
        // default share image so a text-only draft still saves. Caleb can swap
        // it on the Blog page before publishing.
        if ($cover === '') {
            $cover = '/uploads/og-image.png';
        }

        $slug = self::uniqueSlug($title, $pdo);

        $stmt = $pdo->prepare(
            'INSERT INTO blog_posts (slug, title, excerpt, body, category, cover_image_path, is_published) '
            . 'VALUES (?, ?, ?, ?, ?, ?, 0)'
        );
        $stmt->execute([
            $slug,
            $title,
            $excerpt,
            $body,
            $category !== '' ? $category : null,
            $cover,
        ]);

        return ['saved' => true, 'id' => (int) $pdo->lastInsertId(), 'slug' => $slug, 'note' => 'Saved as an UNPUBLISHED draft on the Blog page for Caleb to review and publish.'];
    }

    /** Slugify the title and guarantee uniqueness against existing blog_posts. */
    private static function uniqueSlug(string $title, \PDO $pdo): string
    {
        $base = strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', $title), '-'));
        if ($base === '') {
            $base = 'post';
        }
        $base = substr($base, 0, 80);

        $slug = $base;
        $check = $pdo->prepare('SELECT 1 FROM blog_posts WHERE slug = ?');
        for ($i = 0; $i < 20; $i++) {
            $check->execute([$slug]);
            if ($check->fetchColumn() === false) {
                return $slug;
            }
            $slug = $base . '-' . bin2hex(random_bytes(2));
        }
        // Extremely unlikely; fall back to a guaranteed-unique suffix.
        return $base . '-' . bin2hex(random_bytes(4));
    }

    private static function buildChatSystemPrompt(): string
    {
        $name = Settings::get('content_assistant_name') ?: 'Canvas';
        $genderLine = self::genderLine((string) Settings::get('content_voice_gender'));

        return "You are {$name}, the content studio for Caleb, a premium solo web and mobile app developer "
            . "(princecaleb.dev).{$genderLine} You help Caleb create content: blog posts, social media "
            . "captions, and flyer graphics. You are talking directly with Caleb himself right now (verified "
            . "by his admin session) — this is a working studio session, so talk naturally and get straight "
            . "to making things. Never run any lead-capture or sales script; he runs this business.\n\n"
            . "Match Caleb's voice: direct, technically credible, no corporate fluff or AI clichés, focused "
            . "on clean vanilla engineering, sharp UI/UX, smooth animations, and real performance. Before "
            . "writing anything substantial, ground yourself in real facts with get_site_info (his bio, "
            . "services, tech stack, tiers) and search_content (his real past projects and posts) rather than "
            . "inventing details or referencing work that doesn't exist.\n\n"
            . "You have tools to produce real, reviewable output — use them rather than only pasting text in "
            . "chat when Caleb wants something saved:\n"
            . "- create_flyer: generate an actual flyer/graphic image at a real social size (square, portrait, "
            . "story, or landscape). Write a vivid, self-contained visual prompt including the exact text to "
            . "render on it; the image model can't see the conversation. The result is shown to Caleb "
            . "automatically.\n"
            . "- save_social_draft: save a caption as a draft (attach a flyer via image_url from create_flyer).\n"
            . "- save_blog_draft: save a full blog post as an UNPUBLISHED draft.\n\n"
            . "Nothing you save is published — blog drafts stay unpublished and social drafts stay in draft "
            . "status for Caleb to review, edit, and publish himself. Be honest about that: never claim "
            . "something is live or posted. When you save or generate something, tell him plainly what you "
            . "made and where to find it (the Blog page or the Social Drafts page). Ask a clarifying question "
            . "or two when the brief is thin, but don't interrogate — lean toward drafting something concrete "
            . "he can react to.";
    }

    /** Lightly flavors the studio persona's framing; never surfaced in the content itself. */
    private static function genderLine(string $gender): string
    {
        if ($gender === 'male') {
            return ' Internally you may think of yourself as he/him.';
        }
        if ($gender === 'female') {
            return ' Internally you may think of yourself as she/her.';
        }
        return '';
    }
}
