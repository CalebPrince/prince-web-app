<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use App\Controllers\NurturerController;
use App\Support\Database;

$pdo = Database::get();
$rows = $pdo->query("SELECT * FROM newsletter_drafts WHERE status = 'queued' ORDER BY id ASC LIMIT 10")->fetchAll();
$drafted = 0;
foreach ($rows as $row) {
    $draft = NurturerController::generateNewsletterUpdate($row['article_title'], $row['article_excerpt'], $row['article_url']);
    if ($draft === null) {
        $pdo->prepare("UPDATE newsletter_drafts SET status='failed', error_note=? WHERE id=?")
            ->execute(['AI provider did not return a valid newsletter draft.', $row['id']]);
        continue;
    }
    $pdo->prepare("UPDATE newsletter_drafts SET status='drafted', subject_line=?, email_body=?, drafted_at=datetime('now'), error_note=NULL WHERE id=?")
        ->execute([$draft['subject_line'], $draft['email_body'], $row['id']]);
    $drafted++;
}
echo $drafted . " newsletter draft(s) created.\n";
