<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Agents\Arch;
use App\Agents\Chief;
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
        $capacity = self::projectCapacity($pdo);
        // Guarded like archActivity() below — keeps the Team page usable
        // during the short deploy window before mockup_image_url's
        // migration has actually run on this database.
        try {
            $mockupsGenerated = (int) $pdo->query('SELECT COUNT(*) FROM proposals WHERE mockup_image_url IS NOT NULL')->fetchColumn();
        } catch (\Throwable $e) {
            $mockupsGenerated = 0;
        }
        $briefsWritten = Chief::briefsWritten($pdo);

        $agents = [
            [
                'key' => 'lisa',
                'name' => Settings::get('chat_assistant_name') ?: 'Lisa',
                'role' => 'Booking & Live Chat Agent',
                'description' => 'Greets visitors on the live chat, answers questions about your work, and books discovery calls straight into your calendar.',
                'icon' => 'bi-headset',
                'status' => 'active',
                'status_label' => 'Live on site',
                // A captured contact and a completed booking are different
                // outcomes. Lead details land on chat_sessions first; only a
                // visitor who finishes scheduling creates an appointment.
                'stat_value' => (int) $pdo->query(
                    "SELECT COUNT(*) FROM (
                        SELECT lower(client_email) AS email FROM chat_sessions
                        WHERE client_email IS NOT NULL AND client_email != ''
                        UNION
                        SELECT lower(email) AS email FROM inquiries
                        WHERE message LIKE '[Live Chat]%' AND email != ''
                        UNION
                        SELECT lower(de.email) AS email
                        FROM drip_enrollments de
                        JOIN automations a ON a.id=de.automation_id
                        WHERE a.trigger_event='chat_lead_captured' AND de.email != ''
                    )"
                )->fetchColumn(),
                'stat_label' => 'leads captured',
                'secondary_stat_value' => (int) $pdo->query('SELECT COUNT(*) FROM appointments')->fetchColumn(),
                'secondary_stat_label' => 'calls booked',
                'manage_url' => '/admin/inbox.html?source=chat',
                'manage_label' => 'Open inbox',
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
                'key' => 'sketch',
                'name' => Settings::get('sketch_assistant_name') ?: 'Sketch',
                'role' => 'UX/UI Designer',
                'description' => 'Generates a concept mockup image for a proposal so a prospective client can see a visual direction before signing, not just read a scope.',
                'icon' => 'bi-vector-pen',
                'status' => 'ondemand',
                'status_label' => 'On demand',
                'stat_value' => $mockupsGenerated,
                'stat_label' => 'mockups generated',
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
            [
                'key' => 'ada',
                'name' => Settings::get('ada_assistant_name') ?: 'Ada',
                'role' => 'Document Reviewer',
                'description' => 'Reads an invoice, receipt or statement, tells you honestly what is wrong or missing, and says what to do next — then drafts the invoice if you ask.',
                'icon' => 'bi-file-earmark-text',
                // Newest agent, same "still proving itself" state Arch launched in.
                'status' => 'building',
                'status_label' => 'Building',
                // Drafts she has raised. Counts drafts only: anything sent or paid
                // was a human decision, so crediting it to her would overstate her.
                'stat_value' => (int) $pdo->query("SELECT COUNT(*) FROM invoices WHERE status = 'draft'")->fetchColumn(),
                'stat_label' => 'invoices drafted',
                'manage_url' => '/admin/agent-chat.html',
                'manage_label' => 'Talk to Ada',
            ],
            [
                'key' => 'chief',
                'name' => Settings::get('chief_assistant_name') ?: 'Chief',
                'role' => 'Chief of Staff',
                'description' => 'Keeps track of every other agent — counts what each one actually did, writes you a daily brief, and flags the ones that are stuck, switched off or quietly doing nothing.',
                'icon' => 'bi-clipboard-data',
                // Runs on the daily cron, so it is only genuinely "reporting"
                // once a brief exists — otherwise the cron isn't wired up yet
                // and saying "active" would be a claim, not a status.
                'status' => $briefsWritten > 0 ? 'active' : 'standby',
                'status_label' => $briefsWritten > 0 ? 'Reporting daily' : 'Awaiting first brief',
                'stat_value' => $briefsWritten,
                'stat_label' => 'briefs written',
                'manage_url' => '/admin/team.html',
                'manage_label' => 'Latest brief',
            ],
        ];

        foreach ($agents as &$agent) {
            $agent['capacity'] = $capacity['agents'][$agent['key']] ?? self::emptyCapacity();
        }
        unset($agent);

        Response::json([
            'owner' => [
                'name' => Settings::get('site_owner_name') ?: 'Prince Caleb',
                'role' => 'Founder & Lead Developer',
                'tagline' => 'Premium web design & mobile app development — the human the agents work for.',
                'capacity' => $capacity['owner'],
            ],
            'agents' => $agents,
            'capacity_summary' => $capacity['summary'],
            'arch_activity' => self::archActivity($pdo),
            // Chief's most recent brief, so the Team page opens on what the
            // team actually did rather than on lifetime totals alone. Null
            // until the first one is written; the raw snapshot it was written
            // from stays behind /chief/brief rather than bloating this payload.
            'daily_brief' => self::withoutSnapshot(Chief::latestBrief($pdo)),
        ]);
    }

    /** @param array<string,mixed>|null $brief @return array<string,mixed>|null */
    private static function withoutSnapshot(?array $brief): ?array
    {
        if ($brief !== null) {
            unset($brief['snapshot_json']);
        }
        return $brief;
    }

    /** Latest Arch deliveries with revision activity for the admin roster. */
    private static function archActivity(\PDO $pdo): array
    {
        try {
            $rows = $pdo->query(
                "SELECT gs.id, gs.slug, gs.business_name, gs.business_type,
                        gs.client_name, gs.client_email, gs.has_cms, gs.provider, gs.created_at,
                        (SELECT COUNT(*) FROM arch_site_revisions ar WHERE ar.generated_site_id=gs.id) AS revision_count,
                        (SELECT ar.feedback FROM arch_site_revisions ar WHERE ar.generated_site_id=gs.id ORDER BY ar.id DESC LIMIT 1) AS latest_feedback,
                        (SELECT ar.created_at FROM arch_site_revisions ar WHERE ar.generated_site_id=gs.id ORDER BY ar.id DESC LIMIT 1) AS latest_revision_at
                 FROM generated_sites gs
                 ORDER BY COALESCE(
                    (SELECT MAX(ar.created_at) FROM arch_site_revisions ar WHERE ar.generated_site_id=gs.id),
                    gs.created_at
                 ) DESC
                 LIMIT 12"
            )->fetchAll(\PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            // Keeps the Team page usable during the short deploy window before
            // the new migration is applied.
            return [];
        }

        return array_map(static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'slug' => (string) $row['slug'],
                'business_name' => (string) $row['business_name'],
                'business_type' => (string) ($row['business_type'] ?? ''),
                'client_name' => (string) ($row['client_name'] ?? ''),
                'client_email' => (string) ($row['client_email'] ?? ''),
                'has_cms' => !empty($row['has_cms']),
                'provider' => (string) ($row['provider'] ?? 'template'),
                'created_at' => $row['created_at'],
                'revision_count' => (int) $row['revision_count'],
                'latest_feedback' => (string) ($row['latest_feedback'] ?? ''),
                'latest_revision_at' => $row['latest_revision_at'],
                'preview_url' => '/generated-sites/' . rawurlencode((string) $row['slug']) . '/',
                'download_url' => '/api/v1/arch/download.php?slug=' . rawurlencode((string) $row['slug'])
                    . '&token=' . rawurlencode(Arch::downloadToken((string) $row['slug'])),
            ];
        }, $rows);
    }

    private static function projectCapacity(\PDO $pdo): array
    {
        $rows = $pdo->query(
            "SELECT p.id,p.title,p.progress_percent,p.deadline,p.assigned_agent_key,
                    (SELECT COUNT(*) FROM project_milestones pm WHERE pm.project_id=p.id) AS milestone_count,
                    (SELECT COUNT(*) FROM project_milestones pm WHERE pm.project_id=p.id AND pm.is_completed=0) AS open_milestones,
                    (SELECT MIN(pm.due_date) FROM project_milestones pm WHERE pm.project_id=p.id AND pm.is_completed=0 AND pm.due_date IS NOT NULL) AS next_milestone_date
             FROM projects p
             WHERE p.progress_percent<100 AND (
               p.progress_percent>0 OR p.deadline IS NOT NULL OR p.assigned_agent_key IS NOT NULL OR
               EXISTS(SELECT 1 FROM project_milestones pm WHERE pm.project_id=p.id)
             )"
        )->fetchAll();

        $today = date('Y-m-d');
        $soon = date('Y-m-d', strtotime('+14 days'));
        foreach ($rows as &$row) {
            $dates = array_values(array_filter([$row['deadline'], $row['next_milestone_date']]));
            sort($dates);
            $row['next_deadline'] = $dates[0] ?? null;
            $row['is_overdue'] = $row['next_deadline'] !== null && $row['next_deadline'] < $today;
            $row['due_soon'] = $row['next_deadline'] !== null && $row['next_deadline'] >= $today && $row['next_deadline'] <= $soon;
        }
        unset($row);

        $build = static function (array $projects): array {
            usort($projects, static function ($a, $b): int {
                if ($a['is_overdue'] !== $b['is_overdue']) return $a['is_overdue'] ? -1 : 1;
                return strcmp($a['next_deadline'] ?? '9999-12-31', $b['next_deadline'] ?? '9999-12-31');
            });
            $active = count($projects);
            return [
                'active_projects' => $active,
                'overdue_projects' => count(array_filter($projects, fn($p) => $p['is_overdue'])),
                'due_soon' => count(array_filter($projects, fn($p) => $p['due_soon'])),
                'next_deadline' => $projects[0]['next_deadline'] ?? null,
                'level' => $active === 0 ? 'clear' : ($active <= 2 ? 'available' : ($active <= 4 ? 'focused' : 'full')),
                'projects' => array_slice($projects, 0, 4),
            ];
        };

        $agents = [];
        foreach (['lisa','nurturer','beacon','dossier','proposal','content','arch'] as $key) {
            $agents[$key] = $build(array_values(array_filter($rows, fn($p) => $p['assigned_agent_key'] === $key)));
        }
        return [
            'owner' => $build($rows),
            'agents' => $agents,
            'summary' => [
                'active_projects' => count($rows),
                'overdue_projects' => count(array_filter($rows, fn($p) => $p['is_overdue'])),
                'due_soon' => count(array_filter($rows, fn($p) => $p['due_soon'])),
                'unassigned_projects' => count(array_filter($rows, fn($p) => empty($p['assigned_agent_key']))),
            ],
        ];
    }

    private static function emptyCapacity(): array
    {
        return ['active_projects' => 0, 'overdue_projects' => 0, 'due_soon' => 0, 'next_deadline' => null, 'level' => 'clear', 'projects' => []];
    }
}
