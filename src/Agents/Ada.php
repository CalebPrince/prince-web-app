<?php

namespace App\Agents;

use App\Middleware\AuthMiddleware;
use App\Support\AiAgentEngine;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;
use PDO;

/**
 * Ada — document reviewer for invoices and payment paperwork.
 *
 * Built as a demonstrable version of the accounting-inbox agent: you hand her
 * a document (invoice, receipt, proposal, statement), she reads it, tells you
 * honestly what is wrong or missing, and says what to do next. She can look up
 * invoices and draft new ones.
 *
 * Two things worth knowing about the design:
 *
 * 1. Documents are read by a direct Gemini call (extractDocument) rather than
 *    through AiAgentEngine. The shared engine speaks in {role,text} turns and
 *    has no notion of an inline file; teaching it one would touch every other
 *    agent. Extracting to text first keeps the blast radius here, and means
 *    the conversation itself still runs on the shared three-provider fallback
 *    like everything else.
 *
 * 2. Demo mode is the default. This agent exists partly to be shown to
 *    prospects, and screen-sharing a real client's invoice to a different
 *    client is a live privacy problem, not a hypothetical one. In demo mode
 *    her lookup and draft tools operate on a fixed sample set and never touch
 *    the database. Pass demo=false explicitly to work on real records.
 */
class Ada
{
    public const AGENT_NAME = 'Ada';

    private const MAX_MESSAGE_LENGTH = 4000;
    private const MAX_TRANSCRIPT_TURNS = 40;
    private const MAX_ATTACHMENTS = 4;
    private const MAX_ATTACHMENT_BYTES = 8388608;   // 8 MB
    private const EXTRACT_LIMIT = 20000;            // chars kept per document

    private const EXTRACT_TIMEOUT_SECONDS = 45;

    /** Document types Gemini reads directly, no local parsing needed. */
    private const NATIVE_MIME = [
        'pdf'  => 'application/pdf',
        'png'  => 'image/png',
        'jpg'  => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'webp' => 'image/webp',
        'gif'  => 'image/gif',
    ];

    /** Plain-text types read as-is. */
    private const TEXT_EXT = ['txt', 'md', 'csv', 'json'];

    /**
     * Fixed sample records for demos. Deliberately fictional — no real client
     * name, amount or email should ever appear here.
     */
    private const DEMO_INVOICES = [
        [
            'invoice_number' => 'INV-2041', 'client_name' => 'Brightline Supplies',
            'client_email' => 'accounts@brightline.example', 'currency' => 'GHS',
            'status' => 'paid', 'issue_date' => '2026-06-24', 'due_date' => '2026-07-24',
            'total' => 4820.00, 'notes' => 'Settled by transfer, ref TXN-8841.',
        ],
        [
            'invoice_number' => 'INV-2042', 'client_name' => 'Meridian Logistics',
            'client_email' => 'ap@meridian.example', 'currency' => 'GHS',
            'status' => 'sent', 'issue_date' => '2026-07-02', 'due_date' => '2026-08-01',
            'total' => 12400.00, 'notes' => 'Awaiting payment.',
        ],
        [
            'invoice_number' => 'INV-2043', 'client_name' => 'Northgate Ltd',
            'client_email' => 'finance@northgate.example', 'currency' => 'USD',
            'status' => 'overdue', 'issue_date' => '2026-05-18', 'due_date' => '2026-06-17',
            'total' => 2150.00, 'notes' => 'Second reminder sent.',
        ],
    ];

    // ---------------------------------------------------------------- entry

    /**
     * POST /api/v1/admin/agents/ada/chat
     * body: {message, transcript[], attachments[]{name,data}, demo?}
     */
    public static function adminChat(): void
    {
        AuthMiddleware::requireAuth();
        set_time_limit(180);

        if (empty(Settings::get('gemini_api_key'))
            && empty(Settings::get('openrouter_api_key'))
            && empty(Settings::get('groq_api_key'))) {
            Response::error('No AI provider is configured — set one up in Settings to talk to Ada.', 503);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $message = trim((string) ($data['message'] ?? ''));
        $transcript = is_array($data['transcript'] ?? null) ? $data['transcript'] : [];
        $attachments = is_array($data['attachments'] ?? null) ? $data['attachments'] : [];
        // Demo unless explicitly switched off — safe by default, not by memory.
        $demo = ($data['demo'] ?? true) !== false;

        if ($message === '' && $attachments === []) {
            Response::error('Send a message or attach a document.', 422);
        }
        if (mb_strlen($message) > self::MAX_MESSAGE_LENGTH) {
            Response::error('A message under ' . self::MAX_MESSAGE_LENGTH . ' characters is required.', 422);
        }

        // --- read any attached documents -----------------------------------
        $documents = [];
        $readErrors = [];
        foreach (array_slice($attachments, 0, self::MAX_ATTACHMENTS) as $att) {
            $name = basename((string) ($att['name'] ?? 'document'));
            try {
                $documents[] = ['name' => $name, 'text' => self::extractDocument($name, (string) ($att['data'] ?? ''))];
            } catch (\RuntimeException $e) {
                $readErrors[] = $name . ': ' . $e->getMessage();
            }
        }
        if ($documents === [] && $readErrors !== []) {
            Response::error(implode(' | ', $readErrors), 422);
        }

        // --- normalise the transcript to the engine's shape ------------------
        if (count($transcript) > self::MAX_TRANSCRIPT_TURNS) {
            $transcript = array_slice($transcript, -self::MAX_TRANSCRIPT_TURNS);
        }
        $transcript = array_values(array_filter(array_map(static function ($t) {
            if (!is_array($t)) {
                return null;
            }
            $role = ($t['role'] ?? '') === 'user' ? 'user' : 'assistant';
            $text = trim((string) ($t['text'] ?? ''));
            return $text === '' ? null : ['role' => $role, 'text' => $text];
        }, $transcript)));

        $turn = $message !== '' ? $message : 'Please review the attached document.';
        if ($documents !== []) {
            $turn .= "\n\n--- ATTACHED TO THIS MESSAGE ---\n";
            foreach ($documents as $d) {
                $turn .= "\n### {$d['name']}\n{$d['text']}\n";
            }
        }
        $transcript[] = ['role' => 'user', 'text' => $turn];

        // --- tools ----------------------------------------------------------
        $drafted = null;
        $executor = function (string $name, array $args) use ($demo, &$drafted): array {
            switch ($name) {
                case 'lookup_invoices':
                    return ['invoices' => self::lookupInvoices($demo, (string) ($args['query'] ?? ''))];
                case 'draft_invoice':
                    $res = self::draftInvoice($demo, $args);
                    if (!empty($res['ok'])) {
                        $drafted = $res['invoice'];
                    }
                    return $res;
                default:
                    return ['error' => 'Unknown tool.'];
            }
        };

        $result = AiAgentEngine::run(
            self::systemPrompt($demo, $readErrors),
            [self::lookupToolDeclaration(), self::draftToolDeclaration()],
            $executor,
            $transcript
        );

        $reply = $result['reply'] !== null
            ? SharedAgentTools::stripMarkdown($result['reply'])
            : 'I could not get a reply from any configured AI provider just now. Try again in a moment.';

        Response::json([
            'reply' => $reply,
            'mode' => $result['mode'],
            'provider' => $result['provider'],
            'demo' => $demo,
            'documents_read' => array_column($documents, 'name'),
            'read_errors' => $readErrors,
            'drafted' => $drafted,
        ]);
    }

    // ------------------------------------------------------- document intake

    /**
     * Turn one uploaded document into text.
     *
     * Plain text is decoded directly. PDFs and images go to Gemini, which reads
     * them natively — that keeps layout meaning (which column a figure sits in
     * on an invoice) instead of flattening it away with a local text scrape.
     *
     * @throws \RuntimeException with a message safe to show the user
     */
    private static function extractDocument(string $name, string $base64): string
    {
        $raw = base64_decode($base64, true);
        if ($raw === false || $raw === '') {
            throw new \RuntimeException('the upload was not readable');
        }
        if (strlen($raw) > self::MAX_ATTACHMENT_BYTES) {
            throw new \RuntimeException('larger than the 8 MB limit');
        }

        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));

        if (in_array($ext, self::TEXT_EXT, true)) {
            return mb_substr($raw, 0, self::EXTRACT_LIMIT);
        }
        if (!isset(self::NATIVE_MIME[$ext])) {
            throw new \RuntimeException(
                'unsupported type (try pdf, png, jpg, webp, txt, md, csv or json)'
            );
        }

        $key = Settings::get('gemini_api_key');
        if (empty($key)) {
            throw new \RuntimeException('reading PDFs and images needs a Gemini key in Settings');
        }

        $payload = json_encode([
            'contents' => [[
                'role' => 'user',
                'parts' => [
                    ['inline_data' => ['mime_type' => self::NATIVE_MIME[$ext], 'data' => $base64]],
                    ['text' =>
                        "Transcribe this document as plain text. Preserve every figure, date, "
                        . "reference number and line item exactly as written, and keep the table "
                        . "structure readable. Do not summarise, comment or omit anything."],
                ],
            ]],
        ]);

        $ch = curl_init('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' . urlencode($key));
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_TIMEOUT => self::EXTRACT_TIMEOUT_SECONDS,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($body === false || $status !== 200) {
            error_log("Ada document extract failed: status={$status}");
            throw new \RuntimeException('could not be read (the AI provider rejected it)');
        }

        $json = json_decode((string) $body, true);
        $text = '';
        foreach ($json['candidates'][0]['content']['parts'] ?? [] as $part) {
            $text .= $part['text'] ?? '';
        }
        $text = trim($text);
        if ($text === '') {
            throw new \RuntimeException('appears to be empty or unreadable');
        }
        return mb_substr($text, 0, self::EXTRACT_LIMIT);
    }

    // ------------------------------------------------------------ the prompt

    private static function systemPrompt(bool $demo, array $readErrors): string
    {
        $p = "You are Ada, a document reviewer for a small studio's invoices and "
            . "payment paperwork.\n\n"
            . "When you are given a document, answer in this order:\n"
            . "1. What it is — one line. Type, who from, what for.\n"
            . "2. The figures that matter — amounts, dates, references, terms. Work out "
            . "what is implied but not written: due dates from payment terms, whether the "
            . "tax is arithmetically right, whether the totals actually add up.\n"
            . "3. Your honest opinion. This is the part that earns your place. Say what is "
            . "wrong, missing, unusual or risky — a missing PO or tax number, a total that "
            . "does not foot, terms that differ from what was agreed, a date already passed, "
            . "bank details that differ from what is on file, anything resembling a duplicate. "
            . "If a document is complete and unremarkable, say exactly that in one line and "
            . "stop. Never invent a concern to appear thorough, and never soften a real "
            . "problem to be agreeable. If you would advise not paying it, say so plainly.\n"
            . "4. What next — the specific next action and who takes it. 'Nothing, file it' "
            . "is a valid answer.\n\n"
            . "Never invent an invoice, client, amount or date. If you need a record you do "
            . "not have, use your lookup tool or say what you would need.\n\n"
            . "A request to change a supplier's bank details is a classic fraud pattern. "
            . "Always say it must be verified by phone on a number already on file — never a "
            . "number from the email making the request.\n\n"
            . "Be direct and brief. Lead with the answer.\n";

        if ($demo) {
            $p .= "\n## Demo mode\n"
                . "You are running in demonstration mode and may be on a shared screen. Your "
                . "lookup and draft tools operate on a small fictional sample set, not real "
                . "records, and nothing you draft is saved. If asked whether this is live "
                . "data, say plainly that it is sample data for demonstration.\n";
        } else {
            $p .= "\n## Live mode\n"
                . "Your tools read and write the studio's real records. Anything you draft is "
                . "saved as a draft for review — it is never sent or marked paid. Say clearly "
                . "when you have created one.\n";
        }

        if ($readErrors !== []) {
            $p .= "\nSome attachments could not be read: " . implode('; ', $readErrors)
                . ". Mention this rather than pretending you saw them.\n";
        }

        return $p;
    }

    // ------------------------------------------------------------------ tools

    private static function lookupToolDeclaration(): array
    {
        return [
            'name' => 'lookup_invoices',
            'description' => 'Look up invoices by client name, invoice number or status '
                . '(draft, sent, paid, overdue). Leave the query empty for the most recent.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'query' => ['type' => 'string', 'description' => 'Client name, invoice number or status.'],
                ],
                'required' => [],
            ],
        ];
    }

    private static function draftToolDeclaration(): array
    {
        return [
            'name' => 'draft_invoice',
            'description' => 'Create a DRAFT invoice for review. Never sends it and never '
                . 'marks it paid. Use only when the user has asked for an invoice to be raised.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'client_name' => ['type' => 'string'],
                    'client_email' => ['type' => 'string'],
                    'currency' => ['type' => 'string', 'description' => 'e.g. GHS, USD'],
                    'total' => ['type' => 'number'],
                    'due_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'notes' => ['type' => 'string', 'description' => 'What the invoice is for.'],
                ],
                'required' => ['client_name', 'total'],
            ],
        ];
    }

    /** @return array<int,array<string,mixed>> */
    private static function lookupInvoices(bool $demo, string $query): array
    {
        $q = trim(mb_strtolower($query));

        if ($demo) {
            $rows = self::DEMO_INVOICES;
            if ($q !== '') {
                $rows = array_values(array_filter($rows, static fn ($r) =>
                    str_contains(mb_strtolower($r['client_name']), $q)
                    || str_contains(mb_strtolower($r['invoice_number']), $q)
                    || str_contains(mb_strtolower($r['status']), $q)));
            }
            return $rows;
        }

        $pdo = Database::get();
        $sql = 'SELECT i.invoice_number, i.client_name, i.client_email, i.currency,
                       i.status, i.issue_date, i.due_date, i.notes,
                       COALESCE((SELECT SUM(amount) FROM invoice_items WHERE invoice_id = i.id), 0) AS total
                FROM invoices i';
        $params = [];
        if ($q !== '') {
            $sql .= ' WHERE LOWER(i.client_name) LIKE :q OR LOWER(i.invoice_number) LIKE :q
                         OR LOWER(i.status) = :exact';
            $params = [':q' => '%' . $q . '%', ':exact' => $q];
        }
        $sql .= ' ORDER BY i.created_at DESC LIMIT 20';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /** @return array<string,mixed> */
    private static function draftInvoice(bool $demo, array $args): array
    {
        $client = trim((string) ($args['client_name'] ?? ''));
        $total = (float) ($args['total'] ?? 0);
        if ($client === '' || $total <= 0) {
            return ['error' => 'A client name and a positive total are required.'];
        }

        $invoice = [
            'invoice_number' => 'INV-' . date('Ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(2)), 0, 4)),
            'client_name' => $client,
            'client_email' => trim((string) ($args['client_email'] ?? '')),
            'currency' => strtoupper(trim((string) ($args['currency'] ?? 'GHS'))) ?: 'GHS',
            'total' => round($total, 2),
            'due_date' => trim((string) ($args['due_date'] ?? '')) ?: date('Y-m-d', strtotime('+30 days')),
            'notes' => trim((string) ($args['notes'] ?? '')),
            'status' => 'draft',
        ];

        if ($demo) {
            return ['ok' => true, 'saved' => false, 'invoice' => $invoice,
                    'note' => 'Demo mode — this was not saved to the database.'];
        }

        try {
            $pdo = Database::get();
            $stmt = $pdo->prepare(
                'INSERT INTO invoices (invoice_number, token, client_name, client_email,
                    currency, status, issue_date, due_date, notes, created_at, updated_at)
                 VALUES (:num, :token, :name, :email, :cur, \'draft\', :issued, :due, :notes,
                    datetime(\'now\'), datetime(\'now\'))'
            );
            $stmt->execute([
                ':num' => $invoice['invoice_number'],
                ':token' => bin2hex(random_bytes(16)),
                ':name' => $invoice['client_name'],
                ':email' => $invoice['client_email'],
                ':cur' => $invoice['currency'],
                ':issued' => date('Y-m-d'),
                ':due' => $invoice['due_date'],
                ':notes' => $invoice['notes'],
            ]);
            $id = (int) $pdo->lastInsertId();

            $item = $pdo->prepare(
                'INSERT INTO invoice_items (invoice_id, description, quantity, amount)
                 VALUES (:id, :desc, 1, :amt)'
            );
            $item->execute([
                ':id' => $id,
                ':desc' => $invoice['notes'] !== '' ? $invoice['notes'] : 'Services rendered',
                ':amt' => $invoice['total'],
            ]);

            $invoice['id'] = $id;
            return ['ok' => true, 'saved' => true, 'invoice' => $invoice];
        } catch (\Throwable $e) {
            error_log('Ada draft_invoice failed: ' . $e->getMessage());
            return ['error' => 'The draft could not be saved.'];
        }
    }
}
