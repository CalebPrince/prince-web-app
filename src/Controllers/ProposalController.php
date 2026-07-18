<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\Automations;
use App\Support\Database;
use App\Support\EmailTemplate;
use App\Support\Mailer;
use App\Support\MakeWebhook;
use App\Support\Response;
use App\Support\Settings;

class ProposalController
{
    /**
     * DELETE /api/v1/admin/proposals/{id} — also removes its milestones
     * (ON DELETE CASCADE). The payment_links a milestone generated, and any
     * real payments.rows they were paid through, are untouched — a deleted
     * proposal removes the scope/terms document, never the payment ledger.
     */
    public static function destroy(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT title FROM proposals WHERE id = ?');
        $stmt->execute([$id]);
        $title = $stmt->fetchColumn();
        if ($title === false) {
            Response::error('Proposal not found.', 404);
        }

        $pdo->prepare('DELETE FROM proposals WHERE id = ?')->execute([$id]);
        ActivityLog::log($user, 'deleted', 'proposal', $id, $title ?: null);
        Response::json(['status' => 'deleted']);
    }

    /** GET /api/v1/admin/proposals */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query(
            "SELECT p.*, i.project_type, i.budget, i.timeline AS requested_timeline,
                    COUNT(pm.id) AS milestone_count,
                    SUM(CASE WHEN pl.status = 'paid' THEN 1 ELSE 0 END) AS paid_milestone_count
             FROM proposals p
             LEFT JOIN inquiries i ON i.id = p.inquiry_id
             LEFT JOIN proposal_milestones pm ON pm.proposal_id = p.id
             LEFT JOIN payment_links pl ON pl.id = pm.payment_link_id
             GROUP BY p.id
             ORDER BY p.created_at DESC"
        )->fetchAll();

        Response::json($rows);
    }

    /** POST /api/v1/admin/proposals/{id}/send */
    public static function send(array $params): void
    {
        AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);
        if ($id <= 0) {
            Response::error('Proposal not found.', 404);
        }

        $stmt = Database::get()->prepare('SELECT * FROM proposals WHERE id = ?');
        $stmt->execute([$id]);
        $proposal = $stmt->fetch();
        if (!$proposal) {
            Response::error('Proposal not found.', 404);
        }

        $url = self::absoluteUrl('/proposal.html?token=' . $proposal['token']);
        $message = EmailTemplate::render('proposal_send', [
            'client_name' => $proposal['client_name'],
            'client_email' => $proposal['client_email'],
            'proposal_title' => $proposal['title'],
            'proposal_url' => $url,
        ], EmailTemplate::defaults()['proposal_send']);
        $sent = Mailer::sendHtml($proposal['client_email'], $message['subject'], $message['html'], $message['text']);

        if (false) $sent = Mailer::send(
            $proposal['client_email'],
            'Your project proposal is ready',
            "Hi {$proposal['client_name']},\n\n"
                . "Your project proposal is ready for review:\n\n{$url}\n\n"
                . "Please open the link to review the scope, timeline, terms, and payment milestones. "
                . "Once you accept the proposal, the payment buttons will unlock for the agreed milestones.\n\n"
                . "If anything needs adjusting, just reply to this email.\n\n"
                . "Prince Caleb"
        );

        if (!$sent) {
            Response::error('Could not send the proposal email. Please copy the link and send it manually.', 500);
        }

        Automations::fire('proposal_sent', (string) $proposal['client_email'], [
            'name' => $proposal['client_name'] ?: null,
            'last_action' => 'Was sent the "' . $proposal['title'] . '" proposal',
        ]);

        Response::json(['status' => 'sent', 'url' => $url]);
    }

    /** GET /api/v1/admin/proposals/{id} */
    public static function adminShow(array $params): void
    {
        AuthMiddleware::requireAuth();
        $proposal = self::findProposalById((int) ($params['id'] ?? 0));
        if (!$proposal) {
            Response::error('Proposal not found.', 404);
        }

        Response::json($proposal);
    }

    /** GET /api/v1/admin/proposals/quote-requests */
    public static function quoteRequests(): void
    {
        AuthMiddleware::requireAuth();
        $rows = Database::get()->query(
            "SELECT id, name, email, message, project_type, budget, timeline, features, created_at
             FROM inquiries
             WHERE type = 'project_request'
             ORDER BY created_at DESC
             LIMIT 100"
        )->fetchAll();

        Response::json($rows);
    }

    /** POST /api/v1/admin/proposals */
    public static function store(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $clientName = trim((string) ($data['client_name'] ?? ''));
        $clientEmail = trim((string) ($data['client_email'] ?? ''));
        $title = trim((string) ($data['title'] ?? ''));
        $scope = trim((string) ($data['scope'] ?? ''));
        $timeline = trim((string) ($data['timeline'] ?? ''));
        $terms = trim((string) ($data['terms'] ?? ''));
        $currency = strtoupper(trim((string) ($data['currency'] ?? ''))) ?: (Settings::get('pricing_currency') ?: 'GHS');
        $milestones = is_array($data['milestones'] ?? null) ? $data['milestones'] : [];
        $inquiryId = !empty($data['inquiry_id']) ? (int) $data['inquiry_id'] : null;

        $errors = [];
        if ($clientName === '') $errors[] = 'Client name is required.';
        if (!filter_var($clientEmail, FILTER_VALIDATE_EMAIL)) $errors[] = 'A valid client email is required.';
        if ($title === '') $errors[] = 'Proposal title is required.';
        if ($scope === '') $errors[] = 'Scope is required.';
        if (!in_array($currency, ['GHS', 'NGN', 'USD', 'ZAR'], true)) $errors[] = 'Currency is not supported.';
        if (!$milestones) $errors[] = 'Add at least one payment milestone.';

        $cleanMilestones = [];
        $totalAmount = 0;
        foreach ($milestones as $idx => $milestone) {
            $milestoneTitle = trim((string) ($milestone['title'] ?? ''));
            $amount = (float) ($milestone['amount'] ?? 0);
            $dueNote = trim((string) ($milestone['due_note'] ?? ''));
            if ($milestoneTitle === '' && $amount <= 0) {
                continue;
            }
            if ($milestoneTitle === '') {
                $errors[] = 'Each milestone needs a title.';
            }
            if ($amount <= 0) {
                $errors[] = 'Each milestone amount must be greater than zero.';
            }
            $subunits = (int) round($amount * 100);
            $totalAmount += $subunits;
            $cleanMilestones[] = [
                'title' => $milestoneTitle,
                'amount' => $subunits,
                'due_note' => $dueNote,
                'sort_order' => $idx,
            ];
        }

        if ($errors) {
            Response::json(['errors' => array_values(array_unique($errors))], 422);
        }

        $pdo = Database::get();
        $token = bin2hex(random_bytes(16));

        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                'INSERT INTO proposals (token, inquiry_id, client_name, client_email, title, scope, timeline, total_amount, currency, terms, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $token,
                $inquiryId,
                $clientName,
                $clientEmail,
                $title,
                $scope,
                $timeline ?: null,
                $totalAmount,
                $currency,
                $terms ?: null,
                'sent',
            ]);
            $proposalId = (int) $pdo->lastInsertId();

            foreach ($cleanMilestones as $milestone) {
                $linkToken = bin2hex(random_bytes(12));
                $description = "{$title} - {$milestone['title']}";
                $pdo->prepare(
                    'INSERT INTO payment_links (token, client_name, client_email, amount, currency, description)
                     VALUES (?, ?, ?, ?, ?, ?)'
                )->execute([$linkToken, $clientName, $clientEmail, $milestone['amount'], $currency, $description]);
                $paymentLinkId = (int) $pdo->lastInsertId();

                $pdo->prepare(
                    'INSERT INTO proposal_milestones (proposal_id, payment_link_id, title, amount, currency, due_note, sort_order)
                     VALUES (?, ?, ?, ?, ?, ?, ?)'
                )->execute([
                    $proposalId,
                    $paymentLinkId,
                    $milestone['title'],
                    $milestone['amount'],
                    $currency,
                    $milestone['due_note'] ?: null,
                    $milestone['sort_order'],
                ]);
            }

            if ($inquiryId) {
                $pdo->prepare("UPDATE inquiries SET status = 'read', pipeline_stage = 'proposal_sent' WHERE id = ?")
                    ->execute([$inquiryId]);
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            error_log('ProposalController::store failed: ' . $e->getMessage());
            Response::error('Could not create proposal.', 500);
        }

        Response::json([
            'id' => $proposalId,
            'token' => $token,
            'url' => '/proposal.html?token=' . $token,
        ], 201);
    }

    /** PUT /api/v1/admin/proposals/{id} */
    public static function update(array $params): void
    {
        AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);
        $existing = self::findProposalById($id);
        if (!$existing) {
            Response::error('Proposal not found.', 404);
        }
        if ($existing['status'] === 'accepted') {
            Response::error('Accepted proposals cannot be edited.', 422);
        }

        $paidCount = 0;
        foreach ($existing['milestones'] as $milestone) {
            if (($milestone['payment_status'] ?? '') === 'paid') {
                $paidCount++;
            }
        }
        if ($paidCount > 0) {
            Response::error('Proposals with paid milestones cannot be edited.', 422);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $clientName = trim((string) ($data['client_name'] ?? ''));
        $clientEmail = trim((string) ($data['client_email'] ?? ''));
        $title = trim((string) ($data['title'] ?? ''));
        $scope = trim((string) ($data['scope'] ?? ''));
        $timeline = trim((string) ($data['timeline'] ?? ''));
        $terms = trim((string) ($data['terms'] ?? ''));
        $currency = strtoupper(trim((string) ($data['currency'] ?? ''))) ?: (Settings::get('pricing_currency') ?: 'GHS');
        $milestones = is_array($data['milestones'] ?? null) ? $data['milestones'] : [];
        $inquiryId = !empty($data['inquiry_id']) ? (int) $data['inquiry_id'] : null;

        $errors = [];
        if ($clientName === '') $errors[] = 'Client name is required.';
        if (!filter_var($clientEmail, FILTER_VALIDATE_EMAIL)) $errors[] = 'A valid client email is required.';
        if ($title === '') $errors[] = 'Proposal title is required.';
        if ($scope === '') $errors[] = 'Scope is required.';
        if (!in_array($currency, ['GHS', 'NGN', 'USD', 'ZAR'], true)) $errors[] = 'Currency is not supported.';
        if (!$milestones) $errors[] = 'Add at least one payment milestone.';

        $cleanMilestones = [];
        $totalAmount = 0;
        foreach ($milestones as $idx => $milestone) {
            $milestoneTitle = trim((string) ($milestone['title'] ?? ''));
            $amount = (float) ($milestone['amount'] ?? 0);
            $dueNote = trim((string) ($milestone['due_note'] ?? ''));
            if ($milestoneTitle === '' && $amount <= 0) {
                continue;
            }
            if ($milestoneTitle === '') {
                $errors[] = 'Each milestone needs a title.';
            }
            if ($amount <= 0) {
                $errors[] = 'Each milestone amount must be greater than zero.';
            }
            $subunits = (int) round($amount * 100);
            $totalAmount += $subunits;
            $cleanMilestones[] = [
                'title' => $milestoneTitle,
                'amount' => $subunits,
                'due_note' => $dueNote,
                'sort_order' => $idx,
            ];
        }

        if ($errors) {
            Response::json(['errors' => array_values(array_unique($errors))], 422);
        }

        $pdo = Database::get();
        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                "UPDATE proposals SET inquiry_id = ?, client_name = ?, client_email = ?, title = ?, scope = ?,
                 timeline = ?, total_amount = ?, currency = ?, terms = ?, updated_at = datetime('now') WHERE id = ?"
            )->execute([
                $inquiryId,
                $clientName,
                $clientEmail,
                $title,
                $scope,
                $timeline ?: null,
                $totalAmount,
                $currency,
                $terms ?: null,
                $id,
            ]);

            $linkIds = array_filter(array_map(
                fn ($milestone) => !empty($milestone['payment_link_id']) ? (int) $milestone['payment_link_id'] : null,
                $existing['milestones']
            ));
            $pdo->prepare('DELETE FROM proposal_milestones WHERE proposal_id = ?')->execute([$id]);
            foreach ($linkIds as $linkId) {
                $pdo->prepare("DELETE FROM payment_links WHERE id = ? AND status != 'paid'")->execute([$linkId]);
            }

            foreach ($cleanMilestones as $milestone) {
                $linkToken = bin2hex(random_bytes(12));
                $description = "{$title} - {$milestone['title']}";
                $pdo->prepare(
                    'INSERT INTO payment_links (token, client_name, client_email, amount, currency, description)
                     VALUES (?, ?, ?, ?, ?, ?)'
                )->execute([$linkToken, $clientName, $clientEmail, $milestone['amount'], $currency, $description]);
                $paymentLinkId = (int) $pdo->lastInsertId();

                $pdo->prepare(
                    'INSERT INTO proposal_milestones (proposal_id, payment_link_id, title, amount, currency, due_note, sort_order)
                     VALUES (?, ?, ?, ?, ?, ?, ?)'
                )->execute([
                    $id,
                    $paymentLinkId,
                    $milestone['title'],
                    $milestone['amount'],
                    $currency,
                    $milestone['due_note'] ?: null,
                    $milestone['sort_order'],
                ]);
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            error_log('ProposalController::update failed: ' . $e->getMessage());
            Response::error('Could not update proposal.', 500);
        }

        Response::json(['status' => 'updated', 'url' => '/proposal.html?token=' . $existing['token']]);
    }

    /** GET /api/v1/proposals/{token} */
    public static function show(array $params): void
    {
        $proposal = self::findProposal($params['token'] ?? '');
        if (!$proposal) {
            Response::error('Proposal not found.', 404);
        }

        Response::json($proposal);
    }

    /** POST /api/v1/proposals/{token}/accept — body: {accepted_by_name} */
    public static function accept(array $params): void
    {
        $proposal = self::findProposal($params['token'] ?? '');
        if (!$proposal) {
            Response::error('Proposal not found.', 404);
        }
        if ($proposal['status'] === 'declined') {
            Response::error('This proposal is no longer available.', 422);
        }
        if ($proposal['status'] === 'accepted') {
            Response::error('This proposal has already been accepted.', 422);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $acceptedByName = trim((string) ($data['accepted_by_name'] ?? ''));
        if ($acceptedByName === '') {
            Response::error('Please type your name to confirm acceptance.', 422);
        }

        $pdo = Database::get();
        $pdo->prepare(
            "UPDATE proposals SET status = 'accepted', accepted_at = datetime('now'), updated_at = datetime('now'),
             accepted_by_name = ?, accepted_ip = ?, accepted_user_agent = ? WHERE token = ?"
        )->execute([
            $acceptedByName,
            $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            $_SERVER['HTTP_USER_AGENT'] ?? null,
            $params['token'],
        ]);

        if ($proposal['inquiry_id']) {
            $pdo->prepare("UPDATE inquiries SET pipeline_stage = 'won' WHERE id = ?")->execute([$proposal['inquiry_id']]);
        }

        MakeWebhook::send('proposal_accepted', [
            'client_name' => $acceptedByName,
            'client_email' => $proposal['client_email'],
            'proposal_title' => $proposal['title'],
            'total_amount' => $proposal['total_amount'] / 100,
            'currency' => $proposal['currency'],
        ]);

        Response::json(['status' => 'accepted']);
    }

    private static function findProposal(string $token): array|false
    {
        if ($token === '') {
            return false;
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM proposals WHERE token = ?');
        $stmt->execute([$token]);
        $proposal = $stmt->fetch();
        if (!$proposal) {
            return false;
        }

        $stmt = $pdo->prepare(
            "SELECT pm.*, pl.token AS payment_token, pl.status AS payment_status
             FROM proposal_milestones pm
             LEFT JOIN payment_links pl ON pl.id = pm.payment_link_id
             WHERE pm.proposal_id = ?
             ORDER BY pm.sort_order, pm.id"
        );
        $stmt->execute([$proposal['id']]);
        $milestones = $stmt->fetchAll();
        foreach ($milestones as &$milestone) {
            $milestone['payment_url'] = $milestone['payment_token'] ? '/pay.html?token=' . $milestone['payment_token'] : null;
        }
        unset($milestone);

        $proposal['milestones'] = $milestones;
        return $proposal;
    }

    private static function findProposalById(int $id): array|false
    {
        if ($id <= 0) {
            return false;
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM proposals WHERE id = ?');
        $stmt->execute([$id]);
        $proposal = $stmt->fetch();
        if (!$proposal) {
            return false;
        }

        $stmt = $pdo->prepare(
            "SELECT pm.*, pl.token AS payment_token, pl.status AS payment_status
             FROM proposal_milestones pm
             LEFT JOIN payment_links pl ON pl.id = pm.payment_link_id
             WHERE pm.proposal_id = ?
             ORDER BY pm.sort_order, pm.id"
        );
        $stmt->execute([$proposal['id']]);
        $proposal['milestones'] = $stmt->fetchAll();

        return $proposal;
    }

    private static function absoluteUrl(string $path): string
    {
        $host = $_SERVER['HTTP_HOST'] ?? 'princecaleb.dev';
        $forwardedProto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || $forwardedProto === 'https' ? 'https' : 'http';
        if ($host === 'princecaleb.dev' || str_ends_with($host, '.princecaleb.dev')) {
            $scheme = 'https';
        }

        return $scheme . '://' . $host . $path;
    }
}
