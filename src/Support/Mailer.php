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

        // @-suppressed: mail() raises a PHP Warning (not just a false return)
        // when it can't reach a mail server at all — printed straight into
        // whatever's mid-render, which corrupts a JSON API response with
        // leaked HTML before the caller ever sees the boolean result. The
        // false return still propagates untouched for real error handling.
        return @mail($to, $subject, $body, implode("\r\n", $headers));
    }

    public static function sendHtml(string $to, string $subject, string $html, string $text, ?string $replyTo = null): bool
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        $config = appConfig();
        $boundary = 'pc-mail-' . bin2hex(random_bytes(12));

        $headers = [
            'From: ' . $config['mail_from_name'] . ' <' . $config['mail_from'] . '>',
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        ];
        if ($replyTo) {
            $headers[] = 'Reply-To: ' . $replyTo;
        }

        $body = "--{$boundary}\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: 8bit\r\n\r\n"
            . $text . "\r\n\r\n"
            . "--{$boundary}\r\n"
            . "Content-Type: text/html; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: 8bit\r\n\r\n"
            . $html . "\r\n\r\n"
            . "--{$boundary}--";

        // See send()'s matching comment — @-suppressed so a mail-server
        // failure can't leak a raw PHP Warning into a JSON API response.
        return @mail($to, $subject, $body, implode("\r\n", $headers));
    }
}
