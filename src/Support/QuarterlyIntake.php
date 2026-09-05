<?php

declare(strict_types=1);

namespace App\Support;

/** Remaining places are managed in Site Content, not consumed by inquiries. */
final class QuarterlyIntake
{
    public const PROJECT_LIMIT = 6;

    public static function remaining(?string $raw): int
    {
        if ($raw === null || trim($raw) === '') return 2;
        return max(0, min(self::PROJECT_LIMIT, (int) $raw));
    }

    public static function isClosed(): bool
    {
        return strtolower(trim((string) Settings::get('quarterly_project_status'))) === 'closed'
            || self::remaining(Settings::get('quarterly_project_slots')) === 0;
    }
}
