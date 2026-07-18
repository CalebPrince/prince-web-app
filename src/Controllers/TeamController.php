<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Agents\Arch;
use App\Middleware\AuthMiddleware;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;

/**
 * The "team" behind the studio: Caleb (the human owner) plus the AI agents that
 * actually run day to day — Lisa on chat/booking, Nurturer on email follow-up,
 * Beacon scouting leads, Dossier researching them, and the on-demand Proposal
 * and Content writers. Each
 * agent's display name is admin-configurable (Settings), so this reads those
 * rather than hardcoding, and attaches a live headline stat and a real status
 * so the page is a genuine at-a-glance roster, not a static brochure.
 *
 * Admin-only, read-only.
 */
class TeamController
{
    /** GET /api/v1/admin/team */
    public static function index(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();

        $nurturerActive = (int) $pdo->query(
            "SELECT COUNT(*) FROM automations WHERE nurturer_enabled = 1 AND is_active = 1"
        )->fetchColumn() > 0;
        $beaconEnabled = (string) Settings::get('beacon_discovery_enabled') === '1';

        $agents = [
            [
                'key' => 'lisa',
                'name' => Settings::get('chat_assistant_name') ?: 'Lisa',
                'role' => 'Booking & Live Chat Agent',
                'description' => 'Greets visitors on the live chat, answers questions about your work, and books discovery calls straight into your calendar.',
                'icon' => 'bi-headset',
                'status' => 'active',
                'status_label' => 'Live on site',
                'stat_value' => (int) $pdo->query('SELECT COUNT(*) FROM appointments')->fetchColumn(),
                'stat_label' => 'calls booked',
                'manage_url' => '/admin/chats.html',
                'manage_label' => 'Chat leads',
            ],
            [
                'key' => 'nurturer',
                'name' => Settings::get('nurturer_assistant_name') ?: 'Nurturer',
                'role' => 'AI Email Marketer',
                'description' => 'Writes hyper-personalized follow-up emails for leads based on their industry and what they did on the site — the AI sequence inside your automations.',
                'icon' => 'bi-envelope-heart',
                'status' => $nurturerActive ? 'active' : 'standby',
                'status_label' => $nurturerActive ? 'Sending' : 'On standby',
                // Nurturer owns the full automation journey: fixed-template
                // steps are recorded in drip_sends and its AI-personalized
                // sequence 2/3 messages are recorded in nurturer_sends.
                'stat_value' => (int) $pdo->query(
                    'SELECT (SELECT COUNT(*) FROM drip_sends) + (SELECT COUNT(*) FROM nurturer_sends)'
                )->fetchColumn(),
                'stat_label' => 'emails sent',
                'manage_url' => '/admin/drip.html',
                'manage_label' => 'Automations',
            ],
            [
                'key' => 'beacon',
                'name' => Settings::get('beacon_assistant_name') ?: 'Beacon',
                'role' => 'Social Lead Scout',
                'description' => 'Scans social platforms for people asking for exactly what you offer, scores them, and drafts a reply so you can reach out warm.',
                'icon' => 'bi-broadcast-pin',
                'status' => $beaconEnabled ? 'active' : 'paused',
                'status_label' => $beaconEnabled ? 'Scouting' : 'Paused',
                'stat_value' => (int) $pdo->query('SELECT COUNT(*) FROM beacon_social_leads')->fetchColumn(),
                'stat_label' => 'leads found',
                'manage_url' => '/admin/marketing-leads.html',
                'manage_label' => 'Marketing leads',
            ],
            [
                'key' => 'dossier',
                'name' => Settings::get('dossier_assistant_name') ?: 'Dossier',
                'role' => 'Lead Research Analyst',
                'description' => 'Builds a research brief on a marketing lead — real tech-stack fingerprint, recent news, and a grounded outreach angle — so you reach out warm instead of cold.',
                'icon' => 'bi-search',
                'status' => 'ondemand',
                'status_label' => 'On demand',
                // Leads Dossier has actually researched — researched_at is set
                // the moment research() writes a brief, so this counts real
                // work done, not leads that merely could be researched.
                'stat_value' => (int) $pdo->query('SELECT COUNT(*) FROM marketing_leads WHERE researched_at IS NOT NULL')->fetchColumn(),
                'stat_label' => 'leads researched',
                'manage_url' => '/admin/marketing-leads.html',
                'manage_label' => 'Marketing leads',
            ],
            [
                'key' => 'proposal',
                // 'Ledger', not 'Proposal Writer' — matches the fallback name
                // Talk to Agents and Site Content use for this agent when no
                // custom name is set. They used to disagree, so the same
                // unnamed agent showed a different name on each page.
                'name' => Settings::get('proposal_assistant_name') ?: 'Ledger',
                'role' => 'Proposal Writer',
                'description' => 'Turns a project request or a short brief into a full, on-brand proposal — scope, timeline, and payment milestones — ready for you to review and send.',
                'icon' => 'bi-file-earmark-text',
                'status' => 'ondemand',
                'status_label' => 'On demand',
                'stat_value' => (int) $pdo->query('SELECT COUNT(*) FROM proposals')->fetchColumn(),
                'stat_label' => 'proposals drafted',
                'manage_url' => '/admin/proposals.html',
                'manage_label' => 'Proposals',
            ],
            [
                'key' => 'content',
                // 'Canvas', not 'Content Creator' — same fix as 'proposal'
                // above: match the fallback name used elsewhere.
                'name' => Settings::get('content_assistant_name') ?: 'Canvas',
                'role' => 'Content & Social Creator',
                'description' => 'Drafts blog posts, social captions, and marketing images so your presence stays active without eating your build time.',
                'icon' => 'bi-images',
                'status' => 'ondemand',
                'status_label' => 'On demand',
                // content_studio_items, not social_post_drafts — that's a
                // separate, older pipeline Content Studio doesn't show, so
                // counting it here made this stat disagree with the page it
                // links to.
                'stat_value' => (int) $pdo->query('SELECT COUNT(*) FROM content_studio_items')->fetchColumn(),
                'stat_label' => 'drafts created',
                'manage_url' => '/admin/content-studio.html',
                'manage_label' => 'Content Studio',
            ],
            [
                'key' => 'arch',
                'name' => Settings::get('arch_assistant_name') ?: 'Arch',
                'role' => 'AI Website Builder',
                'description' => 'Chats a client through their requirements and builds them a complete, deployable, mobile-first website — with an optional password-protected CMS to edit it later.',
                'icon' => 'bi-hammer',
                // "Building" — a brand-new agent still proving itself, shown with
                // the same blue dot as the on-demand agents (see admin-team.js).
                'status' => 'building',
                'status_label' => 'Building',
                'stat_value' => Arch::sitesBuilt($pdo),
                'stat_label' => 'sites built',
                'manage_url' => '/chat.html',
                'manage_label' => 'Open builder',
            ],
        ];

        Response::json([
            'owner' => [
                'name' => Settings::get('site_owner_name') ?: 'Prince Caleb',
                'role' => 'Founder & Lead Developer',
                'tagline' => 'Premium web design & mobile app development — the human the agents work for.',
            ],
            'agents' => $agents,
        ]);
    }
}
