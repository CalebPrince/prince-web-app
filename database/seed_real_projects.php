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
        'summary' => 'Open-source Agent Skills pack that installs operator workflows — winning work, scoping it, delivering it, getting paid, keeping clients, and improving — directly into the AI coding agent you already use.',
        'case_study_body' =>
            "AI coding agents are excellent at the craft — they write the code, ship the feature, close the ticket. What they don't know is how to run the business around that work: chasing an invoice, following up a client, keeping a pipeline full, or turning a finished job into a repeatable process. That operator half of the job still fell entirely on the human, every time, from scratch.\n\n" .
            "Opskeep closes that gap by installing operator know-how as a skill pack directly into the agent already open — Claude Code, Cursor, Codex CLI, or Cline. It ships six business-lane skills (get work, define work, deliver work, get paid, keep clients, improve operations) plus meta skills for setup, memory, and automations, each one a folder of Markdown following the open Agent Skills standard, installable with a single command. A companion MCP server exposes reminders and time-tracking as callable tools for agents that want to act on the workflow, not just read about it.\n\n" .
            "The whole business-lane pack is MIT-licensed and free to run entirely inside a user's own agent — no server, no account. A paid Pro tier adds the pieces that genuinely need server-side infrastructure: hosted customer replies and follow-up reminders, server-rendered audio session recaps, cross-session time/expense sync, and managed connectors (WhatsApp, Slack, GitHub, Gmail, Stripe, Notion, Linear, and more) for teams that want it always-on rather than session-triggered.",
        'category' => 'custom_solution',
        'live_url' => null,
        'repo_url' => 'https://github.com/CalebPrince/opskeep-skills',
        'cover_image_path' => '/uploads/opskeep-real.png',
        'tags' => ['Node.js', 'Agent Skills', 'MCP', 'Open Source', 'CLI'],
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
