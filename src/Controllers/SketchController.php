<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\AiAgentEngine;
use App\Support\AiImage;
use App\Support\AiText;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;
use App\Support\SiteReview;

/**
 * Sketch (default name): the UX/UI agent's chat interface in "Talk to
 * Agents". Unlike Ledger/Canvas it has no draft-review pipeline of its own
 * — every tool here does the real thing immediately (generates and returns
 * an actual image, actually fetches and reviews a live URL, hands back a
 * real ready-to-copy Arch link), the same way the one-shot buttons on
 * Proposals and Projects already do. This is a second front door onto that
 * identical logic (ProposalController::generateMockup(),
 * ProjectController::reviewBuild() via SiteReview, and arch-chat.js's
 * ?prefill= scheme), not a separate implementation of any of them.
 */
class SketchController
{
    private const MAX_MESSAGE_LENGTH = 1000;
    private const MAX_CHAT_TRANSCRIPT_TURNS = 30;

    /**
     * POST /api/v1/admin/agents/sketch/chat — body: {message, transcript}.
     * Returns {reply, images}. `images` carries any mockup generate_mockup
     * produced this turn (url + label), same shape Content's create_flyer
     * uses, so the console's existing image-rendering code needs no changes.
     */
    public static function chat(): void
    {
        AuthMiddleware::requireAuth();
        // A turn can run a text round-trip AND an image generation or a
        // live URL fetch — give it real headroom.
        set_time_limit(120);

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

        $generatedImages = [];
        $executor = function (string $name, array $args) use (&$generatedImages): array {
            $result = self::runTool($name, $args);
            if ($name === 'generate_mockup' && !empty($result['url'])) {
                $generatedImages[] = ['url' => $result['url'], 'label' => 'Mockup'];
            }
            return $result;
        };

        $result = AiAgentEngine::run(self::systemPrompt(), self::toolDeclarations(), $executor, $transcript);
        if ($result['reply'] === null) {
            Response::error('Could not generate a reply — check that an AI provider is configured and reachable.', 502);
        }

        Response::json(['reply' => SharedAgentTools::stripMarkdown($result['reply']), 'images' => $generatedImages]);
    }

    /** The agent's display name — admin-configurable on the Site Content page, like the other agents. */
    private static function displayName(): string
    {
        return Settings::get('sketch_assistant_name') ?: 'Sketch';
    }

    private static function genderLine(): string
    {
        return match ((string) Settings::get('sketch_voice_gender')) {
            'male' => ' Internally you may think of yourself as he/him.',
            'female' => ' Internally you may think of yourself as she/her.',
            default => '',
        };
    }

    private static function systemPrompt(): string
    {
        $name = self::displayName();
        return "You are {$name}, Prince Caleb's UX/UI agent (princecaleb.dev)." . self::genderLine() . " You have "
            . "three real capabilities, each of which does the actual thing immediately when you call it, not a "
            . "preview or a description: generate_mockup creates a real concept image, review_build actually "
            . "fetches a live URL and reviews its HTML, create_arch_link returns a real, ready-to-send link. "
            . "Speak plainly, no markdown, no bullet symbols, no emoji spam. Never claim you generated an image, "
            . "reviewed a page, or created a link unless you actually called the matching tool this turn and it "
            . "succeeded — if a tool errors, say so plainly rather than pretending it worked. review_build reads "
            . "HTML only — you have no way to see how a page actually looks (colors, spacing, layout, whether it "
            . "reads as polished), so never invent a visual opinion about appearance; only report what the "
            . "markup itself shows.";
    }

    /** @return array<int,array<string,mixed>> */
    private static function toolDeclarations(): array
    {
        return [
            self::generateMockupToolDeclaration(),
            self::reviewBuildToolDeclaration(),
            self::createArchLinkToolDeclaration(),
        ];
    }

    private static function generateMockupToolDeclaration(): array
    {
        return [
            'name' => 'generate_mockup',
            'description' => 'Generate a concept UI mockup image — a website homepage, a mobile app screen, or a '
                . 'brand style board — from a title and description. Real image generation: the result is shown '
                . 'to Caleb immediately, not just described in words.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'title' => ['type' => 'STRING', 'description' => 'Short project or business title.'],
                    'description' => ['type' => 'STRING', 'description' => 'What to show — scope, purpose, any specific sections or content.'],
                    'kind' => ['type' => 'STRING', 'description' => 'One of: website, mobile_app, brand_system. Defaults to website.'],
                ],
                'required' => ['title', 'description'],
            ],
        ];
    }

    private static function reviewBuildToolDeclaration(): array
    {
        return [
            'name' => 'review_build',
            'description' => 'Fetch a real, live URL and review its HTML structure — heading hierarchy, missing '
                . 'alt text, a responsive viewport meta tag, semantic landmarks, page title/meta description, '
                . 'unlabeled form inputs, placeholder content. Reads markup only, never renders the page, so it '
                . 'can never judge colors, spacing, or how anything actually looks.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'url' => ['type' => 'STRING', 'description' => 'A full http(s) URL to a live, publicly reachable page.'],
                ],
                'required' => ['url'],
            ],
        ];
    }

    private static function createArchLinkToolDeclaration(): array
    {
        return [
            'name' => 'create_arch_link',
            'description' => 'Create a real, ready-to-send link to Arch\'s website-builder chat, pre-filled with '
                . 'a style and/or colors so the client who opens it skips being asked to pick them. Returns the '
                . 'actual URL to send.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'business_name' => ['type' => 'STRING'],
                    'style' => ['type' => 'STRING', 'description' => 'One of: modern, classic, minimal, bold.'],
                    'primary_color' => ['type' => 'STRING', 'description' => 'Hex color, e.g. #3366ff.'],
                    'secondary_color' => ['type' => 'STRING', 'description' => 'Hex color, e.g. #ff6633.'],
                ],
            ],
        ];
    }

    private static function runTool(string $name, array $args): array
    {
        return match ($name) {
            'generate_mockup' => self::toolGenerateMockup($args),
            'review_build' => self::toolReviewBuild($args),
            'create_arch_link' => self::toolCreateArchLink($args),
            default => ['error' => 'Unknown tool.'],
        };
    }

    private static function toolGenerateMockup(array $args): array
    {
        $title = trim((string) ($args['title'] ?? ''));
        $description = trim((string) ($args['description'] ?? ''));
        $kind = strtolower(trim((string) ($args['kind'] ?? 'website')));
        if ($title === '' && $description === '') {
            return ['error' => 'A title or description is required to generate a mockup.'];
        }

        $kindHint = match ($kind) {
            'mobile_app' => 'a mobile app screen',
            'brand_system' => 'a brand style board (logo lockup, color palette, and type samples on a clean background)',
            default => 'a website homepage',
        };

        $prompt = "Design concept for {$kindHint}, for a project titled \"{$title}\"."
            . ($description !== '' ? "\n\nDetails: " . mb_substr($description, 0, 600) : '')
            . "\n\nShow a clean, modern, realistic UI as if it were a real screenshot — actual layout, "
            . "navigation, and content sections appropriate to this project, not an abstract graphic or a "
            . "collage of app icons. No visible watermarks; use short, plausible real-looking labels instead "
            . "of lorem ipsum placeholder text.";

        $result = AiImage::generateFlyer(
            $prompt,
            1600,
            1000,
            60,
            null,
            '#f5f5f5',
            'a clean, realistic UI mockup, as if it were an actual product screenshot',
            'mockup'
        );
        if ($result === null) {
            return ['error' => "Image generation failed — the image provider may be unconfigured or unreachable. Tell Caleb you couldn't generate the mockup right now."];
        }

        return ['url' => $result['url']];
    }

    private static function toolReviewBuild(array $args): array
    {
        $url = trim((string) ($args['url'] ?? ''));
        if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $url)) {
            return ['error' => 'A valid http(s) URL is required.'];
        }

        $html = SiteReview::fetchHtml($url);
        if ($html === null) {
            return ['error' => 'Could not fetch that URL — tell Caleb to check it is live and publicly reachable.'];
        }

        $result = AiText::generateWithProvider(SiteReview::buildReviewPrompt($url, $html), null, 45);
        if ($result === null) {
            return ['error' => 'Could not generate a review right now.'];
        }

        $text = trim((string) preg_replace('/^```(?:json)?\s*|```\s*$/m', '', $result['text']));
        $parsed = json_decode($text, true);
        if (!is_array($parsed)) {
            return ['error' => 'Could not parse a review from the model output.'];
        }

        return $parsed;
    }

    private static function toolCreateArchLink(array $args): array
    {
        $prefill = array_filter([
            'business_name' => trim((string) ($args['business_name'] ?? '')),
            'style' => trim((string) ($args['style'] ?? '')),
            'primary_color' => trim((string) ($args['primary_color'] ?? '')),
            'secondary_color' => trim((string) ($args['secondary_color'] ?? '')),
        ], static fn(string $v): bool => $v !== '');

        $url = self::absoluteUrl('/chat.html');
        if ($prefill) {
            // base64_encode(json_encode()) of raw UTF-8 bytes — arch-chat.js's
            // decodePrefill() reverses exactly this via atob() + a percent-
            // decode dance (the JS-side equivalent of encoding raw UTF-8
            // bytes without going through btoa's Latin1-only restriction).
            $url .= '?prefill=' . base64_encode((string) json_encode($prefill));
        }

        return ['url' => $url];
    }

    private static function absoluteUrl(string $path): string
    {
        $host = $_SERVER['HTTP_HOST'] ?? 'princecaleb.dev';
        $forwardedProto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || $forwardedProto === 'https' ? 'https' : 'http';
        if ($host === 'princecaleb.dev' || str_ends_with($host, '.princecaleb.dev')) {
            $scheme = 'https';
        }

        return $scheme . '://' . $host . $path;
    }
}
