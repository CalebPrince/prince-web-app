<?php

declare(strict_types=1);

// Generates the homepage hero eyebrow/title/subtitle for today's calendar
// date, once. Run this daily via cron — it's idempotent (UNIQUE on
// headline_date), so an extra run on the same day is a harmless no-op, and a
// missed run just means yesterday's row (or the static Site Content
// fallback) keeps serving until the next successful one lands.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\AiText;
use App\Support\Database;

$today = gmdate('Y-m-d');
$pdo = Database::get();

$existing = $pdo->prepare('SELECT id FROM daily_headlines WHERE headline_date = ?');
$existing->execute([$today]);
if ($existing->fetchColumn() !== false) {
    echo "Headline for {$today} already generated.\n";
    exit;
}

$systemInstruction = <<<SYS
You write one hero headline set per day for the homepage of Prince Caleb, a
website designer and developer in Accra with 12+ years shipping production web
and mobile software. His work, in order of prominence: (1) custom website
design and development, including business sites, landing pages, redesigns and
online stores, (2) web and mobile applications, (3) AI voice agents, chat
assistants and workflow automations. His clients are businesses that need a
website that earns trust and brings in enquiries, and that lose revenue to
missed calls and slow follow-up.

Never use an em dash (the long dash character) anywhere in the output. Use a comma, a colon, or a
full stop instead. This applies to every field.

Every day, write a NEW headline set that is specific to this business (not
generic agency copy) and outcome-focused: it should name a concrete
business result (booked jobs, filled calendars, faster response, fewer missed
calls), not just describe the technology. Vary the angle day to day (website
design, a redesign, an application, voice agents, chat or automation), but
always tie back to enquiries won, revenue or time saved. Lead with website
work more often than not.

Reply with ONLY a JSON object, no markdown fences, no commentary, in this
exact shape:
{"eyebrow": "// short one-line hook, under 60 characters, starting with //",
 "title": "a short, punchy headline phrase, under 55 characters total, not a full sentence, wrapping the single most important outcome word or phrase in **double asterisks**",
 "subtitle": "one to two sentences, under 200 characters, expanding on how the outcome is delivered"}
SYS;

$prompt = "Today's date is {$today}. Write today's unique hero headline set for princecaleb.dev following the system instructions exactly.";

$result = AiText::generateWithProvider($prompt, $systemInstruction, 25);
if ($result === null) {
    echo "Headline generation failed — no AI provider configured or reachable.\n";
    exit;
}

$raw = trim($result['text']);
// Strip ```json ... ``` fences if the model added them despite instructions.
$raw = preg_replace('/^```(?:json)?\s*|\s*```$/', '', $raw);
$decoded = json_decode((string) $raw, true);

$eyebrow = trim((string) ($decoded['eyebrow'] ?? ''));
$title = trim((string) ($decoded['title'] ?? ''));
$subtitle = trim((string) ($decoded['subtitle'] ?? ''));

if ($eyebrow === '' || $title === '' || $subtitle === '') {
    error_log('generate_daily_headline: unusable AI response: ' . substr($raw, 0, 500));
    echo "Headline generation returned an unusable response — check error log.\n";
    exit;
}

$stmt = $pdo->prepare(
    'INSERT INTO daily_headlines (headline_date, eyebrow, title, subtitle, ai_provider)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(headline_date) DO UPDATE SET
        eyebrow = excluded.eyebrow, title = excluded.title, subtitle = excluded.subtitle,
        ai_provider = excluded.ai_provider, generated_at = datetime(\'now\')'
);
$stmt->execute([$today, $eyebrow, $title, $subtitle, $result['provider']]);

echo "Headline for {$today} generated via {$result['provider']}: {$title}\n";
