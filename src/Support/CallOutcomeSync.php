<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Keeps Twilio's final outbound call status and the Marketing Leads call log
 * in agreement. Only retryable delivery failures are automatic: a completed
 * call still needs a human/recipient outcome instead of being guessed.
 */
final class CallOutcomeSync
{
    private const RETRYABLE_STATUSES = [
        'no-answer' => 'The recipient did not answer.',
        'busy' => 'The number was busy.',
        'failed' => 'Twilio could not complete the call.',
        'canceled' => 'The call was canceled before it connected.',
    ];

    public static function record(\PDO $pdo, string $callSid, string $status): bool
    {
        $callSid = trim($callSid);
        $status = strtolower(str_replace('_', '-', trim($status)));
        if ($callSid === '' || !isset(self::RETRYABLE_STATUSES[$status])) {
            return false;
        }

        $stmt = $pdo->prepare(
            "SELECT marketing_lead_id
             FROM telephony_calls
             WHERE provider_call_id = ?
               AND direction = 'outbound'
               AND marketing_lead_id IS NOT NULL
             LIMIT 1"
        );
        $stmt->execute([$callSid]);
        $leadId = (int) ($stmt->fetchColumn() ?: 0);
        if ($leadId < 1) {
            return false;
        }

        $note = sprintf(
            'Lisa AI call: %s Twilio status: %s. Call SID: %s',
            self::RETRYABLE_STATUSES[$status],
            $status,
            $callSid
        );
        $insert = $pdo->prepare(
            "INSERT INTO call_log (lead_id, outcome, notes)
             SELECT ?, 'no_answer', ?
             WHERE NOT EXISTS (
               SELECT 1 FROM call_log WHERE lead_id = ? AND notes = ?
             )"
        );
        $insert->execute([$leadId, $note, $leadId, $note]);
        return $insert->rowCount() > 0;
    }

    /**
     * Repairs calls whose final callback arrived before this synchronization
     * was deployed. Safe to run whenever the call list opens.
     */
    public static function reconcile(\PDO $pdo): int
    {
        $rows = $pdo->query(
            "SELECT provider_call_id, status
             FROM telephony_calls
             WHERE direction = 'outbound'
               AND marketing_lead_id IS NOT NULL
               AND lower(replace(status, '_', '-')) IN ('no-answer', 'busy', 'failed', 'canceled')"
        )->fetchAll();
        $added = 0;
        foreach ($rows as $row) {
            if (self::record($pdo, (string) $row['provider_call_id'], (string) $row['status'])) {
                $added++;
            }
        }
        return $added;
    }
}
