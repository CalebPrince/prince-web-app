<?php

declare(strict_types=1);

// Drains proposal_drafts rows Lisa queued the moment a discovery call was
// booked (see LiveChatController::queueProposalDraft) into a real,
// Ledger-drafted proposal — reusing ProposalAgentController::buildDraft(),
// the exact same logic behind the Proposals page's "Draft with AI" button.
// Ready for Caleb to review by the time the call happens, instead of
// starting the proposal from scratch afterward. Run this on a cron —
// there's no cadence/enabled setting to check, since it only ever has work
// when a real booking queued one; an empty queue is a harmless no-op.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Controllers\ProposalAgentController;
use App\Support\Database;

// Each row costs one AI call — bounding this keeps a burst of bookings from
// making one run take unreasonably long, same reasoning as Beacon's cap.
const MAX_PER_RUN = 10;

function buildBriefFromTranscript(array $row): string
{
    $turns = json_decode((string) $row['transcript_json'], true);
    $lines = [];
    if (is_array($turns)) {
        foreach ($turns as $turn) {
            $text = trim((string) ($turn['text'] ?? ''));
            if ($text === '') {
                continue;
            }
            $speaker = ($turn['role'] ?? '') === 'user' ? 'Visitor' : 'Lisa';
            $lines[] = "{$speaker}: {$text}";
        }
    }
    $transcriptText = $lines ? implode("\n", $lines) : '(no transcript captured)';

    return "A visitor named {$row['client_name']} just booked a discovery call"
        . (!empty($row['topic']) ? " about: {$row['topic']}" : '') . ".\n\n"
        . "Here is the live chat conversation that led to the booking:\n\n{$transcriptText}\n\n"
        . 'Draft a proposal based on what they said they need. If the conversation does not contain '
        . 'enough detail for a full scope, use reasonable placeholders and say so plainly in grounding_note.';
}

$pdo = Database::get();
$rows = $pdo->query(
    "SELECT id, client_name, client_email, topic, transcript_json FROM proposal_drafts "
    . 'WHERE status = ' . "'queued' ORDER BY created_at ASC LIMIT " . MAX_PER_RUN
)->fetchAll(\PDO::FETCH_ASSOC);

if (!$rows) {
    echo "No queued proposal drafts.\n";
    exit;
}

$drafted = 0;
$failed = 0;

foreach ($rows as $row) {
    $brief = buildBriefFromTranscript($row);
    $draft = ProposalAgentController::buildDraft(null, $brief, $pdo);

    if ($draft === null) {
        $pdo->prepare("UPDATE proposal_drafts SET status = 'failed', error_note = ? WHERE id = ?")
            ->execute(['Could not generate a draft — check that an AI provider is configured and reachable.', $row['id']]);
        $failed++;
        continue;
    }

    // The booking already carries a real, validated name/email — never trust
    // the model's echo of contact details over what the visitor actually
    // typed into the booking tool.
    $pdo->prepare(
        "UPDATE proposal_drafts SET status = 'drafted', title = ?, scope = ?, timeline = ?, terms = ?,
         currency = ?, milestones_json = ?, grounding_source = ?, grounding_note = ?, drafted_at = datetime('now')
         WHERE id = ?"
    )->execute([
        $draft['title'],
        $draft['scope'],
        $draft['timeline'],
        $draft['terms'],
        $draft['currency'],
        json_encode($draft['milestones']),
        $draft['grounding_source'],
        $draft['grounding_note'],
        $row['id'],
    ]);
    $drafted++;
}

echo "Drafted {$drafted}, failed {$failed}.\n";
