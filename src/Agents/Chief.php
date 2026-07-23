<?php

namespace App\Agents;

use App\Middleware\AuthMiddleware;
use App\Support\AiAgentEngine;
use App\Support\AiText;
use App\Support\Database;
use App\Support\EmailTemplate;
use App\Support\Mailer;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;
use PDO;

/**
 * Chief — chief of staff. Reports on the rest of the team, and on the rest
 * of the command center besides.
 *
 * Every other agent works on the studio. This one works on the agents: once a
 * day it counts what each of them actually did, writes a short brief, saves it,
 * and emails it. It is also chattable, so "what has Joan done this week?" has
 * an answer that isn't nine admin pages. Caleb asked it to watch the whole
 * command center, not just the agents — so the same brief also covers
 * command_center: his own actions logged across the app, a Paystack payment
 * that clears with no admin action, a new contact/quote inquiry landing from
 * the site. None of that is agent work, so it's reported as its own section,
 * never folded into an agent's count.
 *
 * Three things worth knowing about the design:
 *
 * 1. snapshot() is plain SQL, no AI. The numbers are counted from the same
 *    tables the Team page reads (agent figures) and admin_activity_log (the
 *    audit trail nearly every controller already writes to for command_center),
 *    then handed to the model as JSON with an instruction never to state a
 *    figure that isn't in it. A supervisor that hallucinates its subordinates'
 *    output is worse than no supervisor — it launders invention into
 *    something that reads like a report.
 *
 * 2. If no AI provider answers, the brief still goes out — composePlain()
 *    renders the same snapshot deterministically. A daily report that silently
 *    skips days is one you stop trusting, and the counting (the part that
 *    matters) never needed a model in the first place.
 *
 * 3. It reports idleness asymmetrically, because idleness means different
 *    things. Lisa, Jason and Joan run on their own, so a quiet day is a
 *    signal. Sharon, Ledger, Sketch, Danielle, Arch and Ada only act when asked,
 *    so a quiet day is just a day nobody asked — flagging it would train you to
 *    ignore the brief. command_center makes no such judgment; it just reports
 *    what it finds.
 */
class Chief
{
    public const AGENT_NAME = 'Chief';

    private const MAX_MESSAGE_LENGTH = 4000;
    private const MAX_TRANSCRIPT_TURNS = 40;
    private const BRIEF_TIMEOUT_SECONDS = 45;

    /** Agents that run on a cron or on the live site — silence is a signal. */
    private const ALWAYS_ON = ['lisa', 'nurturer', 'beacon'];

    // ---------------------------------------------------------------- naming

    public static function displayName(): string
    {
        return Settings::get('chief_assistant_name') ?: self::AGENT_NAME;
    }

    // -------------------------------------------------------------- counting

    /**
     * What every agent did in the last $hours, counted from the database.
     *
     * No AI, no interpretation — just the figures, plus the configuration state
     * needed to read them correctly (an agent that is switched off did nothing
     * for a very different reason than one nobody asked).
     *
     * @param string|null $only Limit to a single agent key.
     * @return array<string,mixed>
     */
    public static function snapshot(PDO $pdo, int $hours = 24, ?string $only = null): array
    {
        $hours = max(1, min(24 * 90, $hours));
        // Windowed in SQLite, not PHP: every timestamp in this database is
        // written by datetime('now') (UTC), and the app never sets a PHP
        // timezone — so a PHP-side window would silently skew by the server's
        // offset. $hours is an int, so the interpolation is safe.
        $since = (string) $pdo->query("SELECT datetime('now', '-{$hours} hours')")->fetchColumn();

        $agents = [];

        // --- Lisa ------------------------------------------------------------
        $agents[] = [
            'key' => 'lisa',
            'name' => Settings::get('chat_assistant_name') ?: 'Lisa',
            'role' => 'Booking & live chat',
            'runs' => 'always_on',
            'state' => 'live on the site',
            'did' => [
                ['label' => 'conversations started', 'count' => self::num($pdo,
                    'SELECT COUNT(*) FROM chat_sessions WHERE created_at >= ?', [$since])],
                ['label' => 'contact details captured', 'count' => self::num($pdo,
                    "SELECT COUNT(*) FROM chat_sessions
                     WHERE client_email IS NOT NULL AND client_email != '' AND updated_at >= ?", [$since])],
                ['label' => 'discovery calls booked', 'count' => self::num($pdo,
                    'SELECT COUNT(*) FROM appointments WHERE created_at >= ?', [$since])],
            ],
            'last_active_at' => self::latestOf($pdo, [
                'SELECT MAX(updated_at) FROM chat_sessions',
                'SELECT MAX(created_at) FROM appointments',
            ]),
        ];

        // --- Jason (nurturer) -------------------------------------------------
        $nurturerLive = self::num($pdo,
            'SELECT COUNT(*) FROM automations WHERE nurturer_enabled = 1 AND is_active = 1') > 0;
        $nurturerName = Settings::get('nurturer_assistant_name') ?: 'Jason';
        $agents[] = [
            'key' => 'nurturer',
            'name' => $nurturerName,
            'role' => 'Email follow-up',
            'runs' => 'always_on',
            'state' => $nurturerLive ? 'sending' : 'no active automation',
            // Named with the configured name, not the default — these notes are
            // read verbatim by the model and by the plain-text fallback, and a
            // renamed agent being called something else in its own brief reads
            // like a report about a different studio.
            'config_note' => $nurturerLive ? null
                : 'No active automation has ' . $nurturerName . ' enabled, so nothing will send until one is switched on.',
            'did' => [
                ['label' => 'sequence emails sent', 'count' =>
                    self::num($pdo, 'SELECT COUNT(*) FROM drip_sends WHERE sent_at >= ?', [$since])
                    + self::num($pdo, 'SELECT COUNT(*) FROM nurturer_sends WHERE sent_at >= ?', [$since])],
                ['label' => 'people enrolled', 'count' => self::num($pdo,
                    'SELECT COUNT(*) FROM drip_enrollments WHERE enrolled_at >= ?', [$since])],
                ['label' => 'newsletters drafted', 'count' => self::num($pdo,
                    "SELECT COUNT(*) FROM newsletter_drafts WHERE status = 'drafted' AND drafted_at >= ?", [$since])],
            ],
            'last_active_at' => self::latestOf($pdo, [
                'SELECT MAX(sent_at) FROM drip_sends',
                'SELECT MAX(sent_at) FROM nurturer_sends',
            ]),
        ];

        // --- Joan (beacon) -----------------------------------------------------
        $beaconOn = (string) Settings::get('beacon_discovery_enabled') === '1';
        $runs = self::row($pdo,
            "SELECT COUNT(*) AS runs,
                    COALESCE(SUM(searches_run), 0) AS searches,
                    COALESCE(SUM(searches_failed), 0) AS failed,
                    COALESCE(SUM(results_scanned), 0) AS scanned
             FROM beacon_runs WHERE ran_at >= ?", [$since]);
        $beaconName = Settings::get('beacon_assistant_name') ?: 'Joan';
        $beacon = [
            'key' => 'beacon',
            'name' => $beaconName,
            'role' => 'Social lead scouting',
            'runs' => 'always_on',
            'state' => $beaconOn ? 'scouting' : 'switched off',
            'config_note' => $beaconOn ? null
                : 'Discovery is switched off in Settings, so ' . $beaconName . ' cannot find anything.',
            'did' => [
                ['label' => 'qualified leads found', 'count' => self::num($pdo,
                    'SELECT COUNT(*) FROM beacon_social_leads WHERE created_at >= ?', [$since])],
                // Effort, not output: a thousand results scanned for no lead is
                // a quiet day, and counting it as work would say the opposite.
                ['label' => 'discovery runs', 'count' => (int) ($runs['runs'] ?? 0), 'context' => true],
                ['label' => 'results scanned', 'count' => (int) ($runs['scanned'] ?? 0), 'context' => true],
            ],
            'last_active_at' => self::latestOf($pdo, [
                'SELECT MAX(ran_at) FROM beacon_runs',
                'SELECT MAX(created_at) FROM beacon_social_leads',
            ]),
        ];
        // A run that ran but whose searches all failed looks identical to a
        // quiet day in the lead count alone. It isn't, so say so.
        $failed = (int) ($runs['failed'] ?? 0);
        if ($failed > 0) {
            $beacon['health'] = $failed . ' of ' . (int) ($runs['searches'] ?? 0)
                . ' searches failed — the Serper key or its quota is the usual cause.';
        }
        $agents[] = $beacon;

        // --- Sharon (dossier) --------------------------------------------------
        $agents[] = [
            'key' => 'dossier',
            'name' => Settings::get('dossier_assistant_name') ?: 'Sharon',
            'role' => 'Lead research',
            'runs' => 'on_demand',
            'state' => 'on demand',
            'did' => [
                ['label' => 'leads researched', 'count' => self::num($pdo,
                    'SELECT COUNT(*) FROM marketing_leads WHERE researched_at >= ?', [$since])],
            ],
            'last_active_at' => self::latestOf($pdo, ['SELECT MAX(researched_at) FROM marketing_leads']),
        ];

        // --- Ledger (proposals) ----------------------------------------------
        $agents[] = [
            'key' => 'proposal',
            'name' => Settings::get('proposal_assistant_name') ?: 'Ledger',
            'role' => 'Proposal writing',
            'runs' => 'on_demand',
            'state' => 'on demand',
            'did' => [
                ['label' => 'proposals created', 'count' => self::num($pdo,
                    'SELECT COUNT(*) FROM proposals WHERE created_at >= ?', [$since])],
                ['label' => 'drafts raised from booked calls', 'count' => self::num($pdo,
                    "SELECT COUNT(*) FROM proposal_drafts WHERE status = 'drafted' AND drafted_at >= ?", [$since])],
                ['label' => 'drafts that failed', 'count' => self::num($pdo,
                    "SELECT COUNT(*) FROM proposal_drafts WHERE status = 'failed' AND created_at >= ?", [$since])],
            ],
            'last_active_at' => self::latestOf($pdo, [
                'SELECT MAX(created_at) FROM proposals',
                'SELECT MAX(drafted_at) FROM proposal_drafts',
            ]),
        ];

        // --- Sketch ----------------------------------------------------------
        $agents[] = [
            'key' => 'sketch',
            'name' => Settings::get('sketch_assistant_name') ?: 'Sketch',
            'role' => 'Concept mockups',
            'runs' => 'on_demand',
            'state' => 'on demand',
            'did' => [
                ['label' => 'mockups generated', 'count' => self::num($pdo,
                    'SELECT COUNT(*) FROM proposals WHERE mockup_image_url IS NOT NULL AND updated_at >= ?', [$since])],
            ],
            // Mockups have no timestamp of their own, only the proposal's — so
            // editing an old proposal counts its mockup again. Stated rather
            // than quietly reported as fact.
            'caveat' => "Sketch's count is dated by the proposal's last edit, not by when the mockup was made.",
            'last_active_at' => self::latestOf($pdo,
                ['SELECT MAX(updated_at) FROM proposals WHERE mockup_image_url IS NOT NULL']),
        ];

        // --- Danielle (content) -------------------------------------------------
        $agents[] = [
            'key' => 'content',
            'name' => Settings::get('content_assistant_name') ?: 'Danielle',
            'role' => 'Content & social',
            'runs' => 'on_demand',
            'state' => 'on demand',
            'did' => [
                ['label' => 'items drafted', 'count' => self::num($pdo,
                    'SELECT COUNT(*) FROM content_studio_items WHERE created_at >= ?', [$since])],
            ],
            'last_active_at' => self::latestOf($pdo, ['SELECT MAX(created_at) FROM content_studio_items']),
        ];

        // --- Arch --------------------------------------------------------------
        $agents[] = [
            'key' => 'arch',
            'name' => Settings::get('arch_assistant_name') ?: 'Arch',
            'role' => 'Website building',
            'runs' => 'on_demand',
            'state' => 'on demand',
            'did' => [
                ['label' => 'sites built', 'count' => self::num($pdo,
                    'SELECT COUNT(*) FROM generated_sites WHERE created_at >= ?', [$since])],
                ['label' => 'client revisions applied', 'count' => self::num($pdo,
                    'SELECT COUNT(*) FROM arch_site_revisions WHERE created_at >= ?', [$since])],
            ],
            'last_active_at' => self::latestOf($pdo, [
                'SELECT MAX(created_at) FROM generated_sites',
                'SELECT MAX(created_at) FROM arch_site_revisions',
            ]),
        ];

        // --- Ada ---------------------------------------------------------------
        $agents[] = [
            'key' => 'ada',
            'name' => Settings::get('ada_assistant_name') ?: 'Ada',
            'role' => 'Document review',
            'runs' => 'on_demand',
            'state' => 'on demand',
            'did' => [
                ['label' => 'invoices drafted', 'count' => self::num($pdo,
                    "SELECT COUNT(*) FROM invoices WHERE status = 'draft' AND created_at >= ?", [$since])],
            ],
            'last_active_at' => self::latestOf($pdo,
                ["SELECT MAX(created_at) FROM invoices WHERE status = 'draft'"]),
        ];

        // --- derived per-agent fields ------------------------------------------
        foreach ($agents as &$agent) {
            // Only output counts toward "actions". Items flagged context are
            // effort (runs made, results scanned) — real, but folding them in
            // would let a busy-but-fruitless day report as a productive one.
            $agent['actions'] = array_sum(array_map(
                static fn ($item) => empty($item['context']) ? $item['count'] : 0,
                $agent['did']
            ));
            $agent['idle_days'] = self::daysSince($agent['last_active_at']);
        }
        unset($agent);

        if ($only !== null) {
            $agents = array_values(array_filter($agents, static fn ($a) => $a['key'] === $only));
        }

        // 'command_center' is its own key, not a tenth agent — it covers work
        // no agent gets credit for, so it's excluded from the agent totals
        // below (which drive "N actions from N agents" in the headline) and
        // handled as a separate section everywhere it's rendered.
        $wantsCommandCenter = $only === null || $only === 'command_center';

        return [
            'window_hours' => $hours,
            'since' => $since,
            'generated_at' => date('Y-m-d H:i:s'),
            'agents' => $agents,
            'command_center' => $wantsCommandCenter ? self::commandCenterActivity($pdo, $since) : [],
            'waiting_on_you' => $only === null ? self::waitingOnYou($pdo) : [],
            'totals' => [
                'actions' => array_sum(array_column($agents, 'actions')),
                'agents_that_worked' => count(array_filter($agents, static fn ($a) => $a['actions'] > 0)),
                'agents_total' => count($agents),
            ],
        ];
    }

    /**
     * Everything else that happened in the admin panel in the window — work
     * no agent gets credit for, because it wasn't an agent's work. Most of it
     * comes from admin_activity_log, the audit trail every controller in the
     * app already writes to (invoices, payments, clients, testimonials,
     * pipeline moves, and so on) right after AuthMiddleware::requireAuth().
     * Two things happen with no admin session to log them at all, so they're
     * queried directly instead: a Paystack payment clearing on its own, and a
     * new contact/quote inquiry arriving from the public site (excluding the
     * ones logged as chat leads — Lisa already reports those).
     *
     * @return array{did: array<int,array{label:string,count:int}>, actions:int, last_active_at: ?string}
     */
    private static function commandCenterActivity(PDO $pdo, string $since): array
    {
        $did = [];

        $rows = self::rows($pdo,
            "SELECT action, entity_type, COUNT(*) AS n FROM admin_activity_log
             WHERE created_at >= ? GROUP BY action, entity_type ORDER BY n DESC LIMIT 15", [$since]);
        foreach ($rows as $r) {
            $did[] = [
                'label' => str_replace('_', ' ', (string) $r['entity_type']) . ' '
                    . str_replace('_', ' ', (string) $r['action']),
                'count' => (int) $r['n'],
            ];
        }

        $did[] = ['label' => 'payments that cleared automatically via Paystack', 'count' => self::num($pdo,
            "SELECT COUNT(*) FROM payments
             WHERE status = 'success' AND source IN ('tier_checkout', 'payment_link') AND created_at >= ?",
            [$since])];
        $did[] = ['label' => 'new contact/quote inquiries from the site', 'count' => self::num($pdo,
            "SELECT COUNT(*) FROM inquiries WHERE created_at >= ? AND message NOT LIKE '[Live Chat]%'",
            [$since])];

        $did = array_values(array_filter($did, static fn ($d) => $d['count'] > 0));

        return [
            'did' => $did,
            'actions' => array_sum(array_column($did, 'count')),
            'last_active_at' => self::latestOf($pdo, [
                'SELECT MAX(created_at) FROM admin_activity_log',
                "SELECT MAX(created_at) FROM payments WHERE status = 'success'",
                'SELECT MAX(created_at) FROM inquiries',
            ]),
        ];
    }

    /**
     * Work the agents have finished that is now sitting on the human. Every
     * one of these is a queue only Caleb can drain — the point of the brief is
     * as much "what is waiting" as "what happened".
     *
     * @return array<int,array{label:string,count:int,url:string}>
     */
    private static function waitingOnYou(PDO $pdo): array
    {
        $queues = [
            ['proposals still in draft', "SELECT COUNT(*) FROM proposals WHERE status = 'draft'", '/admin/proposals.html'],
            ['drafted proposals awaiting review', "SELECT COUNT(*) FROM proposal_drafts WHERE status = 'drafted'", '/admin/proposals.html'],
            ['invoices still in draft', "SELECT COUNT(*) FROM invoices WHERE status = 'draft'", '/admin/invoices.html'],
            ['content drafts unapproved', "SELECT COUNT(*) FROM content_studio_items WHERE status = 'draft'", '/admin/content-studio.html'],
            ['newsletters drafted but unsent', "SELECT COUNT(*) FROM newsletter_drafts WHERE status = 'drafted' AND sent_at IS NULL", '/admin/newsletter.html'],
            ['pitch-ready leads not yet sent', "SELECT COUNT(*) FROM marketing_leads WHERE status = 'pitch_ready' AND sent_at IS NULL", '/admin/marketing-leads.html'],
            ['chat leads you have not opened', "SELECT COUNT(*) FROM chat_sessions WHERE client_email IS NOT NULL AND client_email != '' AND admin_seen = 0", '/admin/chats.html'],
            ['quote requests still unreviewed', "SELECT COUNT(*) FROM inquiries WHERE type = 'project_request' AND pipeline_stage IN ('new', 'reviewing')", '/admin/quote-requests.html'],
            ['project milestones overdue', "SELECT COUNT(*) FROM project_milestones WHERE is_completed = 0 AND due_date IS NOT NULL AND due_date < date('now')", '/admin/projects.html'],
        ];

        $out = [];
        foreach ($queues as [$label, $sql, $url]) {
            $count = self::num($pdo, $sql);
            if ($count > 0) {
                $out[] = ['label' => $label, 'count' => $count, 'url' => $url];
            }
        }
        return $out;
    }

    // ------------------------------------------------------------ the brief

    /**
     * Build (or rebuild) the brief for one day and store it.
     *
     * One row per date: re-running replaces that day's brief rather than
     * stacking duplicates, so the cron is safe to run more than once and a
     * manual "run now" simply refreshes what is already there.
     *
     * @return array<string,mixed> the stored brief row
     */
    public static function generateBrief(PDO $pdo, int $hours = 24, ?string $date = null): array
    {
        $date = $date ?: (string) $pdo->query("SELECT date('now')")->fetchColumn();
        $snapshot = self::snapshot($pdo, $hours);
        $written = self::write($snapshot);

        $pdo->prepare(
            "INSERT INTO agent_daily_briefs (brief_date, window_hours, headline, body, snapshot_json, provider, created_at)
             VALUES (:date, :hours, :headline, :body, :snapshot, :provider, datetime('now'))
             ON CONFLICT(brief_date) DO UPDATE SET
                window_hours = excluded.window_hours,
                headline = excluded.headline,
                body = excluded.body,
                snapshot_json = excluded.snapshot_json,
                provider = excluded.provider,
                created_at = excluded.created_at"
        )->execute([
            ':date' => $date,
            ':hours' => $hours,
            ':headline' => $written['headline'],
            ':body' => $written['body'],
            ':snapshot' => json_encode($snapshot),
            ':provider' => $written['provider'],
        ]);

        return self::briefFor($pdo, $date) ?? [];
    }

    /**
     * Turn the snapshot into prose. Falls back to a deterministic rendering of
     * the same numbers when no provider answers — the brief is a counting job
     * first and a writing job second.
     *
     * @return array{headline:string,body:string,provider:?string}
     */
    private static function write(array $snapshot): array
    {
        $text = AiText::generate(
            "Today's snapshot:\n\n" . json_encode($snapshot, JSON_PRETTY_PRINT),
            self::briefPrompt(),
            self::BRIEF_TIMEOUT_SECONDS
        );

        if ($text === null || trim($text) === '') {
            return self::composePlain($snapshot);
        }

        $text = SharedAgentTools::stripMarkdown(trim($text));
        $lines = preg_split('/\r?\n/', $text) ?: [];
        $headline = trim((string) array_shift($lines));
        $body = trim(implode("\n", $lines));

        // A model that ignored the format and wrote one paragraph still gives a
        // usable brief — keep it as the body rather than as a 900-char headline.
        if ($body === '' || mb_strlen($headline) > 140) {
            return ['headline' => self::plainHeadline($snapshot), 'body' => $text, 'provider' => 'ai'];
        }

        return ['headline' => $headline, 'body' => $body, 'provider' => 'ai'];
    }

    private static function briefPrompt(): string
    {
        return "You are " . self::displayName() . ", chief of staff to Caleb, who runs a "
            . "one-person web studio staffed by AI agents. You do not do the studio's work; "
            . "you keep track of the agents that do — and the rest of the admin panel besides "
            . "— and report to Caleb once a day.\n\n"
            . "You are given a JSON snapshot of what each agent did in the reporting window, "
            . "plus command_center: everything else that happened in the admin panel that no "
            . "agent gets credit for — Caleb's own actions logged automatically across the app "
            . "(edits, deletes, approvals), a Paystack payment that cleared with no admin action, "
            . "or a new contact/quote inquiry landing from the site. Write that day's brief.\n\n"
            . "Absolute rule: every number and fact you state must come from the JSON. Never "
            . "estimate, never round into vagueness, never mention an agent doing something "
            . "the JSON does not show — and never credit command_center activity to an agent, "
            . "since none of it is agent work. If the JSON is empty, the honest brief is that "
            . "nothing happened.\n\n"
            . "Read idleness correctly. Agents marked runs=always_on work on their own, so a "
            . "zero from them is worth a line. Agents marked runs=on_demand only act when "
            . "asked, so a zero from them is normal and not worth mentioning at all. "
            . "command_center is neither — it simply reports what it finds, with no idleness "
            . "judgment attached.\n\n"
            . "Lead the brief with whatever most deserves Caleb's attention — a problem if "
            . "there is one, otherwise the day's real result. Then, briefly: what the team "
            . "did, what happened elsewhere in the command center, anything broken or switched "
            . "off (config_note and health fields are exactly this), and what is waiting on "
            . "him. Name the specific next action.\n\n"
            . "A caveat field means the number is imprecise; only mention it if the number is "
            . "big enough to matter. An entry marked context is effort rather than output — "
            . "searches run, results scanned — so it explains a result but never counts as one.\n\n"
            . "Never praise the team, never pad, never write a line that says nothing. A quiet "
            . "day is one sentence saying it was quiet — that is a complete brief and you "
            . "should be willing to send it.\n\n"
            . "Format: first line is a headline under 90 characters, no label. Then a blank "
            . "line, then the brief in short plain-text paragraphs or dashed lines. No "
            . "markdown, no headings, no emoji, no sign-off.";
    }

    /** Deterministic brief — used when no AI provider answers. */
    private static function composePlain(array $snapshot): array
    {
        $lines = [];
        $worked = array_filter($snapshot['agents'], static fn ($a) => $a['actions'] > 0);

        $commandCenter = $snapshot['command_center'] ?? [];

        if ($worked) {
            $lines[] = 'What the team did in the last ' . (int) $snapshot['window_hours'] . ' hours:';
            foreach ($worked as $agent) {
                $bits = [];
                foreach ($agent['did'] as $item) {
                    if ($item['count'] > 0) {
                        // "conversations started (1)" rather than "1
                        // conversations started" — the labels are fixed plurals
                        // and this is the one phrasing that reads right either way.
                        $bits[] = $item['label'] . ' (' . $item['count'] . ')';
                    }
                }
                $lines[] = '- ' . $agent['name'] . ': ' . implode(', ', $bits);
            }
        } elseif (empty($commandCenter['did'])) {
            $lines[] = 'No agent recorded any activity in the last '
                . (int) $snapshot['window_hours'] . ' hours.';
        }

        // Kept out of "What the team did" — none of this is agent work, and
        // crediting Caleb's own edits or an automatic Paystack payment to an
        // agent would misreport who actually did it.
        if (!empty($commandCenter['did'])) {
            $lines[] = '';
            $lines[] = 'Also in the command center:';
            foreach ($commandCenter['did'] as $item) {
                $lines[] = '- ' . $item['label'] . ' (' . $item['count'] . ')';
            }
        }

        $problems = [];
        foreach ($snapshot['agents'] as $agent) {
            if (!empty($agent['config_note'])) {
                $problems[] = '- ' . $agent['name'] . ': ' . $agent['config_note'];
            }
            if (!empty($agent['health'])) {
                $problems[] = '- ' . $agent['name'] . ': ' . $agent['health'];
            }
            if (in_array($agent['key'], self::ALWAYS_ON, true) && $agent['actions'] === 0 && empty($agent['config_note'])) {
                $problems[] = '- ' . $agent['name'] . ' is switched on but did nothing'
                    . ($agent['idle_days'] !== null ? ' (last active ' . $agent['idle_days'] . ' days ago).' : '.');
            }
        }
        if ($problems) {
            $lines[] = '';
            $lines[] = 'Worth a look:';
            $lines = array_merge($lines, $problems);
        }

        if ($snapshot['waiting_on_you']) {
            $lines[] = '';
            $lines[] = 'Waiting on you:';
            foreach ($snapshot['waiting_on_you'] as $queue) {
                $lines[] = '- ' . $queue['label'] . ' (' . $queue['count'] . ')';
            }
        }

        $lines[] = '';
        $lines[] = 'Written without an AI provider — these are the raw counts.';

        return [
            'headline' => self::plainHeadline($snapshot),
            'body' => implode("\n", $lines),
            'provider' => null,
        ];
    }

    private static function plainHeadline(array $snapshot): string
    {
        $actions = (int) $snapshot['totals']['actions'];
        $worked = (int) $snapshot['totals']['agents_that_worked'];
        $waiting = count($snapshot['waiting_on_you']);
        $ccActions = (int) ($snapshot['command_center']['actions'] ?? 0);

        if ($actions === 0 && $ccActions === 0) {
            return 'Quiet day — no agent recorded any activity';
        }

        $parts = [];
        if ($actions > 0) {
            $parts[] = $actions . ' action' . ($actions === 1 ? '' : 's')
                . ' from ' . $worked . ' agent' . ($worked === 1 ? '' : 's');
        }
        if ($ccActions > 0) {
            $parts[] = $ccActions . ' more in the command center';
        }
        $headline = implode(', ', $parts) ?: 'No agent activity';
        return $headline
            . ($waiting > 0 ? ', ' . $waiting . ' queue' . ($waiting === 1 ? '' : 's') . ' waiting on you' : '');
    }

    // ----------------------------------------------------------------- email

    /**
     * Email one brief to the studio's notification address. Stamps emailed_at
     * so the cron can run as often as it likes and still send once a day.
     */
    public static function emailBrief(PDO $pdo, array $brief): bool
    {
        $to = Settings::get('notification_email') ?: Settings::get('social_email');
        if (!$to) {
            return false;
        }

        $label = 'Daily brief — ' . date('j M Y', strtotime((string) $brief['brief_date']));
        $text = $brief['headline'] . "\n\n" . $brief['body'];
        $html = EmailTemplate::wrapMarketing($text, $label);

        $sent = Mailer::sendHtml(
            $to,
            self::displayName() . ': ' . $brief['headline'],
            $html,
            $text
        );

        if ($sent) {
            $pdo->prepare("UPDATE agent_daily_briefs SET emailed_at = datetime('now') WHERE id = ?")
                ->execute([$brief['id']]);
        }
        return $sent;
    }

    // ------------------------------------------------------------- retrieval

    /** @return array<string,mixed>|null */
    public static function briefFor(PDO $pdo, string $date): ?array
    {
        $stmt = $pdo->prepare('SELECT * FROM agent_daily_briefs WHERE brief_date = ?');
        $stmt->execute([$date]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /** @return array<string,mixed>|null */
    public static function latestBrief(PDO $pdo): ?array
    {
        try {
            $row = $pdo->query('SELECT * FROM agent_daily_briefs ORDER BY brief_date DESC LIMIT 1')
                ->fetch(PDO::FETCH_ASSOC);
            return $row ?: null;
        } catch (\Throwable $e) {
            // Keeps the Team page usable in the deploy window before the
            // migration has run — same guard the rest of that page uses.
            return null;
        }
    }

    /** Team-page stat: briefs actually written. */
    public static function briefsWritten(PDO $pdo): int
    {
        return self::num($pdo, 'SELECT COUNT(*) FROM agent_daily_briefs');
    }

    // ----------------------------------------------------------------- HTTP

    /** GET /api/v1/admin/chief/briefs — recent briefs, newest first. */
    public static function index(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();

        try {
            $rows = $pdo->query(
                'SELECT id, brief_date, headline, body, provider, emailed_at, created_at
                 FROM agent_daily_briefs ORDER BY brief_date DESC LIMIT 30'
            )->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            $rows = [];
        }

        Response::json(['briefs' => $rows]);
    }

    /** GET /api/v1/admin/chief/brief — the latest brief, with its snapshot. */
    public static function show(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();

        $brief = isset($_GET['date'])
            ? self::briefFor($pdo, (string) $_GET['date'])
            : self::latestBrief($pdo);

        if ($brief === null) {
            Response::json(['brief' => null, 'snapshot' => self::snapshot($pdo, 24)]);
        }

        $brief['snapshot'] = json_decode((string) $brief['snapshot_json'], true) ?: null;
        unset($brief['snapshot_json']);
        Response::json(['brief' => $brief]);
    }

    /** POST /api/v1/admin/chief/brief — write today's brief now. */
    public static function generate(): void
    {
        AuthMiddleware::requireAuth();
        set_time_limit(120);

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $hours = (int) ($data['hours'] ?? 24);
        $email = ($data['email'] ?? false) === true;

        $pdo = Database::get();
        $brief = self::generateBrief($pdo, $hours);
        $emailed = $email && $brief ? self::emailBrief($pdo, $brief) : false;

        Response::json(['brief' => $brief, 'emailed' => $emailed]);
    }

    /**
     * POST /api/v1/admin/agents/chief/chat
     * body: {message, transcript[]}
     */
    public static function adminChat(): void
    {
        AuthMiddleware::requireAuth();
        set_time_limit(120);

        if (empty(Settings::get('gemini_api_key'))
            && empty(Settings::get('openrouter_api_key'))
            && empty(Settings::get('groq_api_key'))) {
            Response::error('No AI provider is configured — set one up in Settings to talk to '
                . self::displayName() . '.', 503);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $message = trim((string) ($data['message'] ?? ''));
        $transcript = is_array($data['transcript'] ?? null) ? $data['transcript'] : [];

        if ($message === '') {
            Response::error('A message is required.', 422);
        }
        if (mb_strlen($message) > self::MAX_MESSAGE_LENGTH) {
            Response::error('A message under ' . self::MAX_MESSAGE_LENGTH . ' characters is required.', 422);
        }

        if (count($transcript) > self::MAX_TRANSCRIPT_TURNS) {
            $transcript = array_slice($transcript, -self::MAX_TRANSCRIPT_TURNS);
        }
        $transcript = array_values(array_filter(array_map(static function ($t) {
            if (!is_array($t)) {
                return null;
            }
            $role = ($t['role'] ?? '') === 'user' ? 'user' : 'assistant';
            $text = trim((string) ($t['text'] ?? ''));
            return $text === '' ? null : ['role' => $role, 'text' => $text];
        }, $transcript)));
        $transcript[] = ['role' => 'user', 'text' => $message];

        $pdo = Database::get();
        $executor = function (string $name, array $args) use ($pdo): array {
            switch ($name) {
                case 'team_activity':
                    return self::snapshot($pdo, (int) ($args['hours'] ?? 24));
                case 'agent_activity':
                    $key = trim((string) ($args['agent_key'] ?? ''));
                    $days = max(1, min(90, (int) ($args['days'] ?? 7)));
                    $snap = self::snapshot($pdo, $days * 24, $key);
                    if ($snap['agents'] === [] && $key !== 'command_center') {
                        return ['error' => 'No agent with that key. Use one of: lisa, nurturer, '
                            . 'beacon, dossier, proposal, sketch, content, arch, ada, or '
                            . 'command_center for everything else in the admin panel.'];
                    }
                    return $snap;
                case 'past_briefs':
                    return ['briefs' => self::pastBriefs($pdo, (int) ($args['limit'] ?? 5))];
                default:
                    return ['error' => 'Unknown tool.'];
            }
        };

        $result = AiAgentEngine::run(
            self::chatPrompt(),
            [self::teamActivityTool(), self::agentActivityTool(), self::pastBriefsTool()],
            $executor,
            $transcript
        );

        $reply = $result['reply'] !== null
            ? SharedAgentTools::stripMarkdown($result['reply'])
            : 'I could not get a reply from any configured AI provider just now. Try again in a moment.';

        Response::json([
            'reply' => $reply,
            'mode' => $result['mode'],
            'provider' => $result['provider'],
        ]);
    }

    private static function chatPrompt(): string
    {
        return "You are " . self::displayName() . ", chief of staff to Caleb, who runs a "
            . "one-person web studio staffed by AI agents. You keep track of what those agents "
            . "are doing, plus the rest of the admin panel — the command center — and answer "
            . "his questions about either.\n\n"
            . "The team: Lisa (live chat and bookings), Jason (follow-up email), Joan "
            . "(social lead scouting), Sharon (lead research), Ledger (proposals), Sketch "
            . "(concept mockups), Danielle (content and social), Arch (website building), Ada "
            . "(document review). Everything else in the command center — Caleb's own actions "
            . "logged across the app, Paystack payments that clear on their own, new contact/"
            . "quote inquiries — is not agent work and is reported separately, never credited "
            . "to an agent.\n\n"
            . "Always work from your tools, never from memory or assumption. team_activity "
            . "covers the whole team plus the command center over a window; agent_activity "
            . "covers one agent — or pass 'command_center' as the agent_key for just that — "
            . "over a number of days; past_briefs recalls briefs you have already written. Pull "
            . "the data before you answer; if a tool shows nothing, that itself is the answer — "
            . "say it plainly.\n\n"
            . "Caleb will also ask you to interpret and advise, not just recite counts — what is "
            . "working, what he should do next, how the studio is doing. Answer those too, and "
            . "you may give business and general advice, but ground every word in what the "
            . "command center actually shows. If no new inquiries or projects have come in, say "
            . "so and tell him the priority is filling the top of the pipeline; if one channel "
            . "is producing most of the leads, point him at it. Never give generic playbook "
            . "advice untethered from the data, and never a number you did not read from a "
            . "tool. When the data genuinely can't speak to a question, say what it can't tell "
            . "you — don't refuse the question as outside your remit.\n\n"
            . "Do not soften a bad week or credit an agent for work the data does not show; "
            . "Caleb uses these answers to decide what to fix, and a flattering report is a "
            . "useless one. Agents that only run on demand are not idle when nobody asked them "
            . "to do anything — say so rather than implying neglect.\n\n"
            . "Be brief and lead with the answer. Plain text, no markdown.";
    }

    /** @return array<int,array<string,mixed>> */
    private static function pastBriefs(PDO $pdo, int $limit): array
    {
        $limit = max(1, min(14, $limit));
        try {
            $stmt = $pdo->prepare(
                'SELECT brief_date, headline, body FROM agent_daily_briefs
                 ORDER BY brief_date DESC LIMIT ' . $limit
            );
            $stmt->execute();
            return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $e) {
            return [];
        }
    }

    private static function teamActivityTool(): array
    {
        return [
            'name' => 'team_activity',
            'description' => 'What every agent did over the last N hours, plus everything else '
                . 'that happened in the admin panel (command center) that no agent gets credit '
                . 'for, plus what work is currently waiting on Caleb. Use 24 for today, 168 for '
                . 'the past week.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'hours' => ['type' => 'integer', 'description' => 'Hours to look back. Default 24.'],
                ],
                'required' => [],
            ],
        ];
    }

    private static function agentActivityTool(): array
    {
        return [
            'name' => 'agent_activity',
            'description' => 'What one agent did over the last N days, or what happened '
                . 'elsewhere in the command center if agent_key is command_center.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'agent_key' => ['type' => 'string', 'description' =>
                        'One of: lisa, nurturer, beacon, dossier, proposal, sketch, content, arch, '
                        . 'ada, or command_center for everything else in the admin panel.'],
                    'days' => ['type' => 'integer', 'description' => 'Days to look back. Default 7.'],
                ],
                'required' => ['agent_key'],
            ],
        ];
    }

    private static function pastBriefsTool(): array
    {
        return [
            'name' => 'past_briefs',
            'description' => 'The most recent daily briefs you have already written, newest first. '
                . 'Use this for questions about trends or about what you reported before.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'limit' => ['type' => 'integer', 'description' => 'How many briefs. Default 5, max 14.'],
                ],
                'required' => [],
            ],
        ];
    }

    // ---------------------------------------------------------------- helpers

    /**
     * A count that survives a missing table. Every figure here is read across
     * nine subsystems' tables; one of them not existing yet (a fresh deploy
     * ahead of its migration) should cost that line, not the whole brief.
     */
    private static function num(PDO $pdo, string $sql, array $params = []): int
    {
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return (int) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            error_log('Chief count failed: ' . $e->getMessage());
            return 0;
        }
    }

    /** @return array<string,mixed> */
    private static function row(PDO $pdo, string $sql, array $params = []): array
    {
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $e) {
            error_log('Chief row failed: ' . $e->getMessage());
            return [];
        }
    }

    /** @return array<int,array<string,mixed>> */
    private static function rows(PDO $pdo, string $sql, array $params = []): array
    {
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $e) {
            error_log('Chief rows failed: ' . $e->getMessage());
            return [];
        }
    }

    /** The most recent of several MAX(timestamp) queries. */
    private static function latestOf(PDO $pdo, array $queries): ?string
    {
        $latest = null;
        foreach ($queries as $sql) {
            try {
                $value = $pdo->query($sql)->fetchColumn();
            } catch (\Throwable $e) {
                continue;
            }
            if (is_string($value) && $value !== '' && ($latest === null || $value > $latest)) {
                $latest = $value;
            }
        }
        return $latest;
    }

    private static function daysSince(?string $timestamp): ?int
    {
        if ($timestamp === null) {
            return null;
        }
        $then = strtotime($timestamp . ' UTC');
        return $then === false ? null : (int) floor((time() - $then) / 86400);
    }
}
