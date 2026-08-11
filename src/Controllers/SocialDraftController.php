<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\AiText;
use App\Support\Composio;
use App\Support\Database;
use App\Support\IntegrationEvent;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;
use App\Support\SocialImage;

/**
 * AI-drafted social posts. generateDraft() is shared between the scheduled
 * cron script (database/generate_social_drafts.php) and the admin's manual
 * "Generate now" button. Drafts are sourced exclusively from the 30-day
 * Content Ideas queue (Admin -> Content Ideas, LinkedIn ideas only, oldest
 * day_number first) — the earlier blog-post/project/testimonial-announcement
 * and generic-evergreen fallback sourcing was removed 2026-08-11 so every
 * auto-generated post traces back to a real, reviewable plan entry instead
 * of whatever happened to publish most recently. Returns null (no draft,
 * cron/admin surface a "nothing to draft" message) once every LinkedIn idea
 * in the current 30-day plan has been used — generate a fresh plan in
 * Admin -> Content Ideas to keep the queue going. Approval records a
 * social_post_approved integration event (see IntegrationEvent) for any
 * external consumer, and — separately, if a LinkedIn Composio account is
 * connected — actually publishes the post to LinkedIn directly (see
 * publishToLinkedIn()), recording the outcome in published_at/publish_error
 * so approval can genuinely mean "posted," not just "queued somewhere else."
 */
class SocialDraftController
{
    /** GET /api/v1/admin/social-drafts */
    public static function index(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        Response::json($pdo->query('SELECT * FROM social_post_drafts ORDER BY created_at DESC')->fetchAll());
    }

    /** POST /api/v1/admin/social-drafts/generate */
    public static function generate(): void
    {
        AuthMiddleware::requireAuth();
        $result = self::generateDraft();
        if (!$result) {
            Response::error('Could not generate a draft — either every LinkedIn idea in the current 30-day plan has already been used (generate a fresh one in Admin -> Content Ideas), or no AI provider is configured/reachable.', 502);
        }
        Response::json($result, 201);
    }

    /** PATCH /api/v1/admin/social-drafts/{id} — body: {content?, short_content?, hashtags?, status?} */
    public static function update(array $params): void
    {
        AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM social_post_drafts WHERE id = ?');
        $stmt->execute([$id]);
        $existing = $stmt->fetch();
        if (!$existing) {
            Response::error('Draft not found.', 404);
        }

        $fields = [];
        $values = [];
        foreach (['content', 'short_content', 'hashtags', 'image_url', 'linkedin_post_urn'] as $key) {
            if (array_key_exists($key, $data)) {
                $fields[] = "$key = ?";
                $values[] = trim((string) $data[$key]) !== '' ? trim((string) $data[$key]) : null;
            }
        }
        if (array_key_exists('status', $data)) {
            if (!in_array($data['status'], ['draft', 'approved', 'rejected'], true)) {
                Response::error('Invalid status.', 422);
            }
            $fields[] = 'status = ?';
            $values[] = $data['status'];
        }
        if (!$fields) {
            Response::error('Nothing to update.', 422);
        }

        $values[] = $id;
        $pdo->prepare('UPDATE social_post_drafts SET ' . implode(', ', $fields) . ", updated_at = datetime('now') WHERE id = ?")
            ->execute($values);

        if ($existing['status'] !== 'approved' && ($data['status'] ?? null) === 'approved') {
            self::applyApproval($pdo, $id);
        }

        Response::json(['status' => 'updated']);
    }

    /**
     * The side effects of approving a draft — fires the social_post_approved
     * integration event and publishes to LinkedIn if connected. Shared by
     * the manual "Approve" click in update() and generate_social_drafts.php,
     * which calls this immediately after generation when social_draft_auto_approve
     * is on, so an auto-approved draft behaves identically to a hand-approved one.
     */
    public static function applyApproval(\PDO $pdo, int $id): void
    {
        $stmt = $pdo->prepare('SELECT * FROM social_post_drafts WHERE id = ?');
        $stmt->execute([$id]);
        $fresh = $stmt->fetch();
        if (!$fresh) {
            return;
        }

        IntegrationEvent::log('social_post_approved', [
            'id' => (int) $fresh['id'],
            'content' => $fresh['content'],
            'short_content' => $fresh['short_content'],
            'hashtags' => $fresh['hashtags'],
            'image_url' => $fresh['image_url'],
            'source_type' => $fresh['source_type'],
        ]);
        $pdo->prepare("UPDATE social_post_drafts SET status = 'approved', sent_to_makecom = 1, updated_at = datetime('now') WHERE id = ?")->execute([$id]);

        self::publishToLinkedIn($pdo, $fresh);
    }

    /**
     * Best-effort direct LinkedIn post via Composio, run on approval — never
     * blocks or fails the approval itself. Payload shape (author/commentary/
     * visibility) is confirmed against a live account's 400 response; the
     * image attachment (content.media) below is not yet confirmed — see the
     * comment at its assembly. Records success or the last error in
     * published_at/publish_error rather than failing silently.
     */
    private static function publishToLinkedIn(\PDO $pdo, array $draft): void
    {
        if (empty(Settings::get('composio_api_key'))) {
            return;
        }
        $accountId = Settings::get('composio_linkedin_account_id');
        if (empty($accountId)) {
            return;
        }
        $tool = Settings::get('composio_linkedin_post_tool') ?: 'LINKEDIN_CREATE_LINKED_IN_POST';

        // Confirmed against a live account (2026-08-08): LinkedIn's post API
        // rejects requests missing 'author' (the poster's URN) — the earlier
        // guessed payload shapes below all 400'd with "Following fields are
        // missing: {'commentary', 'author'}". No point retrying without it.
        $authorUrn = Settings::get('composio_linkedin_author_urn');
        if (empty($authorUrn)) {
            self::writeWithRetry(
                $pdo,
                'UPDATE social_post_drafts SET publish_error = ? WHERE id = ?',
                ['LinkedIn author URN not set — add it in Settings > Integrations (composio_linkedin_author_urn).', $draft['id']]
            );
            return;
        }

        $text = trim((string) $draft['content']);
        if (!empty($draft['hashtags'])) {
            $text .= "\n\n" . trim((string) $draft['hashtags']);
        }

        $payload = ['author' => $authorUrn, 'commentary' => $text, 'visibility' => 'PUBLIC'];

        // Not confirmed against a live account yet (no draft has carried an
        // image_url through to this point before — see SocialImage). LinkedIn's
        // own Posts API needs an image pre-registered as a urn:li:image:... via
        // a separate two-step upload, which Composio's generic proxy has no
        // clean way to do (a raw binary PUT, not a JSON call) — so this instead
        // gambles that Composio's create-post tool accepts a plain public image
        // URL directly in content.media.id and does that registration/upload
        // itself server-side, the same convenience shape several other
        // Composio-wrapped "create post" actions expose. If LinkedIn/Composio
        // rejects this shape, the failure path below logs the real response so
        // the correct field name can be read off it directly, the same way the
        // missing 'author' field was originally diagnosed.
        if (!empty($draft['image_url'])) {
            $imageUrl = str_starts_with((string) $draft['image_url'], 'http')
                ? (string) $draft['image_url']
                : 'https://princecaleb.dev' . $draft['image_url'];
            $payload['content'] = ['media' => ['id' => $imageUrl]];
        }

        // Wrapped in try/catch: shared hosting runs several PHP workers and
        // cron jobs against the same SQLite file, and a lock that outlasts
        // Database's busy_timeout throws PDOException. Since this whole
        // method is documented as best-effort and must never fail the
        // approval itself, a DB write failure here should degrade to a log
        // line, not a 500 that also wipes out the approval's own status update.
        try {
            $result = Composio::executeTool($tool, $accountId, $payload);
            if ($result !== null) {
                // Field name for the created post's ID/URN isn't confirmed
                // against a live account yet — try the plausible candidates
                // and store whichever is present, so Radar's stats lookup has
                // something to query even if the exact field name needs
                // adjusting later. Logging the full raw response here (once,
                // on the success path only — the failure path already logs
                // its own errors) so the real shape can be read from Error
                // Logs instead of guessed at again, the same way the missing
                // 'author' field was diagnosed.
                error_log("Composio LinkedIn publish succeeded for draft {$draft['id']}, raw response: " . json_encode($result));
                $urn = self::extractPostUrn($result);
                self::writeWithRetry(
                    $pdo,
                    "UPDATE social_post_drafts SET published_at = datetime('now'), publish_error = NULL, linkedin_post_urn = ? WHERE id = ?",
                    [$urn, $draft['id']]
                );
                Settings::set('composio_linkedin_last_error', '');
                return;
            }

            $lastError = Composio::lastError() ?: 'No detailed Composio error was returned.';
            self::writeWithRetry(
                $pdo,
                'UPDATE social_post_drafts SET publish_error = ? WHERE id = ?',
                [$lastError, $draft['id']]
            );
            Settings::set('composio_linkedin_last_error', date('c') . ' - LinkedIn publish failed using ' . $tool . ': ' . $lastError);
            error_log("Composio LinkedIn publish failed for draft {$draft['id']} using {$tool}: {$lastError}");
        } catch (\Throwable $e) {
            error_log("Composio LinkedIn publish for draft {$draft['id']} threw: " . $e->getMessage());
        }
    }

    /**
     * social_post_drafts sees concurrent writes from the admin UI, the
     * generate_social_drafts.php cron, and this best-effort publish step —
     * SQLite's busy_timeout (see Database::get()) already waits out most
     * overlap, but a handful of "database is locked" errors have still
     * reached this exact write in production. A few short retries here are
     * cheap insurance so the whole point of this method — recording *why*
     * a post did or didn't go through — doesn't itself get lost to a lock.
     */
    private static function writeWithRetry(\PDO $pdo, string $sql, array $params, int $attempts = 3): bool
    {
        for ($i = 1; $i <= $attempts; $i++) {
            try {
                $pdo->prepare($sql)->execute($params);
                return true;
            } catch (\PDOException $e) {
                if ($i === $attempts || !str_contains($e->getMessage(), 'database is locked')) {
                    error_log('writeWithRetry giving up: ' . $e->getMessage());
                    return false;
                }
                usleep(300000 * $i);
            }
        }
        return false;
    }

    /**
     * Confirmed against a live account (2026-08-08): LinkedIn's Posts API
     * returns the new post's ID only in the x-restli-id response header, not
     * the JSON body — Composio surfaces it as data.x_restli_id, already
     * formatted as a full share URN (e.g. "urn:li:share:749..."), which is
     * exactly the shape RadarController's LINKEDIN_GET_SHARE_STATISTICS
     * lookup expects for its shareUrn parameter. The other keys are kept as
     * a fallback in case Composio's shape varies by tool/account.
     *
     * @param array<string,mixed> $result Composio::executeTool()'s decoded response
     */
    private static function extractPostUrn(array $result): ?string
    {
        foreach (['x_restli_id', 'id', 'postId', 'post_id', 'urn', 'shareUrn', 'activityUrn'] as $key) {
            $value = $result['data'][$key] ?? $result[$key] ?? null;
            if (is_string($value) && $value !== '') {
                return $value;
            }
        }
        return null;
    }

    /** DELETE /api/v1/admin/social-drafts/{id} */
    public static function destroy(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);
        Database::get()->prepare('DELETE FROM social_post_drafts WHERE id = ?')->execute([$id]);
        ActivityLog::log($user, 'deleted', 'social_draft', $id);
        Response::json(['status' => 'deleted']);
    }

    /**
     * Picks the next unused LinkedIn content idea (earliest day_number
     * first) and drafts it, marking the idea 'used' only once a draft was
     * actually created — a failed AI call leaves the idea available to try
     * again on the next run rather than silently burning a plan day.
     *
     * @return array{id:int}|null
     */
    public static function generateDraft(): ?array
    {
        $pdo = Database::get();
        $stmt = $pdo->query(
            "SELECT * FROM content_ideas WHERE platform = 'linkedin' AND status = 'idea'
             ORDER BY day_number ASC, id ASC LIMIT 1"
        );
        $idea = $stmt->fetch();
        if (!$idea) {
            error_log('Social draft generation: no unused LinkedIn ideas in the 30-day plan — generate a fresh one in Admin -> Content Ideas.');
            return null;
        }

        $result = self::generateFromIdea($idea);
        if ($result !== null) {
            $pdo->prepare("UPDATE content_ideas SET status = 'used' WHERE id = ?")->execute([$idea['id']]);
        }

        return $result;
    }

    /**
     * Turns a Content Ideas row (Admin -> Content Ideas, "Turn into draft")
     * into a real AI-drafted social_post_drafts row — the one deliberate
     * link between what was otherwise built as two standalone systems.
     * LinkedIn ideas only; ContentIdeasController rejects YouTube ideas
     * before this is ever called, since a text post isn't the right output
     * for a video idea (that would be Reel's job, not built yet).
     *
     * Every draft also gets the standing branded card (SocialImage) with the
     * idea's own title/hook as the headline — best-effort: a failed render
     * (missing GD/FreeType, bundled fonts absent) just leaves image_url
     * null rather than failing the draft itself, same as every other
     * best-effort step in this file.
     *
     * @return array{id:int}|null
     */
    public static function generateFromIdea(array $idea): ?array
    {
        $pdo = Database::get();
        $result = AiText::generateWithProvider(self::promptForContentIdea($idea), null, 20);
        if ($result === null) {
            error_log('Social draft generation from content idea: all configured AI providers failed.');
            return null;
        }

        $text = trim((string) preg_replace('/^```(?:json)?\s*|```\s*$/m', '', $result['text']));
        $parsed = json_decode($text, true);
        if (!is_array($parsed) || empty($parsed['content'])) {
            error_log('Social draft generation from content idea: could not parse JSON from model output: ' . substr($text, 0, 800));
            return null;
        }

        $image = SocialImage::generate((string) ($idea['title'] ?? ''));
        if ($image === null) {
            error_log("Social draft generation: branded card render failed for idea {$idea['id']} — draft will have no image.");
        }

        $stmt = $pdo->prepare(
            'INSERT INTO social_post_drafts (source_type, source_id, content, short_content, hashtags, image_url, ai_provider) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            'content_idea',
            $idea['id'],
            (string) $parsed['content'],
            !empty($parsed['short_content']) ? (string) $parsed['short_content'] : null,
            !empty($parsed['hashtags']) ? (string) $parsed['hashtags'] : null,
            $image['url'] ?? null,
            $result['provider'],
        ]);

        return ['id' => (int) $pdo->lastInsertId()];
    }

    private static function promptForContentIdea(array $idea): string
    {
        $base = 'You are drafting a social media post for Prince Caleb, a solo developer who builds AI voice agents, chatbots, and business automations on 12+ years of web & mobile engineering. '
            . "Keep it authentic and professional, not salesy or hyperbolic — no invented statistics or false urgency.\n\n";
        $base .= SharedAgentTools::publicContactContext() . "\n\n";
        $jsonSpec = 'Return JSON only: {"content": "2-4 sentence post for LinkedIn", '
            . '"short_content": "a punchier version under 260 characters", '
            . '"hashtags": "3-5 relevant hashtags separated by spaces"} — no markdown fences, no commentary.';

        return $base . "Write a LinkedIn post based on this content idea from Caleb's own content calendar:\n"
            . "Title/hook: {$idea['title']}\nAngle: {$idea['description']}\n\n"
            . "Expand it into a real post — don't just restate the title and angle verbatim.\n\n{$jsonSpec}";
    }
}
