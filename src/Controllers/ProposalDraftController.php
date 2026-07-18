<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Database;
use App\Support\Response;

/**
 * Admin review side of proposal_drafts — the queue Lisa's book_appointment
 * tool feeds and database/draft_proposals_from_bookings.php fills in.
 * Mirrors ContentStudioController's split from the agent that writes to it:
 * this controller only ever reads the queue or removes a row from it. A row
 * is removed either because Caleb dismissed it, or because he opened it for
 * review — reviewing pre-fills the real Create Proposal form, but nothing
 * here ever inserts into `proposals` itself; that still only happens via
 * ProposalController::store(), same as every other path to a real proposal.
 */
class ProposalDraftController
{
    /** GET /api/v1/admin/proposal-drafts */
    public static function index(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query(
            "SELECT * FROM proposal_drafts WHERE status IN ('queued', 'drafted', 'failed') ORDER BY created_at DESC LIMIT 20"
        )->fetchAll(\PDO::FETCH_ASSOC);

        $rows = array_map(static function (array $row): array {
            $row['milestones'] = $row['milestones_json'] ? json_decode((string) $row['milestones_json'], true) : [];
            unset($row['milestones_json'], $row['transcript_json']);
            return $row;
        }, $rows);

        Response::json($rows);
    }

    /** DELETE /api/v1/admin/proposal-drafts/{id} — dismiss, or clear after review. */
    public static function destroy(array $params): void
    {
        AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);
        $pdo = Database::get();
        $stmt = $pdo->prepare('DELETE FROM proposal_drafts WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            Response::error('Draft not found.', 404);
        }
        Response::json(['status' => 'deleted']);
    }
}
