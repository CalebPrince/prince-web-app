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
// Delivery uses whatever Mailer is configured with in Settings — Gmail SMTP if
// smtp_gmail_address/smtp_app_password are set, otherwise PHP mail(). Run it on
// the live host (cPanel) where SMTP is configured for a true end-to-end test.

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

// Sample values for the placeholders — enough to fill any single template.
$vars = [
    'name' => 'Ama', 'client_name' => 'Ama', 'client_email' => $to, 'client_phone' => '+233 20 000 0000',
    'currency' => 'GHS', 'amount' => '4,500.00',
    'description' => 'Restaurant booking web app', 'plan_name' => 'Care plan — Standard', 'reference' => 'SUB-TEST-01',
    'invoice_number' => 'INV-2041', 'invoice_url' => 'https://princecaleb.dev/invoice.html?id=test',
    'due_line' => 'Payment is due by 30 July 2026.',
    'booking_url' => 'https://princecaleb.dev/book.html',
    'proposal_title' => 'Restaurant booking platform', 'proposal_url' => 'https://princecaleb.dev/proposal.html?id=test',
    'portal_url' => 'https://princecaleb.dev/client/', 'reset_url' => 'https://princecaleb.dev/client/reset?token=test',
    'testimonial_url' => 'https://princecaleb.dev/testimonial.html?token=test', 'project_reference_line' => ' on the booking platform',
    'payment_url' => 'https://princecaleb.dev/pay.html?id=test', 'milestone_title' => 'Milestone 2 — Build',
    'date' => 'Thursday, 24 July 2026', 'time' => '3:00 PM', 'timezone' => 'GMT',
    'topic' => 'App scope call', 'topic_line' => 'We will talk through your app idea and scope.',
    'project_type' => 'Web app', 'budget' => 'GHS 5k–10k', 'timeline' => '4–6 weeks',
    'message_body' => 'Just checking in — let me know if you have any questions.',
    'notification_type' => 'New inquiry', 'details_html' => '', 'details_text' => '', 'source_label' => 'contact form',
];

$rendered = EmailTemplate::render($key, $vars, $defaults[$key]);
$ok = Mailer::sendHtml($to, '[TEST] ' . $rendered['subject'], $rendered['html'], $rendered['text']);

echo ($ok ? "Sent" : "FAILED to send") . " '{$key}' to {$to}\n";
exit($ok ? 0 : 1);
