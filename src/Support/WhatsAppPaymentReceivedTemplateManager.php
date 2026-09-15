<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Template for confirming a client's payment came through, when they
 * haven't written in to Lisa's connected number before.
 *
 * Shares its Twilio Content API plumbing with the other template managers
 * via WhatsAppContentTemplateManager.
 */
final class WhatsAppPaymentReceivedTemplateManager extends WhatsAppContentTemplateManager
{
    protected const NAME = 'payment_received';
    protected const LANGUAGE = 'en';

    /** A receipt for an existing transaction, not a promotion, so UTILITY. */
    protected const CATEGORY = 'UTILITY';

    /**
     * {{1}} contact's name, {{2}} the amount, {{3}} what it was for — all
     * filled in by LiveChatController::sendPaymentReceived().
     */
    protected const BODY = "Hi {{1}}, this is Lisa, Prince Caleb's assistant. "
        . "We've received your payment of {{2}} for {{3}}. Thank you!";

    protected const SAMPLE_VARIABLES = ['1' => 'Ama', '2' => 'GHS 500', '3' => 'your website project'];
    protected const SID_SETTING = 'twilio_payment_received_content_sid';
    protected const STATUS_SETTING = 'twilio_payment_received_template_status';
}
