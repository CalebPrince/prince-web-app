<?php

declare(strict_types=1);

namespace App\Support;

/** Sends through authenticated SMTP when configured, otherwise PHP mail(). */
class Mailer
{
    private const DEFAULT_SMTP_HOST = 'smtp.gmail.com';
    private const DEFAULT_SMTP_PORT = 465;
    private const SMTP_TIMEOUT = 15;

    public static function send(string $to, string $subject, string $body, ?string $replyTo = null): bool
    {
        $identity = self::identity();
        $headers = [
            'From: ' . self::mailbox($identity['name'], $identity['address']),
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
        ];
        if ($replyTo && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
            $headers[] = 'Reply-To: ' . $replyTo;
        }

        return self::deliver($to, $subject, $body, $headers, $identity);
    }

    public static function sendHtml(string $to, string $subject, string $html, string $text, ?string $replyTo = null): bool
    {
        $identity = self::identity();
        $boundary = 'pc-mail-' . bin2hex(random_bytes(12));
        $headers = [
            'From: ' . self::mailbox($identity['name'], $identity['address']),
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        ];
        if ($replyTo && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
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

        return self::deliver($to, $subject, $body, $headers, $identity);
    }

    /** @return array{address:string,name:string,username:string,password:string,host:string,port:int} */
    private static function identity(): array
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        $config = appConfig();

        $host = trim((string) Settings::get('smtp_host'));
        $port = trim((string) Settings::get('smtp_port'));

        return [
            'address' => Settings::get('mail_from') ?: $config['mail_from'],
            'name' => Settings::get('mail_from_name') ?: $config['mail_from_name'],
            'username' => trim((string) Settings::get('smtp_gmail_address')),
            'password' => preg_replace('/\s+/', '', (string) Settings::get('smtp_app_password')),
            'host' => $host !== '' ? $host : self::DEFAULT_SMTP_HOST,
            'port' => $port !== '' && is_numeric($port) ? (int) $port : self::DEFAULT_SMTP_PORT,
        ];
    }

    /** @param string[] $headers @param array{address:string,name:string,username:string,password:string,host:string,port:int} $identity */
    private static function deliver(string $to, string $subject, string $body, array $headers, array $identity): bool
    {
        if (!filter_var($to, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $subject)) {
            return false;
        }

        if ($identity['username'] !== '' || $identity['password'] !== '') {
            if (!filter_var($identity['username'], FILTER_VALIDATE_EMAIL) || $identity['password'] === '') {
                error_log('Mailer: SMTP settings are incomplete.');
                return false;
            }
            return self::sendSmtp($to, $subject, $body, $headers, $identity);
        }

        // Preserve the hosting-server fallback until SMTP is configured.
        return @mail($to, $subject, $body, implode("\r\n", $headers));
    }

    /** @param string[] $headers @param array{address:string,name:string,username:string,password:string,host:string,port:int} $identity */
    private static function sendSmtp(string $to, string $subject, string $body, array $headers, array $identity): bool
    {
        // Shared-hosting mail servers commonly present a certificate issued for
        // the box's own hostname, not each vanity domain they route mail for -
        // verify_peer stays on (rejects a genuinely untrusted/self-signed cert),
        // verify_peer_name is off so a legitimate cert naming the wrong host
        // doesn't get rejected too.
        $context = stream_context_create([
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => false],
        ]);
        $errno = 0;
        $error = '';
        $socket = @stream_socket_client(
            'ssl://' . $identity['host'] . ':' . $identity['port'],
            $errno,
            $error,
            self::SMTP_TIMEOUT,
            STREAM_CLIENT_CONNECT,
            $context
        );
        if (!is_resource($socket)) {
            error_log(sprintf('Mailer SMTP connection failed (%d): %s', $errno, $error));
            return false;
        }

        stream_set_timeout($socket, self::SMTP_TIMEOUT);
        try {
            if (!self::expect($socket, [220])
                || !self::command($socket, 'EHLO princecaleb.dev', [250])
                || !self::command($socket, 'AUTH LOGIN', [334])
                || !self::command($socket, base64_encode($identity['username']), [334])
                || !self::command($socket, base64_encode($identity['password']), [235])
                || !self::command($socket, 'MAIL FROM:<' . $identity['username'] . '>', [250])
                || !self::command($socket, 'RCPT TO:<' . $to . '>', [250, 251])
                || !self::command($socket, 'DATA', [354])) {
                return false;
            }

            $messageHeaders = array_merge([
                'Date: ' . date(DATE_RFC2822),
                'Message-ID: <' . bin2hex(random_bytes(12)) . '@princecaleb.dev>',
                'To: ' . $to,
                'Subject: ' . self::encodeHeader($subject),
            ], $headers);
            $payload = implode("\r\n", $messageHeaders) . "\r\n\r\n" . $body;
            $payload = preg_replace("/\r\n|\r|\n/", "\r\n", $payload);
            $payload = preg_replace('/(?m)^\./', '..', $payload);

            if (!self::writeAll($socket, $payload . "\r\n.\r\n") || !self::expect($socket, [250])) {
                return false;
            }
            self::command($socket, 'QUIT', [221]);
            return true;
        } catch (\Throwable $e) {
            error_log('Mailer SMTP failed: ' . $e->getMessage());
            return false;
        } finally {
            fclose($socket);
        }
    }

    /** @param resource $socket @param int[] $expected */
    private static function command($socket, string $command, array $expected): bool
    {
        return self::writeAll($socket, $command . "\r\n") && self::expect($socket, $expected);
    }

    /** @param resource $socket @param int[] $expected */
    private static function expect($socket, array $expected): bool
    {
        $response = '';
        do {
            $line = fgets($socket, 2048);
            if ($line === false) {
                error_log('Mailer SMTP connection closed before a response was received.');
                return false;
            }
            $response .= $line;
        } while (isset($line[3]) && $line[3] === '-');

        $code = (int) substr($response, 0, 3);
        if (!in_array($code, $expected, true)) {
            error_log(sprintf('Mailer SMTP rejected a command (code %d): %s', $code, trim($response)));
            return false;
        }
        return true;
    }

    /** @param resource $socket */
    private static function writeAll($socket, string $data): bool
    {
        $length = strlen($data);
        $written = 0;
        while ($written < $length) {
            $count = fwrite($socket, substr($data, $written));
            if ($count === false || $count === 0) {
                return false;
            }
            $written += $count;
        }
        return true;
    }

    private static function mailbox(string $name, string $address): string
    {
        $safeName = str_replace(["\r", "\n", '"'], ['', '', '\\"'], trim($name));
        return '"' . $safeName . '" <' . $address . '>';
    }

    private static function encodeHeader(string $value): string
    {
        return preg_match('/[^\x20-\x7E]/', $value)
            ? '=?UTF-8?B?' . base64_encode($value) . '?='
            : $value;
    }
}
