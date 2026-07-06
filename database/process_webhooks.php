<?php

declare(strict_types=1);

// Drains pending webhook_queue rows and notifies Slack (if configured).
// Run this on a schedule (cron / Windows Task Scheduler) — never inline in a
// request, so a slow third-party API never slows down the contact form.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;
use App\Support\Mailer;
use App\Support\Settings;

require_once dirname(__DIR__) . '/config/config.php';
$config = appConfig();
$pdo = Database::get();
$slackUrl = Settings::get('slack_webhook_url');
$notifyEmail = Settings::get('notification_email') ?: Settings::get('social_email');

$pending = $pdo->query(
    "SELECT wq.id AS queue_id, i.* FROM webhook_queue wq
     JOIN inquiries i ON i.id = wq.inquiry_id
     WHERE wq.status = 'pending' AND wq.attempts < 5"
)->fetchAll();

foreach ($pending as $row) {
    // Both channels are attempted every pass; only a channel that hasn't
    // succeeded yet (or was never configured) blocks this row from
    // being marked "sent", so one flaky channel doesn't hide the other.
    $slackOk = true;
    if (!empty($slackUrl)) {
        $text = sprintf(
            "New inquiry from *%s* (%s):\n>%s",
            $row['name'],
            $row['email'],
            str_replace("\n", "\n>", $row['message'])
        );
        $ch = curl_init($slackUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode(['text' => $text]),
            CURLOPT_TIMEOUT => 10,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        $slackOk = $response !== false && $status === 200;
    }

    $emailOk = true;
    if (!empty($notifyEmail)) {
        $subject = 'New inquiry from ' . $row['name'];
        $body = "Name: {$row['name']}\nEmail: {$row['email']}\n\n{$row['message']}\n\n"
            . "— sent automatically from the princecaleb.dev contact form.";
        $emailOk = Mailer::send($notifyEmail, $subject, $body, $row['email']);
    }

    if ($slackOk && $emailOk) {
        $pdo->prepare("UPDATE webhook_queue SET status = 'sent' WHERE id = ?")->execute([$row['queue_id']]);
    } else {
        $pdo->prepare('UPDATE webhook_queue SET attempts = attempts + 1 WHERE id = ?')->execute([$row['queue_id']]);
    }
}

echo count($pending) . " inquiry notification(s) processed.\n";
