<?php

declare(strict_types=1);

namespace App\Support;

/**
 * RFC 6238 TOTP (Google Authenticator / Authy compatible), hand-rolled since
 * this project takes no Composer dependencies. 30-second step, 6 digits,
 * SHA1 — the universal default every authenticator app supports.
 */
class Totp
{
    private const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    private const STEP_SECONDS = 30;

    public static function generateSecret(int $bytes = 20): string
    {
        return self::base32Encode(random_bytes($bytes));
    }

    /** otpauth:// URI for authenticator apps that support importing via link/QR. */
    public static function provisioningUri(string $secret, string $accountLabel, string $issuer = 'Prince Caleb Admin'): string
    {
        $label = rawurlencode($issuer) . ':' . rawurlencode($accountLabel);
        return 'otpauth://totp/' . $label . '?secret=' . $secret . '&issuer=' . rawurlencode($issuer)
            . '&algorithm=SHA1&digits=6&period=' . self::STEP_SECONDS;
    }

    /** @param int $window how many 30s steps of clock drift either side to tolerate */
    public static function verify(string $secret, string $code, int $window = 1): bool
    {
        $code = preg_replace('/\s+/', '', $code) ?? '';
        if (!preg_match('/^\d{6}$/', $code)) {
            return false;
        }
        $counter = intdiv(time(), self::STEP_SECONDS);
        for ($i = -$window; $i <= $window; $i++) {
            if (hash_equals(self::hotp($secret, $counter + $i), $code)) {
                return true;
            }
        }
        return false;
    }

    private static function hotp(string $base32Secret, int $counter): string
    {
        $key = self::base32Decode($base32Secret);
        $binCounter = pack('N*', 0, $counter); // 8 bytes, big-endian 64-bit counter
        $hash = hash_hmac('sha1', $binCounter, $key, true);
        $offset = ord($hash[19]) & 0x0F;
        $truncated = ((ord($hash[$offset]) & 0x7F) << 24)
            | ((ord($hash[$offset + 1]) & 0xFF) << 16)
            | ((ord($hash[$offset + 2]) & 0xFF) << 8)
            | (ord($hash[$offset + 3]) & 0xFF);
        return str_pad((string) ($truncated % 1000000), 6, '0', STR_PAD_LEFT);
    }

    private static function base32Encode(string $data): string
    {
        $bits = '';
        foreach (str_split($data) as $char) {
            $bits .= str_pad(decbin(ord($char)), 8, '0', STR_PAD_LEFT);
        }
        $output = '';
        foreach (str_split($bits, 5) as $chunk) {
            $chunk = str_pad($chunk, 5, '0', STR_PAD_RIGHT);
            $output .= self::BASE32_ALPHABET[bindec($chunk)];
        }
        return $output;
    }

    private static function base32Decode(string $secret): string
    {
        $secret = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $secret) ?? '');
        $bits = '';
        foreach (str_split($secret) as $char) {
            $val = strpos(self::BASE32_ALPHABET, $char);
            if ($val === false) {
                continue;
            }
            $bits .= str_pad(decbin($val), 5, '0', STR_PAD_LEFT);
        }
        $bytes = '';
        foreach (str_split($bits, 8) as $byte) {
            if (strlen($byte) < 8) {
                break; // discard incomplete trailing bits
            }
            $bytes .= chr(bindec($byte));
        }
        return $bytes;
    }
}
