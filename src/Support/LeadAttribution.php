<?php

declare(strict_types=1);

namespace App\Support;

use PDO;

final class LeadAttribution
{
    public static function capture(PDO $pdo, string $sourceType, int $sourceId, mixed $payload): void
    {
        if (!is_array($payload) || $sourceId < 1 || !in_array($sourceType, ['inquiry', 'booking', 'chat'], true)) {
            return;
        }

        $limits = ['landing_path' => 500, 'referrer' => 1000, 'utm_source' => 255, 'utm_medium' => 255,
            'utm_campaign' => 255, 'utm_content' => 255, 'utm_term' => 255];
        $values = [];
        foreach ($limits as $key => $limit) {
            $value = trim((string) ($payload[$key] ?? ''));
            $values[$key] = $value === '' ? null : mb_substr($value, 0, $limit);
        }
        if (!array_filter($values)) return;

        try {
            $pdo->prepare(
                'INSERT OR IGNORE INTO lead_attribution
                 (source_type, source_id, landing_path, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([$sourceType, $sourceId, $values['landing_path'], $values['referrer'], $values['utm_source'],
                $values['utm_medium'], $values['utm_campaign'], $values['utm_content'], $values['utm_term']]);
        } catch (\Throwable $e) {
            error_log('Lead attribution capture failed: ' . $e->getMessage());
        }
    }
}
