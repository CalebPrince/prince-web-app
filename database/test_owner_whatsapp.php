<?php

declare(strict_types=1);

// Controlled production smoke test for the two owner-WhatsApp notification
// paths. CLI-only so it cannot be triggered from the public website.

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Agents\Chief;
use App\Support\Database;
use App\Support\WhatsAppNotifier;

$mode = strtolower(trim((string) ($argv[1] ?? 'all')));
if (!in_array($mode, ['all', 'lisa', 'chief'], true)) {
    fwrite(STDERR, "Usage: php database/test_owner_whatsapp.php [all|lisa|chief]\n");
    exit(2);
}

$failed = false;
if (!WhatsAppNotifier::isOwnerConfigured()) {
    fwrite(STDERR, "Owner WhatsApp is not fully configured in Admin Settings.\n");
    exit(1);
}

if ($mode === 'all' || $mode === 'lisa') {
    $sent = WhatsAppNotifier::sendOwnerAlert(
        "🧪 *DEMO — Lisa handoff alert*\n\n"
        . "Name: Ama Mensah\n"
        . "Email: ama.demo@example.com\n"
        . "Phone: +233 20 000 0000\n"
        . "Request: Wants an AI receptionist for a clinic to answer calls, book appointments, and hand urgent cases to staff.\n"
        . "Reason: Asked to speak directly with Prince Caleb about implementation.\n\n"
        . "This is a controlled test; no real visitor is waiting.\n"
        . "Admin Inbox: https://princecaleb.dev/admin/inbox.html"
    );
    echo $sent
        ? "Lisa demo WhatsApp accepted by Twilio.\n"
        : "Lisa demo WhatsApp failed; check the PHP error log and Twilio Messaging logs.\n";
    $failed = $failed || !$sent;
}

if ($mode === 'all' || $mode === 'chief') {
    $pdo = Database::get();
    $today = (string) $pdo->query("SELECT date('now')")->fetchColumn();
    $brief = Chief::generateBrief($pdo, 24, $today);
    if (!$brief) {
        echo "Chief demo failed: the daily brief could not be generated.\n";
        $failed = true;
    } else {
        // Re-open only the WhatsApp channel for this deliberate smoke test.
        // The email timestamp is preserved, so testing WhatsApp cannot resend
        // today's email.
        $pdo->prepare('UPDATE agent_daily_briefs SET whatsapp_sent_at = NULL WHERE id = ?')
            ->execute([$brief['id']]);
        $brief['whatsapp_sent_at'] = null;
        // This smoke test targets WhatsApp only, even if today's scheduled
        // email has not run yet.
        $brief['emailed_at'] = $brief['emailed_at'] ?: 'test-email-suppressed';
        $sent = Chief::emailBrief($pdo, $brief);
        echo $sent
            ? "Chief demo WhatsApp accepted by Twilio.\n"
            : "Chief demo has a failed notification channel; check the PHP error log and Twilio Messaging logs.\n";
        $failed = $failed || !$sent;
    }
}

exit($failed ? 1 : 0);
