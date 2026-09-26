<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\WhatsAppAssetRequestTemplateManager;
use App\Support\WhatsAppAppointmentReminderTemplateManager;
use App\Support\WhatsAppDeliveryReadyTemplateManager;
use App\Support\WhatsAppConversationFollowupTemplateManager;
use App\Support\WhatsAppDripFollowupTemplateManager;
use App\Support\WhatsAppFeedbackRequestTemplateManager;
use App\Support\WhatsAppInvoiceReadyTemplateManager;
use App\Support\WhatsAppMilestoneUpdateTemplateManager;
use App\Support\WhatsAppOwnerAlertTemplateManager;
use App\Support\WhatsAppPaymentReceivedTemplateManager;
use App\Support\WhatsAppProjectKickoffTemplateManager;
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
     * template fields beyond contact name + phone (name => label), and
     * whether its controller has a destroy() wired up for delete+rebuild
     * (only worth adding once a template actually needs rebuilding after a
     * Meta rejection — see WhatsAppInvoiceReadyTemplateController).
     *
     * @var array<string,array{label:string,description:string,manager:class-string,slug:string,send:string,fields:array<string,string>,deletable?:bool}>
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
            'description' => 'Asks an already-discussed client to send over something needed for their project (logo, IG link, etc). Worded for a website project specifically.',
            'manager' => WhatsAppAssetRequestTemplateManager::class,
            'slug' => 'asset-request',
            'send' => '/api/v1/admin/whatsapp/send-asset-request',
            'fields' => ['request_text' => 'What to ask for'],
        ],
        'project_kickoff' => [
            'label' => 'Project kickoff',
            'description' => 'Generic "ready to start, send me what I need" message for any already-discussed project — a WhatsApp agent, an automation build, or anything that isn\'t a website (use Asset request for those).',
            'manager' => WhatsAppProjectKickoffTemplateManager::class,
            'slug' => 'project-kickoff',
            'send' => '/api/v1/admin/whatsapp/send-project-kickoff',
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
            'deletable' => true,
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
            'deletable' => true,
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
            'fields' => ['var2' => "What's ready"],
            'deletable' => true,
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
            'fields' => ['var2' => 'What was delivered'],
            'deletable' => true,
        ],
        'conversation_followup' => [
            'label' => 'Conversation follow-up',
            'description' => 'Picks a conversation back up after the 24 hour WhatsApp window has closed, for someone who wrote to Lisa and went quiet. Marketing category. Lisa sends it automatically when the follow-up engine is live, and you can send it by hand too.',
            'manager' => WhatsAppConversationFollowupTemplateManager::class,
            'slug' => 'conversation-followup',
            'send' => '/api/v1/admin/whatsapp/send-conversation-followup',
            'fields' => [],
        ],
        'drip_followup' => [
            'label' => 'Drip follow-up',
            'description' => 'Cold-lead outreach to someone who has never spoken to Lisa or Caleb. Marketing category, so Meta reviews it more strictly. Sent by hand only.',
            'manager' => WhatsAppDripFollowupTemplateManager::class,
            'slug' => 'drip-followup',
            'send' => '/api/v1/admin/whatsapp/send-drip-followup',
            'fields' => [],
        ],
        'owner_alert' => [
            'label' => 'Owner alert',
            'description' => 'Lets Chief, Chloe, Allie, Wendy, Lisa and the social draft reminder reach YOUR WhatsApp at any time. Plain text only works within 24h of your last message to the Twilio number. Sent by the system, never by hand.',
            'manager' => WhatsAppOwnerAlertTemplateManager::class,
            'slug' => 'owner-alert',
            'send' => '',
            'fields' => [],
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
            $base = '/api/v1/admin/whatsapp-template' . ($meta['slug'] !== '' ? '/' . $meta['slug'] : '');
            $templates[] = [
                'key' => $key,
                'label' => $meta['label'],
                'description' => $meta['description'],
                'status_url' => $base,
                'create_url' => $base,
                'refresh_url' => $base . '/refresh',
                'delete_url' => ($meta['deletable'] ?? false) ? $base : null,
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
