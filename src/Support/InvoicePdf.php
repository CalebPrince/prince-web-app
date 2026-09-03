<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Renders a branded one-page PDF for an invoice row (the shape
 * InvoiceController::findWithItems returns: invoice_number, token, client_name,
 * client_email, currency, issue_date, due_date, notes, status, paid_at,
 * items[{description,quantity,unit_amount}], total — all amounts in the
 * smallest currency unit) and saves it under public/uploads/invoices/ so it
 * can be handed to WhatsApp as a public MediaUrl or attached to an email.
 *
 * Deterministic, no external renderer — same "draw it ourselves" approach as
 * SocialImage's GD template — using the vendored FPDF (src/vendor/fpdf.php,
 * not Composer). Core PDF fonts only, so no font files are needed on the host.
 *
 * Every failure path returns null; callers fall back to sending the plain
 * /invoice?token= link instead of hard-failing the reply.
 */
class InvoicePdf
{
    // Site brand, kept in step with web/src/app/invoice/page.tsx.
    private const ACCENT = [22, 141, 79];    // readable green on white (site accent is too light to print)
    private const INK = [17, 19, 22];
    private const MUTED = [110, 116, 125];
    private const RULE = [223, 226, 230];
    private const TAGLINE = 'AI Voice Agents  -  Chatbots  -  Automation  -  Web & Mobile';

    /**
     * @param array<string,mixed> $invoice
     * @return array{url:string,path:string}|null
     */
    public static function render(array $invoice): ?array
    {
        if (!class_exists('FPDF')) {
            $lib = dirname(__DIR__) . '/vendor/fpdf/fpdf.php';
            if (!is_file($lib)) {
                error_log('InvoicePdf: src/vendor/fpdf/fpdf.php is missing.');
                return null;
            }
            require_once $lib;
        }

        try {
            $body = self::build($invoice);
        } catch (\Throwable $e) {
            error_log('InvoicePdf: render failed: ' . $e->getMessage());
            return null;
        }
        if ($body === '') {
            return null;
        }

        // Same DOCUMENT_ROOT guard as SocialImage: the CLI SAPI sets it to an
        // empty string rather than leaving it unset, so `?:` not `??`.
        $docRoot = !empty($_SERVER['DOCUMENT_ROOT']) ? $_SERVER['DOCUMENT_ROOT'] : dirname(__DIR__, 2) . '/public';
        $dir = $docRoot . '/uploads/invoices';
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            error_log('InvoicePdf: uploads/invoices is missing and could not be created.');
            return null;
        }

        $number = preg_replace('/[^A-Za-z0-9_-]+/', '', (string) ($invoice['invoice_number'] ?? 'invoice')) ?: 'invoice';
        $token = preg_replace('/[^a-f0-9]+/i', '', (string) ($invoice['token'] ?? '')) ?: bin2hex(random_bytes(6));
        $filename = $number . '-' . substr($token, 0, 16) . '.pdf';

        if (@file_put_contents($dir . '/' . $filename, $body) === false) {
            error_log('InvoicePdf: could not write the PDF to uploads/invoices.');
            return null;
        }

        return ['url' => '/uploads/invoices/' . $filename, 'path' => $dir . '/' . $filename];
    }

    /** @param array<string,mixed> $invoice */
    private static function build(array $invoice): string
    {
        $currency = strtoupper(trim((string) ($invoice['currency'] ?? 'GHS'))) ?: 'GHS';
        $items = is_array($invoice['items'] ?? null) ? $invoice['items'] : [];
        $total = (int) round((float) ($invoice['total'] ?? 0));
        $status = strtolower(trim((string) ($invoice['status'] ?? 'draft')));
        $email = trim((string) Settings::get('social_email'));

        $pdf = new \FPDF('P', 'mm', 'A4');
        $pdf->SetTitle('Invoice ' . (string) ($invoice['invoice_number'] ?? ''));
        $pdf->SetAuthor('Prince Caleb');
        $pdf->SetMargins(16, 16, 16);
        $pdf->SetAutoPageBreak(true, 20);
        $pdf->AddPage();

        // ---- header: wordmark (left) + INVOICE <number> (right) ----
        $pdf->SetXY(16, 16);
        $pdf->SetFont('Helvetica', 'B', 15);
        self::color($pdf, self::ACCENT, 'text');
        $pdf->Cell($pdf->GetStringWidth('P'), 8, 'P', 0, 0);
        self::color($pdf, self::INK, 'text');
        $pdf->Cell($pdf->GetStringWidth('rince Caleb'), 8, 'rince Caleb', 0, 0);
        self::color($pdf, self::ACCENT, 'text');
        $pdf->Cell(6, 8, '.', 0, 0);

        $pdf->SetXY(16, 16);
        $pdf->SetFont('Helvetica', 'B', 14);
        self::color($pdf, self::MUTED, 'text');
        $pdf->Cell(0, 8, self::tx('INVOICE ' . (string) ($invoice['invoice_number'] ?? '')), 0, 1, 'R');

        $pdf->SetX(16);
        $pdf->SetFont('Helvetica', '', 8);
        self::color($pdf, self::MUTED, 'text');
        $pdf->Ln(2);
        $pdf->MultiCell(120, 4.2, self::tx(self::TAGLINE . "\nprincecaleb.dev" . ($email !== '' ? '  -  ' . $email : '')), 0, 'L');

        $pdf->Ln(3);
        self::color($pdf, self::RULE, 'draw');
        $pdf->SetLineWidth(0.3);
        $y = $pdf->GetY();
        $pdf->Line(16, $y, 194, $y);
        $pdf->Ln(6);

        // ---- billed-to (left) + dates (right), same top edge ----
        $top = $pdf->GetY();
        $pdf->SetXY(16, $top);
        $pdf->SetFont('Helvetica', 'B', 7.5);
        self::color($pdf, self::MUTED, 'text');
        $pdf->Cell(0, 4, 'BILLED TO', 0, 2);
        $pdf->SetFont('Helvetica', 'B', 10.5);
        self::color($pdf, self::INK, 'text');
        $pdf->Cell(0, 6, self::tx((string) ($invoice['client_name'] ?? '')), 0, 2);
        $pdf->SetFont('Helvetica', '', 9);
        self::color($pdf, self::MUTED, 'text');
        $pdf->Cell(0, 5, self::tx((string) ($invoice['client_email'] ?? '')), 0, 2);
        $leftBottom = $pdf->GetY();

        $meta = [['Issue date', (string) ($invoice['issue_date'] ?? '')]];
        if (trim((string) ($invoice['due_date'] ?? '')) !== '') {
            $meta[] = ['Due date', (string) $invoice['due_date']];
        }
        if (in_array($status, ['paid', 'void'], true)) {
            $meta[] = ['Status', strtoupper($status)];
            if ($status === 'paid' && trim((string) ($invoice['paid_at'] ?? '')) !== '') {
                $meta[] = ['Paid on', substr((string) $invoice['paid_at'], 0, 10)];
            }
        }
        $pdf->SetY($top);
        foreach ($meta as [$label, $value]) {
            $pdf->SetX(114);
            $pdf->SetFont('Helvetica', '', 9);
            self::color($pdf, self::MUTED, 'text');
            $pdf->Cell(34, 5.5, self::tx($label), 0, 0, 'L');
            $pdf->SetFont('Helvetica', 'B', 9);
            self::color($pdf, self::INK, 'text');
            $pdf->Cell(46, 5.5, self::tx($value), 0, 1, 'R');
        }

        $pdf->SetY(max($leftBottom, $pdf->GetY()) + 6);

        // ---- items table ----
        $pdf->SetFont('Helvetica', 'B', 7.5);
        self::color($pdf, [238, 240, 242], 'fill');
        self::color($pdf, self::MUTED, 'text');
        $pdf->Cell(93, 7, ' DESCRIPTION', 0, 0, 'L', true);
        $pdf->Cell(17, 7, 'QTY', 0, 0, 'R', true);
        $pdf->Cell(33, 7, 'UNIT PRICE', 0, 0, 'R', true);
        $pdf->Cell(35, 7, 'AMOUNT ', 0, 1, 'R', true);

        $pdf->SetFont('Helvetica', '', 9.5);
        self::color($pdf, self::RULE, 'draw');
        $pdf->SetLineWidth(0.2);
        foreach ($items as $item) {
            $qty = (float) ($item['quantity'] ?? 1);
            $unit = (int) round((float) ($item['unit_amount'] ?? 0));
            $line = (int) round($qty * $unit);

            $x = $pdf->GetX();
            $y = $pdf->GetY();
            self::color($pdf, self::INK, 'text');
            $pdf->MultiCell(93, 6, self::tx(' ' . (string) ($item['description'] ?? '')), 'B', 'L');
            $rowH = $pdf->GetY() - $y;
            $pdf->SetXY($x + 93, $y);
            self::color($pdf, self::MUTED, 'text');
            $pdf->Cell(17, $rowH, self::qty($qty), 'B', 0, 'R');
            $pdf->Cell(33, $rowH, self::tx(self::money($unit, $currency)), 'B', 0, 'R');
            self::color($pdf, self::INK, 'text');
            $pdf->Cell(35, $rowH, self::tx(self::money($line, $currency) . ' '), 'B', 1, 'R');
        }

        $pdf->Ln(3);
        $pdf->SetFont('Helvetica', 'B', 11);
        self::color($pdf, self::INK, 'text');
        $pdf->Cell(108, 8, self::tx('TOTAL'), 0, 0, 'R');
        self::color($pdf, self::ACCENT, 'text');
        $pdf->Cell(70, 8, self::tx(self::money($total, $currency) . ' '), 0, 1, 'R');

        if (trim((string) ($invoice['notes'] ?? '')) !== '') {
            $pdf->Ln(5);
            $pdf->SetFont('Helvetica', 'B', 7.5);
            self::color($pdf, self::MUTED, 'text');
            $pdf->Cell(0, 4, 'NOTES', 0, 1);
            $pdf->SetFont('Helvetica', '', 9);
            self::color($pdf, self::INK, 'text');
            $pdf->MultiCell(178, 5, self::tx((string) $invoice['notes']), 0, 'L');
        }

        // ---- footer ----
        $pdf->SetY(-24);
        $pdf->SetFont('Helvetica', '', 8);
        self::color($pdf, self::MUTED, 'text');
        $footer = $status === 'paid'
            ? 'Paid in full. This invoice serves as your receipt. Thank you for your business.'
            : 'Thank you for your business. princecaleb.dev' . ($email !== '' ? '  -  ' . $email : '');
        $pdf->MultiCell(178, 4, self::tx($footer), 0, 'C');

        $out = $pdf->Output('S');
        return is_string($out) ? $out : '';
    }

    /** @param array{0:int,1:int,2:int} $rgb */
    private static function color(\FPDF $pdf, array $rgb, string $target): void
    {
        match ($target) {
            'text' => $pdf->SetTextColor($rgb[0], $rgb[1], $rgb[2]),
            'fill' => $pdf->SetFillColor($rgb[0], $rgb[1], $rgb[2]),
            'draw' => $pdf->SetDrawColor($rgb[0], $rgb[1], $rgb[2]),
            default => null,
        };
    }

    private static function money(int $subunits, string $currency): string
    {
        return $currency . ' ' . number_format($subunits / 100, 2);
    }

    private static function qty(float $q): string
    {
        $s = number_format($q, 2, '.', '');
        return str_contains($s, '.') ? rtrim(rtrim($s, '0'), '.') : $s;
    }

    /** FPDF core fonts are Windows-1252; transliterate so accented names/notes still render. */
    private static function tx(string $s): string
    {
        $c = @iconv('UTF-8', 'Windows-1252//TRANSLIT//IGNORE', $s);
        return $c !== false ? $c : $s;
    }
}
