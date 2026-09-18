<?php

declare(strict_types=1);

namespace App\Support;

use App\Controllers\DripController;

/**
 * The trigger side of the email-automations engine. Lifecycle code across the
 * app (a new inquiry, a proposal sent, a payment received, …) calls
 * Automations::fire() with the event name and the contact; fire() enrolls that
 * contact into every ACTIVE automation whose trigger_event matches, and the
 * send crons (send_drip_emails.php / send_nurturer_emails.php) take it from
 * there. The steps of a brand-new automation ship inactive and an automation
 * itself ships inactive, so wiring a trigger up can never actually email anyone
 * until the copy has been reviewed and the automation switched on.
 */
class Automations
{
    /**
     * Every trigger the engine understands. 'manual' has no lifecycle hook —
     * it's the bucket for hand-enrolled contacts. Keep this in step with the
     * trigger_event CHECK in schema.sql and AutomationController::TRIGGERS.
     */
    public const TRIGGERS = [
        'manual',
        'marketing_pitch_sent',
        'inquiry_created',
        'quote_requested',
        'proposal_sent',
        'payment_received',
        'appointment_booked',
        'project_completed',
        'newsletter_subscribed',
        'chat_lead_captured',
        'pipeline_stage_changed',
    ];

    /**
     * Enroll a contact into every active automation triggered by $event.
     *
     * Deliberately forgiving: a missing/invalid email is a no-op (lifecycle
     * hooks shouldn't have to guard every call), duplicates are ignored per
     * automation (INSERT OR IGNORE on the (automation_id, email) unique), and
     * any single enrollment failure is swallowed so a trigger can never break
     * the request that fired it. Returns how many automations the contact was
     * newly enrolled into.
     *
     * @param array{
     *   name?:?string, source?:string, lead_id?:?int,
     *   lead_industry?:?string, last_action?:?string, nurturer_enabled?:bool,
     *   phone?:?string
     * } $opts
     * @param ?string $stage Only relevant to the 'pipeline_stage_changed'
     *        event — the stage the lead just moved into. Matches automations
     *        whose trigger_stage is NULL (any stage) or equal to this value.
     */
    public static function fire(string $event, string $email, array $opts = [], ?\PDO $pdo = null, ?string $stage = null): int
    {
        $email = trim($email);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return 0;
        }

        $pdo ??= Database::get();

        try {
            $stmt = $pdo->prepare(
                'SELECT id, nurturer_enabled FROM automations
                 WHERE trigger_event = ? AND is_active = 1 AND (trigger_stage IS NULL OR trigger_stage = ?)'
            );
            $stmt->execute([$event, $stage]);
            $automations = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $e) {
            error_log('Automations::fire lookup failed for ' . $event . ': ' . $e->getMessage());
            return 0;
        }

        $enrolled = 0;
        foreach ($automations as $automation) {
            try {
                // A contact inherits the automation's Nurturer setting unless the
                // caller overrides it — so turning Nurturer on for an automation
                // opts in every contact its trigger later enrols, automatically.
                // Jason owns the complete email cold-lead lifecycle. A sent
                // marketing pitch therefore always enters his reply-aware
                // follow-up queue; other automation types keep their explicit
                // per-automation setting.
                $nurturerEnabled = $event === 'marketing_pitch_sent'
                    ? true
                    : ($opts['nurturer_enabled'] ?? (bool) $automation['nurturer_enabled']);
                $created = DripController::enrollEmail(
                    $pdo,
                    (int) $automation['id'],
                    $email,
                    $opts['name'] ?? null,
                    $opts['source'] ?? 'trigger',
                    $opts['lead_id'] ?? null,
                    $nurturerEnabled,
                    $opts['lead_industry'] ?? null,
                    $opts['last_action'] ?? null,
                    $opts['phone'] ?? null
                );
                if ($created) {
                    $enrolled++;
                }
            } catch (\Throwable $e) {
                error_log('Automations::fire enroll into #' . ($automation['id'] ?? 'unknown') . ' failed: ' . $e->getMessage());
            }
        }

        return $enrolled;
    }
}
