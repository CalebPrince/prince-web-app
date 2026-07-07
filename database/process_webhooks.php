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
    "SELECT wq.id AS queue_id, wq.slack_sent, wq.email_sent, wq.attempts, i.* FROM webhook_queue wq
     JOIN inquiries i ON i.id = wq.inquiry_id
     WHERE wq.status = 'pending' AND wq.attempts < 5"
)->fetchAll();

foreach ($pending as $row) {
    // Each channel remembers its own success, so a channel that already
    // delivered is never retried just because a different, flaky channel
    // (e.g. a bad Slack webhook URL) keeps failing on the same row.
    $slackDone = !empty($row['slack_sent']) || empty($slackUrl);
    $emailDone = !empty($row['email_sent']) || empty($notifyEmail);

    $isProjectRequest = ($row['type'] ?? 'contact') === 'project_request';
    $attachments = $isProjectRequest && $row['attachments'] ? (json_decode($row['attachments'], true) ?: []) : [];
    $attachmentLines = $attachments
        ? "Attachments:\n" . implode("\n", array_map(fn ($p) => 'https://princecaleb.dev' . $p, $attachments)) . "\n\n"
        : '';
    $detailLines = $isProjectRequest ? sprintf(
        "Project type: %s\nBudget: %s\nTimeline: %s\nFeatures: %s\n\n%s",
        $row['project_type'] ?: '—',
        $row['budget'] ?: '—',
        $row['timeline'] ?: '—',
        $row['features'] ?: '—',
        $attachmentLines
    ) : '';

    if (!$slackDone) {
        $heading = $isProjectRequest ? 'New *project request*' : 'New inquiry';
        $text = sprintf(
            "%s from *%s* (%s):\n%s>%s",
            $heading,
            $row['name'],
            $row['email'],
            $detailLines !== '' ? '>' . str_replace("\n", "\n>", rtrim($detailLines)) . "\n" : '',
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
        $slackDone = $response !== false && $status === 200;
    }

    if (!$emailDone) {
        $subject = ($isProjectRequest ? 'New project request from ' : 'New inquiry from ') . $row['name'];
        $body = "Name: {$row['name']}\nEmail: {$row['email']}\n\n{$detailLines}{$row['message']}\n\n"
            . "— sent automatically from the princecaleb.dev "
            . ($isProjectRequest ? 'project request form.' : 'contact form.');
        $emailDone = Mailer::send($notifyEmail, $subject, $body, $row['email']);
    }

    if ($slackDone && $emailDone) {
        $pdo->prepare("UPDATE webhook_queue SET status = 'sent', slack_sent = 1, email_sent = 1 WHERE id = ?")
            ->execute([$row['queue_id']]);
    } else {
        $newAttempts = $row['attempts'] + 1;
        $newStatus = $newAttempts >= 5 ? 'failed' : 'pending';
        $pdo->prepare(
            'UPDATE webhook_queue SET status = ?, attempts = ?, slack_sent = ?, email_sent = ? WHERE id = ?'
        )->execute([$newStatus, $newAttempts, (int) $slackDone, (int) $emailDone, $row['queue_id']]);
    }
}

echo count($pending) . " inquiry notification(s) processed.\n";
