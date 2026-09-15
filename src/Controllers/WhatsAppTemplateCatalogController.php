<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\WhatsAppAssetRequestTemplateManager;
use App\Support\WhatsAppAppointmentReminderTemplateManager;
use App\Support\WhatsAppDeliveryReadyTemplateManager;
use App\Support\WhatsAppFeedbackRequestTemplateManager;
use App\Support\WhatsAppInvoiceReadyTemplateManager;
use App\Support\WhatsAppMilestoneUpdateTemplateManager;
use App\Support\WhatsAppPaymentReceivedTemplateManager;
use App\Support\WhatsAppRenewalReminderTemplateManager;
use App\Support\WhatsAppShowcaseFollowupTemplateManager;
use App\Support\WhatsAppTemplateManager;

/**
 * Read-only overview of every Lisa WhatsApp template this app knows about —
 * built ones (live status via each template's own manager) alongside
 * not-yet-built ones (reference only, so it's visible what could be
 * requested for this business or a client's). Each template still has its
 * own dedicated create/refresh/send endpoints (see the individual
 * WhatsApp*TemplateController classes and LiveChatController::sendXxx()) —
 * this endpoint only aggregates their status() output plus a human label so
 * the admin UI can show one list instead of one card per template.
 */
final class WhatsAppTemplateCatalogController
{
    /**
     * Built templates: key => [label, description, manager class, endpoint
     * slug used by the dedicated controller/routes, send endpoint, extra
     * template fields beyond contact name + phone (name => label)].
     *
     * @var array<string,array{label:string,description:string,manager:class-string,slug:string,send:string,fields:array<string,string>}>
     */
    private const BUILT = [
        'intro' => [
            'label' => 'Lisa intro',
            'description' => "Introduces Lisa to someone who messaged you somewhere other than Lisa's WhatsApp number.",
            'manager' => WhatsAppTemplateManager::class,
            'slug' => '', // irregular: status/create/refresh live at /whatsapp-template with no suffix
            'send' => '/api/v1/admin/whatsapp/send-intro',
            'fields' => [],
        ],
        'asset_request' => [
            'label' => 'Asset request',
            'description' => 'Asks an already-discussed client to send over something needed for their project (logo, IG link, etc).',
            'manager' => WhatsAppAssetRequestTemplateManager::class,
            'slug' => 'asset-request',
            'send' => '/api/v1/admin/whatsapp/send-asset-request',
            'fields' => ['request_text' => 'What to ask for'],
        ],
        'showcase_followup' => [
            'label' => 'Showcase follow-up',
            'description' => 'Checks in with a client already sent a demo showcase link (website + social pages) who hasn\'t replied.',
            'manager' => WhatsAppShowcaseFollowupTemplateManager::class,
            'slug' => 'showcase-followup',
            'send' => '/api/v1/admin/whatsapp/send-showcase-followup',
            'fields' => [],
        ],
        'invoice_ready' => [
            'label' => 'Invoice ready',
            'description' => 'Lets a client know their invoice is ready to view and pay.',
            'manager' => WhatsAppInvoiceReadyTemplateManager::class,
            'slug' => 'invoice-ready',
            'send' => '/api/v1/admin/whatsapp/send-invoice-ready',
            'fields' => ['var2' => 'What the invoice is for', 'var3' => 'Invoice/payment link'],
        ],
        'payment_received' => [
            'label' => 'Payment received',
            'description' => "Confirms a client's payment came through.",
            'manager' => WhatsAppPaymentReceivedTemplateManager::class,
            'slug' => 'payment-received',
            'send' => '/api/v1/admin/whatsapp/send-payment-received',
            'fields' => ['var2' => 'Amount', 'var3' => 'What it was for'],
        ],
        'appointment_reminder' => [
            'label' => 'Appointment reminder',
            'description' => 'Reminds a client about an upcoming call or meeting.',
            'manager' => WhatsAppAppointmentReminderTemplateManager::class,
            'slug' => 'appointment-reminder',
            'send' => '/api/v1/admin/whatsapp/send-appointment-reminder',
            'fields' => ['var2' => 'Date', 'var3' => 'Time'],
        ],
        'milestone_update' => [
            'label' => 'Milestone update',
            'description' => 'Tells a client a project milestone is done.',
            'manager' => WhatsAppMilestoneUpdateTemplateManager::class,
            'slug' => 'milestone-update',
            'send' => '/api/v1/admin/whatsapp/send-milestone-update',
            'fields' => ['var2' => 'Project', 'var3' => 'Milestone'],
        ],
        'delivery_ready' => [
            'label' => 'Delivery ready',
            'description' => "Tells a client something is ready for their review (a design, a build, a draft).",
            'manager' => WhatsAppDeliveryReadyTemplateManager::class,
            'slug' => 'delivery-ready',
            'send' => '/api/v1/admin/whatsapp/send-delivery-ready',
            'fields' => ['var2' => "What's ready", 'var3' => 'Link to review'],
        ],
        'renewal_reminder' => [
            'label' => 'Renewal reminder',
            'description' => "Reminds a client their plan or subscription is renewing soon.",
            'manager' => WhatsAppRenewalReminderTemplateManager::class,
            'slug' => 'renewal-reminder',
            'send' => '/api/v1/admin/whatsapp/send-renewal-reminder',
            'fields' => ['var2' => 'Plan', 'var3' => 'Renewal date'],
        ],
        'feedback_request' => [
            'label' => 'Feedback request',
            'description' => 'Asks a client for a review or testimonial after delivering their project.',
            'manager' => WhatsAppFeedbackRequestTemplateManager::class,
            'slug' => 'feedback-request',
            'send' => '/api/v1/admin/whatsapp/send-feedback-request',
            'fields' => ['var2' => 'What was delivered', 'var3' => 'Review link'],
        ],
    ];

    /**
     * Not-yet-built MARKETING templates — shown for reference only (no
     * manager/endpoints exist yet) so it's visible what could be requested
     * for this business or a client's, without generating a Twilio resource
     * for something nobody has asked to actually use yet. Each needs an
     * opt-in trail and gets stricter Meta review than a UTILITY template.
     *
     * @var array<int,array{label:string,description:string,sample:string}>
     */
    private const PLANNED_MARKETING = [
        [
            'label' => 'Re-engagement ("we miss you")',
            'description' => 'Reminds a past lead or dormant client you\'re still available, inviting them back in.',
            'sample' => "Hi {{1}}, it's been a while — still interested in refreshing your website? Let's chat.",
        ],
        [
            'label' => 'New service launch',
            'description' => 'Announces a new offering to leads/clients who opted in.',
            'sample' => "Hi {{1}}, we're now offering {{2}} — want a free consultation this week?",
        ],
        [
            'label' => 'Limited-time offer',
            'description' => 'A discount or promo push with a deadline.',
            'sample' => "Hi {{1}}, book a website redesign this month and get {{2}}% off. Reply YES to learn more.",
        ],
        [
            'label' => 'Case study share',
            'description' => 'Shows off a recently finished project to prompt similar work.',
            'sample' => "Hi {{1}}, we just wrapped up a project for {{2}} — check it out: {{3}}. Want something similar?",
        ],
        [
            'label' => 'Event/webinar invite',
            'description' => 'Invites leads/clients to an upcoming live event.',
            'sample' => "Hi {{1}}, join our free webinar on {{2}} at {{3}}. Reserve your spot: {{4}}",
        ],
    ];

    /** GET /api/v1/admin/whatsapp-templates */
    public static function index(): void
    {
        AuthMiddleware::requireAuth();

        $templates = [];
        foreach (self::BUILT as $key => $meta) {
            /** @var class-string $manager */
            $manager = $meta['manager'];
            $status = $manager::status();
            $templates[] = [
                'key' => $key,
                'label' => $meta['label'],
                'description' => $meta['description'],
                'status_url' => '/api/v1/admin/whatsapp-template' . ($meta['slug'] !== '' ? '/' . $meta['slug'] : ''),
                'create_url' => '/api/v1/admin/whatsapp-template' . ($meta['slug'] !== '' ? '/' . $meta['slug'] : ''),
                'refresh_url' => '/api/v1/admin/whatsapp-template' . ($meta['slug'] !== '' ? '/' . $meta['slug'] : '') . '/refresh',
                'send_url' => $meta['send'],
                'fields' => (object) $meta['fields'],
            ] + $status;
        }

        Response::json([
            'templates' => $templates,
            'planned_marketing' => self::PLANNED_MARKETING,
        ]);
    }
}
