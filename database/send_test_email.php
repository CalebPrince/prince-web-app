<?php

declare(strict_types=1);

// One-off helper to preview/test the branded email templates against a real
// inbox. Renders a real template through EmailTemplate (so you see the exact
// wrapper, monogram, and footer recipients get) and sends it via Mailer.
//
// Usage (CLI):
//   php database/send_test_email.php you@example.com [template_key]
//
// template_key defaults to invoice_send. Any key from EmailTemplate::defaults()
// works (payment_success, booking_client_confirmation, proposal_send, ...).
//
// Delivery uses whatever Mailer is configured with in Settings — authenticated SMTP
// (any host, e.g. your own domain's mailbox or Gmail) if smtp_gmail_address/
// smtp_app_password are set, otherwise PHP mail(). Run it on the live host (cPanel)
// where SMTP is configured for a true end-to-end test.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\EmailTemplate;
use App\Support\Mailer;

$to = $argv[1] ?? '';
$key = $argv[2] ?? 'invoice_send';

if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Usage: php database/send_test_email.php <recipient@email> [template_key]\n");
    exit(1);
}

$defaults = EmailTemplate::defaults();
if (!isset($defaults[$key])) {
    fwrite(STDERR, "Unknown template '{$key}'. Available:\n  " . implode("\n  ", array_keys($defaults)) . "\n");
    exit(1);
}

$rendered = EmailTemplate::render($key, EmailTemplate::sampleVars($to), $defaults[$key]);
$ok = Mailer::sendHtml($to, '[TEST] ' . $rendered['subject'], $rendered['html'], $rendered['text']);

echo ($ok ? "Sent" : "FAILED to send") . " '{$key}' to {$to}\n";
exit($ok ? 0 : 1);
