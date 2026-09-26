<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Shared plumbing for Jev (TypeSafe) as a decision layer across every agent.
 * The rule everywhere: Jev decides first, code applies fixed rules to what Jev
 * says, and the AI providers only write words afterwards. Nothing here calls
 * an AI provider.
 *
 * Three independent areas, each `shadow` (default), `live` or `off`:
 *   agent_jev_owner_mode     what agents send to the owner (OwnerMessages)
 *   agent_jev_customer_mode  what agents send to customers (CustomerMessages)
 *   agent_jev_decisions_mode agents' own judgment calls (Chloe, Chief, Allie, Nurturer, Sage)
 *
 * Shadow records what would have happened in agent_decisions and changes
 * nothing. Every path fails open: if Jev is unavailable the agent does exactly
 * what it did before.
 */
final class AgentJudgment
{
    public const AREAS = ['owner' => 'agent_jev_owner_mode', 'customer' => 'agent_jev_customer_mode', 'decisions' => 'agent_jev_decisions_mode'];

    public static function mode(string $area): string
    {
        $mode = strtolower(trim((string) Settings::get(self::AREAS[$area] ?? '')));
        return in_array($mode, ['off', 'live'], true) ? $mode : 'shadow';
    }

    /** Is Jev usable at all? Without a key every layer silently does nothing. */
    public static function available(): bool
    {
        return TypeSafeClient::hasKey();
    }

    /**
     * Append to the audit trail. Never throws: an audit row must not break an agent.
     *
     * @param array<string,mixed>|null $jev the raw readings behind the decision
     */
    public static function record(string $area, string $agent, string $kind, ?string $ref, string $mode, ?array $jev, string $decision, ?string $detail = null, ?string $outcome = null): void
    {
        try {
            Database::get()->prepare(
                'INSERT INTO agent_decisions (area, agent, kind, ref, mode, jev_json, decision, detail, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $area, $agent, $kind, $ref, $mode, $jev === null ? null : json_encode($jev), $decision,
                $detail === null ? null : mb_substr($detail, 0, 500), $outcome === null ? null : mb_substr($outcome, 0, 300),
            ]);
        } catch (\Throwable $e) {
            error_log('AgentJudgment: could not record decision: ' . $e->getMessage());
        }
    }

    /** A yes/no question in the shape the TypeSafe API wants. */
    public static function yesNo(string $question, string $yes, string $no): array
    {
        return ['type' => 'noul', 'instructions' => $question, 'criteria' => ['true' => $yes, 'false' => $no]];
    }

    /** Local time in the site's timezone, for schedules and quiet hours. */
    public static function localNow(): \DateTime
    {
        $tz = Settings::get('chat_timezone') ?: 'Africa/Accra';
        try {
            return new \DateTime('now', new \DateTimeZone($tz));
        } catch (\Exception $e) {
            return new \DateTime('now', new \DateTimeZone('UTC'));
        }
    }
}
