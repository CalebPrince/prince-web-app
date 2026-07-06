<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Thin wrapper around PHP's built-in mail(). Works out of the box on hosts
 * with sendmail/exim already configured (e.g. cPanel) — no SMTP credentials
 * needed. Deliverability depends on the host's mail setup (SPF/DKIM), which
 * is outside this app's control.
 */
class Mailer
{
    public static function send(string $to, string $subject, string $body, ?string $replyTo = null): bool
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        $config = appConfig();

        $headers = [
            'From: ' . $config['mail_from_name'] . ' <' . $config['mail_from'] . '>',
            'Content-Type: text/plain; charset=UTF-8',
        ];
        if ($replyTo) {
            $headers[] = 'Reply-To: ' . $replyTo;
        }

        return mail($to, $subject, $body, implode("\r\n", $headers));
    }
}
