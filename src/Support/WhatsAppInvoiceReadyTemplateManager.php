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
     * {{1}} contact's name, {{2}} what the invoice is for, {{3}} the invoice
     * token — all filled in by LiveChatController::sendInvoiceReady().
     *
     * Meta rejected the original body twice (with and without "pay"): every
     * other approved template in this account has no link at all, so the
     * real problem is a raw URL sitting in body text, not the wording. The
     * link now goes out as a proper URL button instead, whose target must be
     * a fixed base URL plus a {{n}} suffix — not a whole variable URL.
     */
    protected const BODY = "Hi {{1}}, this is Lisa, Prince Caleb's assistant. "
        . "Your invoice for {{2}} is ready to view.";

    protected const BUTTON_TEXT = 'View invoice';
    protected const BUTTON_URL = 'https://princecaleb.dev/invoice?token={{3}}';

    protected const SAMPLE_VARIABLES = ['1' => 'Ama', '2' => 'your website project', '3' => 'sample-token-123'];
    protected const SID_SETTING = 'twilio_invoice_ready_content_sid';
    protected const STATUS_SETTING = 'twilio_invoice_ready_template_status';
}
