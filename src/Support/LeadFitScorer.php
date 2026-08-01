<?php

declare(strict_types=1);

namespace App\Support;

final class LeadFitScorer
{
    /** @return array{score:int,label:string,reasons:array<int,string>,qualified:bool} */
    public static function score(array $lead): array
    {
        $score = 20;
        $reasons = [];
        $audit = self::decode($lead['audit_findings'] ?? null);
        $research = self::decode($lead['research_findings'] ?? null);
        $hasWebsite = trim((string) ($lead['website_url'] ?? '')) !== '';
        $hasEmail = filter_var(trim((string) ($lead['contact_email'] ?? '')), FILTER_VALIDATE_EMAIL) !== false;
        $hasPhone = trim((string) ($lead['contact_phone'] ?? '')) !== '';

        if ($hasEmail) {
            $score += 20;
            $reasons[] = 'A verified email route is available.';
        } elseif ($hasPhone) {
            $score += 8;
            $reasons[] = 'A phone or WhatsApp route is available, but email still needs enrichment.';
        } else {
            $score -= 25;
            $reasons[] = 'No usable contact route is available yet.';
        }

        if (trim((string) ($lead['contact_name'] ?? '')) !== '') {
            $score += 5;
            $reasons[] = 'A named contact makes the outreach more personal.';
        }

        if (!$hasWebsite) {
            $score += 22;
            $reasons[] = 'No website is listed, creating a clear custom-platform opportunity.';
        } elseif ($audit === null) {
            $reasons[] = 'The website must be audited before fit can be confirmed.';
        } else {
            $issues = is_array($audit['issues'] ?? null) ? $audit['issues'] : [];
            $issueTypes = array_map(static fn($issue): string => is_array($issue) ? (string) ($issue['issue'] ?? '') : '', $issues);
            $broken = ($audit['reachable'] ?? true) === false
                || array_intersect(['unreachable', 'error_status', 'blank_page', 'error_page_content'], $issueTypes);
            if ($broken) {
                $score += 28;
                $reasons[] = 'The live audit found a broken or unreachable website.';
            } elseif ($issues !== []) {
                $score += min(20, 8 + count($issues) * 3);
                $reasons[] = count($issues) . ' verified website improvement' . (count($issues) === 1 ? '' : 's') . ' provide a specific outreach angle.';
            } else {
                $score += 15;
                $reasons[] = 'The website is healthy, so the offer should lead with AI and workflow automation.';
            }
        }

        if ($research !== null) {
            $score += 8;
            $reasons[] = 'A research dossier provides additional personalization evidence.';
        }

        $estimatedValue = (int) ($lead['estimated_value'] ?? 0);
        if ($estimatedValue >= 500000) {
            $score += 10;
            $reasons[] = 'The estimated opportunity value supports deeper personalization.';
        } elseif ($estimatedValue > 0) {
            $score += 5;
            $reasons[] = 'An estimated project value has been recorded.';
        }

        $score = max(0, min(100, $score));
        $label = $score >= 75 ? 'Strong fit' : ($score >= 55 ? 'Qualified' : ($score >= 35 ? 'Develop' : 'Low fit'));

        return [
            'score' => $score,
            'label' => $label,
            'reasons' => array_slice($reasons, 0, 5),
            'qualified' => $score >= 55,
        ];
    }

    public static function persist(\PDO $pdo, array $lead): array
    {
        $fit = self::score($lead);
        $reasons = json_encode($fit['reasons'], JSON_UNESCAPED_SLASHES);
        if ((int) ($lead['fit_score'] ?? -1) !== $fit['score']
            || (string) ($lead['fit_label'] ?? '') !== $fit['label']
            || (string) ($lead['fit_reasons'] ?? '') !== $reasons) {
            $pdo->prepare(
                "UPDATE marketing_leads SET fit_score=?, fit_label=?, fit_reasons=?, fit_scored_at=datetime('now') WHERE id=?"
            )->execute([$fit['score'], $fit['label'], $reasons, $lead['id']]);
        }
        return $fit;
    }

    private static function decode(mixed $value): ?array
    {
        if (is_array($value)) return $value;
        if (!is_string($value) || trim($value) === '') return null;
        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : null;
    }
}
