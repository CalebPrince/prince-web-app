<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\Database;
use App\Support\EmailTemplate;
use App\Support\Mailer;
use App\Support\Response;

/**
 * Invoices follow the payments convention: item amounts are stored in the
 * smallest currency unit as integers, and an invoice's total is always the
 * sum of its items — never stored, so it can't drift. Sending an invoice
 * mints a payment link for the total; when that link is paid (verified in
 * PaymentController) the invoice flips to paid and the client gets a
 * receipt automatically.
 */
class InvoiceController
{
    /** GET /api/v1/admin/invoices */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query(
            'SELECT i.*, COALESCE(SUM(ii.quantity * ii.unit_amount), 0) AS total,
                    pl.token AS payment_token, pl.status AS payment_status
             FROM invoices i
             LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
             LEFT JOIN payment_links pl ON pl.id = i.payment_link_id
             GROUP BY i.id
             ORDER BY i.created_at DESC'
        )->fetchAll();

        foreach ($rows as &$row) {
            $row['total'] = (int) round((float) $row['total']);
        }
        unset($row);

        Response::json($rows);
    }

    /** GET /api/v1/admin/invoices/{id} */
    public static function adminShow(array $params): void
    {
        AuthMiddleware::requireAuth();
        $invoice = self::findWithItems('id', (int) $params['id']);
        if (!$invoice) {
            Response::error('Invoice not found.', 404);
        }
        Response::json($invoice);
    }

    /** POST /api/v1/admin/invoices — body: {client_name, client_email, currency?, issue_date?, due_date?, notes?, items: [{description, quantity, unit_price}]} */
    public static function store(): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        [$fields, $items, $errors] = self::validate($data);
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        $pdo = Database::get();
        $invoiceNumber = self::nextInvoiceNumber($pdo);
        $token = bin2hex(random_bytes(12));

        $pdo->prepare(
            'INSERT INTO invoices (invoice_number, token, client_id, client_name, client_email, currency, issue_date, due_date, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $invoiceNumber,
            $token,
            $fields['client_id'],
            $fields['client_name'],
            $fields['client_email'],
            $fields['currency'],
            $fields['issue_date'],
            $fields['due_date'],
            $fields['notes'],
        ]);
        $invoiceId = (int) $pdo->lastInsertId();
        self::replaceItems($pdo, $invoiceId, $items);

        ActivityLog::log($user, 'created', 'invoice', (string) $invoiceId, $invoiceNumber, [
            'client' => $fields['client_name'],
        ]);

        Response::json(self::findWithItems('id', $invoiceId), 201);
    }

    /** PUT /api/v1/admin/invoices/{id} — same body as store; drafts and sent invoices only */
    public static function update(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $invoice = self::findRow('id', (int) $params['id']);
        if (!$invoice) {
            Response::error('Invoice not found.', 404);
        }
        if (in_array($invoice['status'], ['paid', 'void'], true)) {
            Response::error('Paid or voided invoices cannot be edited.', 422);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        [$fields, $items, $errors] = self::validate($data);
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        $pdo = Database::get();
        $pdo->prepare(
            "UPDATE invoices SET client_id = ?, client_name = ?, client_email = ?, currency = ?,
             issue_date = ?, due_date = ?, notes = ?, updated_at = datetime('now') WHERE id = ?"
        )->execute([
            $fields['client_id'],
            $fields['client_name'],
            $fields['client_email'],
            $fields['currency'],
            $fields['issue_date'],
            $fields['due_date'],
            $fields['notes'],
            $invoice['id'],
        ]);
        self::replaceItems($pdo, (int) $invoice['id'], $items);

        ActivityLog::log($user, 'updated', 'invoice', (string) $invoice['id'], $invoice['invoice_number']);

        Response::json(self::findWithItems('id', (int) $invoice['id']));
    }

    /** PATCH /api/v1/admin/invoices/{id} — body: {status: 'paid'|'void'} for manual settlement */
    public static function updateStatus(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $invoice = self::findRow('id', (int) $params['id']);
        if (!$invoice) {
            Response::error('Invoice not found.', 404);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $status = $data['status'] ?? '';
        if (!in_array($status, ['paid', 'void'], true)) {
            Response::error('Status must be paid or void.', 422);
        }
        if ($invoice['status'] === 'paid' && $status === 'void') {
            Response::error('A paid invoice cannot be voided.', 422);
        }

        $pdo = Database::get();
        $paidAt = $status === 'paid' ? gmdate('Y-m-d H:i:s') : null;
        $pdo->prepare("UPDATE invoices SET status = ?, paid_at = COALESCE(?, paid_at), updated_at = datetime('now') WHERE id = ?")
            ->execute([$status, $paidAt, $invoice['id']]);

        ActivityLog::log($user, $status === 'paid' ? 'marked paid' : 'voided', 'invoice', (string) $invoice['id'], $invoice['invoice_number']);

        Response::json(['status' => $status]);
    }

    /** DELETE /api/v1/admin/invoices/{id} */
    public static function destroy(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $invoice = self::findRow('id', (int) $params['id']);
        if (!$invoice) {
            Response::error('Invoice not found.', 404);
        }

        Database::get()->prepare('DELETE FROM invoices WHERE id = ?')->execute([$invoice['id']]);
        ActivityLog::log($user, 'deleted', 'invoice', (string) $invoice['id'], $invoice['invoice_number']);
        Response::json(['status' => 'deleted']);
    }

    /** POST /api/v1/admin/invoices/{id}/send — emails the client a link to the invoice (creating its payment link first) */
    public static function send(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $invoice = self::findWithItems('id', (int) $params['id']);
        if (!$invoice) {
            Response::error('Invoice not found.', 404);
        }
        if (in_array($invoice['status'], ['paid', 'void'], true)) {
            Response::error('Paid or voided invoices cannot be sent.', 422);
        }
        if ($invoice['total'] <= 0) {
            Response::error('Add at least one line item before sending.', 422);
        }

        $pdo = Database::get();

        // Mint the payment link on first send; re-sends reuse it so the
        // client never ends up with two live links for one invoice.
        if (!$invoice['payment_link_id']) {
            $linkToken = bin2hex(random_bytes(12));
            $pdo->prepare(
                'INSERT INTO payment_links (token, client_id, client_name, client_email, amount, currency, description)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $linkToken,
                $invoice['client_id'],
                $invoice['client_name'],
                $invoice['client_email'],
                $invoice['total'],
                $invoice['currency'],
                'Invoice ' . $invoice['invoice_number'],
            ]);
            $pdo->prepare('UPDATE invoices SET payment_link_id = ? WHERE id = ?')
                ->execute([(int) $pdo->lastInsertId(), $invoice['id']]);
        }

        $invoiceUrl = 'https://princecaleb.dev/invoice.html?token=' . $invoice['token'];
        $amount = number_format($invoice['total'] / 100, 2);
        $due = $invoice['due_date'] ? "\nDue date: " . $invoice['due_date'] : '';
        $message = EmailTemplate::render('invoice_send', [
            'client_name' => $invoice['client_name'],
            'invoice_number' => $invoice['invoice_number'],
            'amount' => $amount,
            'currency' => $invoice['currency'],
            'due_date' => $invoice['due_date'] ?? '',
            'due_line' => $invoice['due_date'] ? 'Due date: ' . $invoice['due_date'] : '',
            'invoice_url' => $invoiceUrl,
        ], EmailTemplate::defaults()['invoice_send']);
        $ok = Mailer::sendHtml($invoice['client_email'], $message['subject'], $message['html'], $message['text']);

        if (false) $ok = Mailer::send(
            $invoice['client_email'],
            "Invoice {$invoice['invoice_number']} from Prince Caleb — {$invoice['currency']} {$amount}",
            "Hi {$invoice['client_name']},\n\n"
                . "Your invoice {$invoice['invoice_number']} for {$invoice['currency']} {$amount} is ready:{$due}\n\n"
                . "{$invoiceUrl}\n\n"
                . "You can view the full breakdown and pay securely online from that page. "
                . "If anything looks off or you have questions, just reply to this email.\n\n— Prince Caleb"
        );
        if (!$ok) {
            Response::error('The invoice email could not be sent.', 502);
        }

        $pdo->prepare("UPDATE invoices SET status = 'sent', sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
            ->execute([$invoice['id']]);

        ActivityLog::log($user, 'sent', 'invoice', (string) $invoice['id'], $invoice['invoice_number'], [
            'to' => $invoice['client_email'],
        ]);

        Response::json(['status' => 'sent', 'url' => $invoiceUrl]);
    }

    /** GET /api/v1/invoices/{token} — public: what /invoice.html renders */
    public static function show(array $params): void
    {
        $invoice = self::findWithItems('token', $params['token']);
        if (!$invoice || $invoice['status'] === 'draft') {
            Response::error('Invoice not found.', 404);
        }

        // Tokened public page: expose only what the invoice itself shows.
        Response::json([
            'invoice_number' => $invoice['invoice_number'],
            'client_name' => $invoice['client_name'],
            'client_email' => $invoice['client_email'],
            'currency' => $invoice['currency'],
            'status' => $invoice['status'],
            'issue_date' => $invoice['issue_date'],
            'due_date' => $invoice['due_date'],
            'notes' => $invoice['notes'],
            'paid_at' => $invoice['paid_at'],
            'items' => $invoice['items'],
            'total' => $invoice['total'],
            'payment_url' => $invoice['status'] === 'sent' && $invoice['payment_token']
                ? '/pay.html?token=' . $invoice['payment_token']
                : null,
        ]);
    }

    /**
     * Called from PaymentController when a payment link tied to an invoice is
     * confirmed paid: settle the invoice and email the receipt. Idempotent —
     * an already-paid invoice is left alone.
     */
    public static function settleByPaymentLink(\PDO $pdo, int $paymentLinkId): void
    {
        $stmt = $pdo->prepare("SELECT * FROM invoices WHERE payment_link_id = ? AND status != 'paid'");
        $stmt->execute([$paymentLinkId]);
        $invoice = $stmt->fetch();
        if (!$invoice) {
            return;
        }

        $pdo->prepare("UPDATE invoices SET status = 'paid', paid_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
            ->execute([$invoice['id']]);

        $totalStmt = $pdo->prepare('SELECT COALESCE(SUM(quantity * unit_amount), 0) FROM invoice_items WHERE invoice_id = ?');
        $totalStmt->execute([$invoice['id']]);
        $amount = number_format(((int) round((float) $totalStmt->fetchColumn())) / 100, 2);
        $invoiceUrl = 'https://princecaleb.dev/invoice.html?token=' . $invoice['token'];
        $message = EmailTemplate::render('invoice_receipt', [
            'client_name' => $invoice['client_name'],
            'invoice_number' => $invoice['invoice_number'],
            'amount' => $amount,
            'currency' => $invoice['currency'],
            'invoice_url' => $invoiceUrl,
        ], EmailTemplate::defaults()['invoice_receipt']);

        Mailer::sendHtml($invoice['client_email'], $message['subject'], $message['html'], $message['text']);
        return;

        Mailer::send(
            $invoice['client_email'],
            "Receipt for invoice {$invoice['invoice_number']} — {$invoice['currency']} {$amount}",
            "Hi {$invoice['client_name']},\n\n"
                . "Thanks — your payment of {$invoice['currency']} {$amount} for invoice {$invoice['invoice_number']} has been received.\n\n"
                . "Your invoice now shows as paid and doubles as your receipt (you can print or save it as a PDF from the page):\n\n"
                . "{$invoiceUrl}\n\n— Prince Caleb"
        );
    }

    // --- helpers ---

    /** @return array{0: array<string,mixed>, 1: list<array<string,mixed>>, 2: list<string>} */
    private static function validate(array $data): array
    {
        $clientName = trim((string) ($data['client_name'] ?? ''));
        $clientEmail = trim((string) ($data['client_email'] ?? ''));
        $currency = trim((string) ($data['currency'] ?? '')) ?: 'GHS';
        $issueDate = trim((string) ($data['issue_date'] ?? '')) ?: date('Y-m-d');
        $dueDate = trim((string) ($data['due_date'] ?? '')) ?: null;
        $notes = trim((string) ($data['notes'] ?? '')) ?: null;
        $clientId = !empty($data['client_id']) ? (int) $data['client_id'] : null;

        $errors = [];
        if ($clientName === '') $errors[] = 'Client name is required.';
        if (!filter_var($clientEmail, FILTER_VALIDATE_EMAIL)) $errors[] = 'A valid client email is required.';

        $items = [];
        foreach ((array) ($data['items'] ?? []) as $item) {
            $description = trim((string) ($item['description'] ?? ''));
            $quantity = (float) ($item['quantity'] ?? 1);
            $unitPrice = (float) ($item['unit_price'] ?? 0);
            if ($description === '' && $unitPrice == 0.0) {
                continue; // ignore fully blank rows from the form
            }
            if ($description === '') $errors[] = 'Every line item needs a description.';
            if ($quantity <= 0) $errors[] = 'Line item quantities must be greater than zero.';
            if ($unitPrice < 0) $errors[] = 'Line item prices cannot be negative.';
            $items[] = [
                'description' => $description,
                'quantity' => $quantity,
                'unit_amount' => (int) round($unitPrice * 100),
            ];
        }
        if (!$items) {
            $errors[] = 'At least one line item is required.';
        }

        return [
            [
                'client_id' => $clientId,
                'client_name' => $clientName,
                'client_email' => $clientEmail,
                'currency' => $currency,
                'issue_date' => $issueDate,
                'due_date' => $dueDate,
                'notes' => $notes,
            ],
            $items,
            array_values(array_unique($errors)),
        ];
    }

    private static function replaceItems(\PDO $pdo, int $invoiceId, array $items): void
    {
        $pdo->prepare('DELETE FROM invoice_items WHERE invoice_id = ?')->execute([$invoiceId]);
        $stmt = $pdo->prepare(
            'INSERT INTO invoice_items (invoice_id, description, quantity, unit_amount, sort_order) VALUES (?, ?, ?, ?, ?)'
        );
        foreach ($items as $i => $item) {
            $stmt->execute([$invoiceId, $item['description'], $item['quantity'], $item['unit_amount'], $i]);
        }
    }

    /** INV-2026-0007 style, resetting each calendar year */
    private static function nextInvoiceNumber(\PDO $pdo): string
    {
        $year = date('Y');
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM invoices WHERE invoice_number LIKE ?");
        $stmt->execute(["INV-{$year}-%"]);
        $sequence = (int) $stmt->fetchColumn() + 1;

        // Guard against gaps/deletes colliding with the count-based sequence.
        do {
            $number = sprintf('INV-%s-%04d', $year, $sequence);
            $check = $pdo->prepare('SELECT 1 FROM invoices WHERE invoice_number = ?');
            $check->execute([$number]);
            $sequence++;
        } while ($check->fetchColumn());

        return $number;
    }

    /** @param 'id'|'token' $column */
    private static function findRow(string $column, int|string $value): ?array
    {
        $stmt = Database::get()->prepare("SELECT * FROM invoices WHERE {$column} = ?");
        $stmt->execute([$value]);
        return $stmt->fetch() ?: null;
    }

    /** @param 'id'|'token' $column */
    private static function findWithItems(string $column, int|string $value): ?array
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare(
            "SELECT i.*, pl.token AS payment_token, pl.status AS payment_status
             FROM invoices i
             LEFT JOIN payment_links pl ON pl.id = i.payment_link_id
             WHERE i.{$column} = ?"
        );
        $stmt->execute([$value]);
        $invoice = $stmt->fetch();
        if (!$invoice) {
            return null;
        }

        $itemsStmt = $pdo->prepare('SELECT description, quantity, unit_amount FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id');
        $itemsStmt->execute([$invoice['id']]);
        $invoice['items'] = $itemsStmt->fetchAll();
        $invoice['total'] = array_reduce(
            $invoice['items'],
            fn(int $sum, array $item) => $sum + (int) round($item['quantity'] * $item['unit_amount']),
            0
        );

        return $invoice;
    }
}
