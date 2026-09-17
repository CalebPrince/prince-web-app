<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Template for letting a client know their invoice is ready to view/pay,
 * when they haven't written in to Lisa's connected number before.
 *
 * Shares its Twilio Content API plumbing with the other template managers
 * via WhatsAppContentTemplateManager.
 */
final class WhatsAppInvoiceReadyTemplateManager extends WhatsAppContentTemplateManager
{
    protected const NAME = 'invoice_ready';
    protected const LANGUAGE = 'en';

    /** A notice about an existing invoice, not a promotion, so UTILITY. */
    protected const CATEGORY = 'UTILITY';

    /**
     * {{1}} contact's name, {{2}} what the invoice is for, {{3}} the link to
     * view/pay it — all filled in by LiveChatController::sendInvoiceReady().
     *
     * Dropped "and pay" from the original wording: Meta rejected that version
     * under WhatsApp business-initiated approval, most likely because a link
     * paired with payment language matches a common phishing template shape.
     */
    protected const BODY = "Hi {{1}}, this is Lisa, Prince Caleb's assistant. "
        . "Your invoice for {{2}} is ready — you can view it here: {{3}}";

    protected const SAMPLE_VARIABLES = ['1' => 'Ama', '2' => 'your website project', '3' => 'https://princecaleb.dev/invoice/123'];
    protected const SID_SETTING = 'twilio_invoice_ready_content_sid';
    protected const STATUS_SETTING = 'twilio_invoice_ready_template_status';
}
