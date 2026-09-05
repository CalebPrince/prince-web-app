<?php

declare(strict_types=1);

namespace App\Support;

/** Shared checks for a reviewable agreement. No invented project-specific terms. */
final class ProjectAgreement
{
    public static function missing(array $proposal): array
    {
        $missing = [];
        foreach (['scope' => 'scope and deliverables', 'timeline' => 'timeline', 'terms' => 'project terms'] as $key => $label) {
            if (trim((string) ($proposal[$key] ?? '')) === '') $missing[] = $label;
        }
        $milestones = $proposal['milestones'] ?? [];
        if (!$milestones || (int) ($milestones[0]['amount'] ?? 0) <= 0) $missing[] = 'initial payment milestone';
        return $missing;
    }

    /** A stale browser must not accept scope or prices changed after review. */
    public static function version(array $proposal): string
    {
        $fields = [];
        foreach (['title', 'scope', 'timeline', 'terms', 'currency', 'total_amount', 'client_name', 'client_email'] as $key) {
            $fields[$key] = $proposal[$key] ?? null;
        }
        $fields['milestones'] = array_map(static fn(array $m): array => [
            'title' => $m['title'], 'amount' => $m['amount'], 'currency' => $m['currency'], 'due_note' => $m['due_note'],
        ], $proposal['milestones'] ?? []);
        return hash('sha256', json_encode($fields, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    public static function readyToStart(array $proposal): bool
    {
        return ($proposal['status'] ?? '') === 'accepted'
            && ($proposal['milestones'][0]['payment_status'] ?? '') === 'paid';
    }
}
