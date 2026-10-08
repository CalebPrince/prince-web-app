<?php

declare(strict_types=1);

// Command-line twin of Admin -> Settings -> Messaging -> WhatsApp display
// name (both use WhatsAppDisplayNameManager). Changes the display name of
// Lisa's Twilio sender through Twilio's Senders API, which submits it to Meta
// for review and applies it once approved.
//
// Run it on the server, from the app root:
//   php database/update_whatsapp_display_name.php
//       Read-only: the current name and any change in review.
//   php database/update_whatsapp_display_name.php --apply ["Another Name"]
//       Submits "Lisa - Prince Caleb Support" (or the given name).

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\WhatsAppDisplayNameManager;

function show(array $s): void
{
    echo "  sender:       {$s['sender']} ({$s['sender_status']})\n";
    echo "  display name: " . ($s['name'] !== '' ? $s['name'] : '(not reported)') . "\n";
    if ($s['pending_name'] !== '') {
        echo "  latest change: {$s['pending_name']} [{$s['pending_status']}, {$s['pending_status_date']}]\n";
    }
    if ($s['messaging_limit'] !== '' || $s['quality_rating'] !== '') {
        echo "  limit/quality: {$s['messaging_limit']} / {$s['quality_rating']}\n";
    }
}

$apply = in_array('--apply', $argv, true);
$nameArgs = array_values(array_filter(array_slice($argv, 1), static fn ($a) => $a !== '--apply'));
$name = trim($nameArgs[0] ?? WhatsAppDisplayNameManager::SUGGESTED_NAME);

try {
    if (!$apply) {
        show(WhatsAppDisplayNameManager::status());
        echo "\nRead-only. To submit \"{$name}\" for Meta review, re-run with --apply.\n";
        exit(0);
    }
    $after = WhatsAppDisplayNameManager::submit($name);
    echo "Submitted \"{$name}\" (Twilio: {$after['submission']}). Sender now reports:\n";
    show($after);
} catch (\Throwable $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}
