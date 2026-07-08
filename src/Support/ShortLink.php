<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Tiny self-hosted URL shortener — mainly so AI-drafted social posts (see
 * SocialDraftController) can link back to a blog post/case study without
 * burning most of X/Twitter's character budget on a long querystring URL.
 * One row per distinct target URL; getOrCreate() reuses the existing code
 * rather than minting a new one each time the same page is referenced.
 */
class ShortLink
{
    public static function getOrCreate(string $targetUrl): string
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT code FROM short_links WHERE target_url = ?');
        $stmt->execute([$targetUrl]);
        $existing = $stmt->fetch();
        if ($existing) {
            return self::absoluteUrl('/s/' . $existing['code']);
        }

        do {
            $code = bin2hex(random_bytes(4));
            $stmt = $pdo->prepare('SELECT id FROM short_links WHERE code = ?');
            $stmt->execute([$code]);
        } while ($stmt->fetch());

        $pdo->prepare('INSERT INTO short_links (code, target_url) VALUES (?, ?)')->execute([$code, $targetUrl]);

        return self::absoluteUrl('/s/' . $code);
    }

    /** @return string|null the target URL to redirect to, or null if the code doesn't exist */
    public static function resolve(string $code): ?string
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT id, target_url FROM short_links WHERE code = ?');
        $stmt->execute([$code]);
        $link = $stmt->fetch();
        if (!$link) {
            return null;
        }

        $pdo->prepare('UPDATE short_links SET clicks = clicks + 1 WHERE id = ?')->execute([$link['id']]);

        return $link['target_url'];
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
