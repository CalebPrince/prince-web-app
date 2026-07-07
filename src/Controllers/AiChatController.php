<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\RateLimitMiddleware;
use App\Support\AiText;
use App\Support\Database;
use App\Support\Response;

/**
 * Secondary, opt-in AI assistant: recommends relevant case studies based on what
 * a visitor describes. Never blocks or degrades the primary site — it's rate
 * limited on its own bucket and falls back to simple keyword matching if no
 * AI provider is configured (or if Gemini and OpenRouter both fail), so the
 * feature is fully optional infrastructure.
 */
class AiChatController
{
    public static function chat(): void
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        $config = appConfig();
        RateLimitMiddleware::enforce('ai_chat', $config['ai_rate_limit']);

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $message = trim((string) ($data['message'] ?? ''));
        if ($message === '' || mb_strlen($message) > 1000) {
            Response::error('A message under 1000 characters is required.', 422);
        }

        $pdo = Database::get();
        $projects = $pdo->query(
            "SELECT p.id, p.title, p.slug, p.summary, GROUP_CONCAT(t.name, ', ') AS tag_names
             FROM projects p
             LEFT JOIN project_tags pt ON pt.project_id = p.id
             LEFT JOIN tags t ON t.id = pt.tag_id
             WHERE p.is_published = 1
             GROUP BY p.id"
        )->fetchAll();

        $reply = self::askAi($message, $projects);
        if ($reply !== null) {
            Response::json(['reply' => $reply, 'mode' => 'ai']);
        }

        Response::json(['reply' => self::keywordFallback($message, $projects), 'mode' => 'fallback']);
    }

    private static function askAi(string $message, array $projects): ?string
    {
        $catalog = implode("\n", array_map(
            fn($p) => "- {$p['title']} ({$p['tag_names']}): {$p['summary']}",
            $projects
        ));

        $prompt = "You are a helpful assistant on Prince Caleb's developer portfolio site. "
            . "A visitor asked: \"$message\"\n\nAvailable case studies:\n$catalog\n\n"
            . "In 2-3 sentences, recommend the most relevant case study/service and briefly say why. "
            . "If nothing matches well, suggest they use the contact form to discuss their project.";

        return AiText::generate($prompt, null, 10);
    }

    private static function keywordFallback(string $message, array $projects): string
    {
        $needle = strtolower($message);
        $best = null;
        $bestScore = 0;

        foreach ($projects as $project) {
            $haystack = strtolower($project['title'] . ' ' . $project['summary'] . ' ' . $project['tag_names']);
            $score = 0;
            foreach (preg_split('/\W+/', $needle) as $word) {
                if (strlen($word) > 2 && str_contains($haystack, $word)) {
                    $score++;
                }
            }
            if ($score > $bestScore) {
                $bestScore = $score;
                $best = $project;
            }
        }

        if ($best) {
            return "Based on what you described, \"{$best['title']}\" looks most relevant — {$best['summary']} "
                . "Feel free to use the contact form to discuss your project in more detail.";
        }

        return "I couldn't find a close match in the case studies, but I'd love to hear more — "
            . "please use the contact form and describe what you're building.";
    }
}
