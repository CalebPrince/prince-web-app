<?php

declare(strict_types=1);

// Auto-sends any drafted-but-unsent newsletters to all subscribers. Run on a
// cron after draft_newsletters_from_blog.php (which turns queued blog posts
// into AI-written drafts). Each draft is sent once — deliverDraft() stamps
// sent_at, and this query only picks up rows where sent_at IS NULL, so retries
// and overlapping runs can't double-send. The admin "Send to subscribers"
// button shares the same delivery path; whichever fires first wins and the
// other simply finds nothing to send.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Controllers\NewsletterController;
use App\Support\Database;

$pdo = Database::get();

$due = $pdo->query(
    "SELECT * FROM newsletter_drafts
     WHERE status = 'drafted'
       AND sent_at IS NULL
       AND subject_line IS NOT NULL AND subject_line != ''
       AND email_body IS NOT NULL AND email_body != ''
     ORDER BY id ASC"
)->fetchAll();

$newsletters = 0;
$recipients = 0;
foreach ($due as $draft) {
    $recipients += NewsletterController::deliverDraft($draft, $pdo);
    $newsletters++;
}

echo "{$newsletters} newsletter(s) sent to {$recipients} subscriber(s) total.\n";
