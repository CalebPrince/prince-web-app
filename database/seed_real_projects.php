<?php

declare(strict_types=1);

// Adds/updates real project case studies by slug (upsert — same pattern as
// seed.php). WARNING: every project listed in $projects below gets
// overwritten on every run, including ones edited live via the admin UI
// since this file was last touched. Only put a project here when you want
// this file to be the source of truth for it going forward; do not add an
// already-live, admin-edited project "just to keep it in the repo" — that
// silently reverts any edits made outside this file the next time this
// script runs.

require dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;

$pdo = Database::get();

$projects = [
    [
        'slug' => 'opskeep',
        'title' => 'Opskeep',
        'summary' => 'Open-source Agent Skills pack that installs operator workflows, winning work, scoping it, delivering it, getting paid, keeping clients, and improving, directly into the AI coding agent you already use.',
        'case_study_body' =>
            "AI coding agents are excellent at the craft, they write the code, ship the feature, close the ticket. What they don't know is how to run the business around that work: chasing an invoice, following up a client, keeping a pipeline full, or turning a finished job into a repeatable process. That operator half of the job still fell entirely on the human, every time, from scratch.\n\n" .
            "Opskeep closes that gap by installing operator know-how as a skill pack directly into the agent already open, Claude Code, Cursor, Codex CLI, or Cline. It ships six business-lane skills (get work, define work, deliver work, get paid, keep clients, improve operations) plus meta skills for setup, memory, and automations, each one a folder of Markdown following the open Agent Skills standard, installable with a single command. A companion MCP server exposes reminders and time-tracking as callable tools for agents that want to act on the workflow, not just read about it.\n\n" .
            "The whole business-lane pack is MIT-licensed and free to run entirely inside a user's own agent, no server, no account. A paid Pro tier adds the pieces that genuinely need server-side infrastructure: hosted customer replies and follow-up reminders, server-rendered audio session recaps, cross-session time/expense sync, and managed connectors (WhatsApp, Slack, GitHub, Gmail, Stripe, Notion, Linear, and more) for teams that want it always-on rather than session-triggered.",
        'category' => 'custom_solution',
        'live_url' => null,
        'repo_url' => 'https://github.com/CalebPrince/opskeep-skills',
        'cover_image_path' => '/uploads/opskeep-real.png',
        'tags' => ['Node.js', 'Agent Skills', 'MCP', 'Open Source', 'CLI'],
    ],
    [
        'slug' => 'sprint-energy',
        'title' => 'Sprint Energy',
        'summary' => 'Custom website and staff workspace for Sprint Energy, a Ghana solar installer: quote and contact forms that hand off to WhatsApp, a signed-in workspace for enquiries, site surveys, quotations, installations and maintenance, and two AI assistants.',
        'case_study_body' =>
            "Sprint Energy designs and installs solar systems sized to each home and business in Ghana. The website had to do two jobs: explain that clearly to a customer, and give the team one place to run every job behind it.\n\n" .
            "The public site at sprintenergygh.com follows the owner's own reference design: services, projects, process, about and contact, with a free-quote form and a contact form that save each enquiry, email it and pass it on to WhatsApp with the message already written. A website chat answers questions, takes enquiries and books site visits.\n\n" .
            "Behind it is a signed-in staff workspace: one inbox for every enquiry, customers, site surveys, quotations with a PDF and a customer link, installations by stage, a calendar and tasks, finance records, inventory, maintenance and warranty reminders, reports, and editable website content, with sixteen automations the team switches on one by one. A workspace assistant drafts the routine work, and nothing it suggests happens without a person approving it.",
        'category' => 'custom_solution',
        'live_url' => 'https://sprintenergygh.com',
        'repo_url' => null,
        'cover_image_path' => '/uploads/sprint-energy-real.jpg',
        'tags' => ['PHP', 'Tailwind CSS', 'MySQL', 'WhatsApp', 'AI Agents'],
    ],
    [
        'slug' => 'vidkre8-studio',
        'title' => 'VidKre8 Studio',
        'summary' => 'VidKre8 by PrinceCaleb.dev, the studio Prince Caleb built to make motion video ads from a brief: voiced, captioned and sized for Reels, TikTok, Shorts and WhatsApp Status. Software ads made with it include Elon POS, BuineePay, LIID Flo, Inteli-Space, Qabenji and English Adventure, all playable at princecaleb.dev/vidkre8.',
        'case_study_body' =>
            "Most small businesses need short videos every week and cannot pay an agency for each one. VidKre8 is the studio Prince Caleb built so a brief becomes a finished ad quickly and the same way every time.\n\n" .
            "A client sends their idea, their logo, their footage or screens, and a reference they like. VidKre8 turns that into a finished motion ad: the scenes, on-screen text, a voice-over, captions, original or supplied music mixed to platform loudness, and copies ready for Reels, TikTok, YouTube Shorts and WhatsApp Status. Each ad gets its own look rather than a template.\n\n" .
            "Software and app ads made with it so far include Elon POS (a business software ad with a dashboard, payment alerts and the system's real sales figures), BuineePay (a fintech commercial), LIID Flo (an app launch), Inteli-Space (an AI workspace), Qabenji (a team and project tool) and English Adventure (a children's learning game). They play at princecaleb.dev/vidkre8.",
        'category' => 'custom_solution',
        'live_url' => 'https://princecaleb.dev/vidkre8',
        'repo_url' => null,
        'cover_image_path' => '/uploads/vidkre8-studio.jpg',
        'tags' => ['Video Production', 'Motion Graphics', 'Voice-over', 'Captions'],
    ],
];

function upsertTag(\PDO $pdo, string $name): int
{
    $slug = strtolower(preg_replace('/[^a-z0-9]+/', '-', strtolower($name)));
    $slug = trim($slug, '-');

    $stmt = $pdo->prepare('SELECT id FROM tags WHERE slug = ?');
    $stmt->execute([$slug]);
    $row = $stmt->fetch();
    if ($row) {
        return (int) $row['id'];
    }

    $pdo->prepare('INSERT INTO tags (name, slug) VALUES (?, ?)')->execute([$name, $slug]);
    return (int) $pdo->lastInsertId();
}

$nextSortOrder = (int) $pdo->query('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM projects')->fetchColumn();

foreach ($projects as $project) {
    $stmt = $pdo->prepare('SELECT id FROM projects WHERE slug = ?');
    $stmt->execute([$project['slug']]);
    $existing = $stmt->fetch();

    if ($existing) {
        $stmt = $pdo->prepare(
            "UPDATE projects SET title=?, summary=?, case_study_body=?, category=?, live_url=?, repo_url=?,
             cover_image_path=?, is_embeddable=?, is_published=1, updated_at=datetime('now') WHERE id=?"
        );
        $stmt->execute([
            $project['title'],
            $project['summary'],
            $project['case_study_body'],
            $project['category'],
            $project['live_url'],
            $project['repo_url'],
            $project['cover_image_path'],
            $project['is_embeddable'] ?? 0,
            $existing['id'],
        ]);
        $projectId = (int) $existing['id'];
        echo "Updated: {$project['title']}\n";
    } else {
        $stmt = $pdo->prepare(
            'INSERT INTO projects (slug, title, summary, case_study_body, category, live_url, repo_url, cover_image_path, is_embeddable, is_published, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)'
        );
        $stmt->execute([
            $project['slug'],
            $project['title'],
            $project['summary'],
            $project['case_study_body'],
            $project['category'],
            $project['live_url'],
            $project['repo_url'],
            $project['cover_image_path'],
            $project['is_embeddable'] ?? 0,
            $nextSortOrder++,
        ]);
        $projectId = (int) $pdo->lastInsertId();
        echo "Created: {$project['title']}\n";
    }

    $pdo->prepare('DELETE FROM project_tags WHERE project_id = ?')->execute([$projectId]);
    foreach ($project['tags'] as $tagName) {
        $tagId = upsertTag($pdo, $tagName);
        $pdo->prepare('INSERT OR IGNORE INTO project_tags (project_id, tag_id) VALUES (?, ?)')
            ->execute([$projectId, $tagId]);
    }
}

echo "Real projects seeded.\n";
