<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\AiText;
use App\Support\Composio;
use App\Support\Database;
use App\Support\IntegrationEvent;
use App\Support\Mailer;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;
use App\Support\SocialImage;
use App\Support\WebResearch;
use App\Support\OwnerMessages;
use App\Support\WhatsAppNotifier;

/**
 * AI-drafted social posts. generateDraft() is shared between the scheduled
 * cron script (database/generate_social_drafts.php) and the admin's manual
 * "Generate now" button. Drafts are sourced exclusively from the 30-day
 * Content Ideas queue (Admin -> Content Ideas, LinkedIn ideas only) — the
 * earlier blog-post/project/testimonial-announcement and generic-evergreen
 * fallback sourcing was removed 2026-08-11 so every auto-generated post
 * traces back to a real, reviewable plan entry instead of whatever happened
 * to publish most recently. Which idea gets drafted is calendar-driven, not
 * queue-driven: day_number is matched against today's actual date relative
 * to when the current plan was generated (see generateDraft()), so running
 * this more than once a day doesn't race ahead through the plan, and a day
 * with no unused LinkedIn idea (YouTube day, already drafted, outside the
 * current plan) correctly yields nothing rather than substituting a
 * different day. Approval records a social_post_approved integration event
 * (see IntegrationEvent) for any external consumer, and — separately, if a
 * LinkedIn Composio account is connected — actually publishes the post to
 * LinkedIn directly (see publishToLinkedIn()), recording the outcome in
 * published_at/publish_error so approval can genuinely mean "posted," not
 * just "queued somewhere else."
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
            Response::error("Could not generate a draft — today's plan day has no unused LinkedIn idea (it may be a YouTube day, already drafted, or outside the current 30-day plan), or no AI provider is configured/reachable.", 502);
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
     * Reminds Caleb by WhatsApp (and email, as a backup since Twilio free text
     * is rejected outside its 24h session window) that a fresh draft is
     * waiting for him to add an image and approve. Only called for drafts that
     * won't post on their own (auto-approve off). Never throws.
     */
    public static function notifyDraftReady(int $draftId): void
    {
        try {
            $stmt = Database::get()->prepare('SELECT content FROM social_post_drafts WHERE id = ?');
            $stmt->execute([$draftId]);
            $content = (string) ($stmt->fetchColumn() ?: '');
            $snippet = mb_substr(trim($content), 0, 160) . (mb_strlen(trim($content)) > 160 ? '...' : '');
            $link = 'https://princecaleb.dev/admin/social-drafts';
            $body = "New LinkedIn draft #{$draftId} is ready. Add your image and approve it to post.

\"{$snippet}\"

{$link}";

            $route = OwnerMessages::route([
                'agent' => 'radar', 'kind' => 'draft_ready', 'tier' => 'normal',
                'subject' => "LinkedIn draft #{$draftId} is ready to review", 'body' => $body, 'ref' => 'social_draft:' . $draftId,
            ]);
            if ($route['action'] !== 'send') {
                return; // held for the digest
            }

            if (WhatsAppNotifier::isOwnerConfigured()) {
                WhatsAppNotifier::sendOwnerAlert($body, [
                    'name' => 'Social drafts',
                    'reason' => 'New LinkedIn draft ready to review',
                    'summary' => $snippet,
                    'message' => mb_substr($body, 0, 900),
                ]);
            }

            $to = Settings::get('notification_email') ?: Settings::get('social_email');
            if ($to) {
                Mailer::send($to, "LinkedIn draft #{$draftId} is ready to review", $body);
            }
        } catch (\Throwable $e) {
            error_log('Social draft ready notification failed: ' . $e->getMessage());
        }
    }

    /**
     * Best-effort direct LinkedIn post via Composio, run on approval — never
     * blocks or fails the approval itself. Payload shape (author/commentary/
     * visibility) is confirmed against a live account's 400 response. Image
     * attachment (registerLinkedInImage()) is not yet confirmed against a
     * live account — see the comment there. Records success or the last
     * error in published_at/publish_error rather than failing silently.
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

        // Posted directly against LinkedIn's own REST API (via Composio's
        // proxy) rather than the managed LINKEDIN_CREATE_LINKED_IN_POST tool
        // — confirmed live 2026-09-21 (draft #454/db id 20) that the managed
        // tool 500s with 426 NONEXISTENT_VERSION: Composio pins it to a
        // LinkedIn-Version ("20241101") LinkedIn has since deactivated, and
        // nothing in executeTool()'s params can override that header. Body
        // shape is LinkedIn's own documented Posts API schema (Microsoft
        // Learn, /rest/posts), not the flat author/commentary/images shape
        // the old managed tool used.
        $payload = [
            'author' => $authorUrn,
            'commentary' => $text,
            'visibility' => 'PUBLIC',
            'distribution' => [
                'feedDistribution' => 'MAIN_FEED',
                'targetEntities' => [],
                'thirdPartyDistributionChannels' => [],
            ],
            'lifecycleState' => 'PUBLISHED',
            'isReshareDisabledByAuthor' => false,
        ];

        if (!empty($draft['image_url'])) {
            $imageUrl = str_starts_with((string) $draft['image_url'], 'http')
                ? (string) $draft['image_url']
                : 'https://princecaleb.dev' . $draft['image_url'];
            $imageUrn = self::registerLinkedInImage($accountId, $authorUrn, $imageUrl);
            if ($imageUrn !== null) {
                $payload['content'] = ['media' => ['id' => $imageUrn]];
            }
            // Written unconditionally (success clears it to NULL) so this
            // survives regardless of the overall post's outcome below —
            // publish_error itself gets overwritten to NULL on a successful
            // post, which is exactly what erased the evidence the first time
            // this broke (see schema.sql's comment on this column).
            self::writeWithRetry(
                $pdo,
                'UPDATE social_post_drafts SET image_publish_error = ? WHERE id = ?',
                [self::$lastImageError, $draft['id']]
            );
        }

        // Wrapped in try/catch: shared hosting runs several PHP workers and
        // cron jobs against the same SQLite file, and a lock that outlasts
        // Database's busy_timeout throws PDOException. Since this whole
        // method is documented as best-effort and must never fail the
        // approval itself, a DB write failure here should degrade to a log
        // line, not a 500 that also wipes out the approval's own status update.
        try {
            $result = Composio::executeProxy(
                $accountId,
                'https://api.linkedin.com/rest/posts',
                'POST',
                [
                    // LinkedIn requires this header on every /rest call and does
                    // not default to a version itself (Microsoft Learn, Posts
                    // API docs, fetched 2026-09-21) — YYYYMM, supported >=1 year.
                    ['name' => 'Linkedin-Version', 'value' => date('Ym'), 'type' => 'header'],
                    ['name' => 'X-Restli-Protocol-Version', 'value' => '2.0.0', 'type' => 'header'],
                ],
                $payload
            );
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
            Settings::set('composio_linkedin_last_error', date('c') . ' - LinkedIn publish failed: ' . $lastError);
            error_log("Composio LinkedIn publish failed for draft {$draft['id']}: {$lastError}");
        } catch (\Throwable $e) {
            error_log("Composio LinkedIn publish for draft {$draft['id']} threw: " . $e->getMessage());
        }
    }

    /**
     * Registers our branded card image as a real LinkedIn image asset and
     * returns its urn:li:image:... — the id publishToLinkedIn() needs in
     * payload.images. Two Composio calls, matching LinkedIn's own Images API:
     * LINKEDIN_INITIALIZE_IMAGE_UPLOAD mints a presigned upload URL + the
     * asset urn, then a PUT to that URL supplies the actual bytes. LinkedIn
     * requires the connected account's own OAuth token as a Bearer header on
     * that PUT (confirmed in LinkedIn's docs) — a token this app never holds
     * directly (Composio redacts it from connected-account responses) — so
     * the PUT goes through Composio's proxy passing binary_body.url, which
     * has Composio fetch our public image URL itself and upload it with the
     * token attached server-side, rather than us handling raw bytes at all.
     * Confirmed against a live account 2026-09-21 (draft #451): the
     * initialize response nests the urn/upload url directly under `data`
     * (no `response_dict`/`value` wrapper) and uses snake_case `upload_url`,
     * not `uploadUrl` — the camelCase-only check was silently treating every
     * successful initialize call as a failure and skipping the PUT entirely,
     * so no post ever actually got an image attached. Still calls error_log() at
     * each step, but that turned out not to be reliable evidence on its own:
     * a real draft published with a real image_url and got a real
     * linkedin_post_urn back with zero matching log entries anywhere
     * (confirmed 2026-09-18) — auto-approve runs this under the CLI SAPI
     * (cron), where PHP's error_log defaults to stderr, and the cron entries
     * in README.md redirect only stdout (`> /dev/null`), so stderr goes to
     * the cron owner's mail (or nowhere) rather than a file
     * Admin -> Error Logs reads. self::$lastImageError is the durable
     * version: publishToLinkedIn() writes it to the draft's own
     * image_publish_error column regardless of SAPI, so a future failure is
     * visible in Admin -> Social Drafts itself. Returns null (never throws)
     * on any failure — publishToLinkedIn() then just posts without an image
     * rather than losing the whole post.
     */
    private static string $lastImageError = '';

    private static function registerLinkedInImage(string $accountId, string $authorUrn, string $imageUrl): ?string
    {
        self::$lastImageError = '';

        $init = Composio::executeTool('LINKEDIN_INITIALIZE_IMAGE_UPLOAD', $accountId, ['owner' => $authorUrn]);
        if ($init === null) {
            self::$lastImageError = 'Initialize failed: ' . (Composio::lastError() ?: 'unknown');
            error_log('LinkedIn image upload: initialize failed: ' . (Composio::lastError() ?: 'unknown'));
            return null;
        }
        error_log('LinkedIn image upload: initialize raw response: ' . json_encode($init));

        $value = $init['data']['response_dict']['value']
            ?? $init['data']['value']
            ?? $init['value']
            ?? $init['data']
            ?? [];
        $uploadUrl = $value['uploadUrl'] ?? $value['upload_url'] ?? null;
        $urn = $value['image'] ?? null;
        if (empty($uploadUrl) || empty($urn)) {
            self::$lastImageError = 'Initialize response missing uploadUrl/image: ' . mb_substr(json_encode($init) ?: '', 0, 1200);
            error_log('LinkedIn image upload: initialize response missing uploadUrl/image: ' . json_encode($init));
            return null;
        }

        $put = Composio::executeProxy($accountId, (string) $uploadUrl, 'PUT', [], null, ['url' => $imageUrl]);
        if ($put === null) {
            self::$lastImageError = 'PUT to presigned URL failed: ' . (Composio::lastError() ?: 'unknown');
            error_log('LinkedIn image upload: PUT to presigned URL failed: ' . (Composio::lastError() ?: 'unknown'));
            return null;
        }
        error_log('LinkedIn image upload: PUT succeeded, raw response: ' . json_encode($put) . ', urn: ' . $urn);

        return (string) $urn;
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
     * Confirmed against a live account (2026-09-21, draft #457/db id 21):
     * LinkedIn's Posts API returns the new post's ID only in the
     * x-restli-id response header, not the JSON body (data is "" on a 201).
     * Since publishToLinkedIn() now calls executeProxy() directly rather
     * than the old managed tool, Composio surfaces response headers under
     * result.headers (hyphenated key, e.g. "x-restli-id"), not data.
     * Already formatted as a full share URN (e.g. "urn:li:share:749..."),
     * which is exactly the shape RadarController's
     * LINKEDIN_GET_SHARE_STATISTICS lookup expects for its shareUrn
     * parameter. The data/top-level keys are kept as a fallback in case
     * Composio ever returns a non-empty body instead.
     *
     * @param array<string,mixed> $result Composio::executeProxy()'s decoded response
     */
    private static function extractPostUrn(array $result): ?string
    {
        $headerUrn = $result['headers']['x-restli-id'] ?? null;
        if (is_string($headerUrn) && $headerUrn !== '') {
            return $headerUrn;
        }
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
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT source_type, source_id, status FROM social_post_drafts WHERE id = ?');
        $stmt->execute([$id]);
        $draft = $stmt->fetch();
        $pdo->prepare('DELETE FROM social_post_drafts WHERE id = ?')->execute([$id]);
        // Give the idea back so it can be drafted again, unless the post already
        // went out or another draft still uses it.
        if ($draft && $draft['source_type'] === 'content_idea' && $draft['status'] !== 'approved') {
            $pdo->prepare(
                "UPDATE content_ideas SET status = 'idea'
                 WHERE id = ? AND status = 'used'
                   AND NOT EXISTS (SELECT 1 FROM social_post_drafts d
                                   WHERE d.source_type = 'content_idea' AND d.source_id = content_ideas.id)"
            )->execute([(int) $draft['source_id']]);
        }
        ActivityLog::log($user, 'deleted', 'social_draft', $id);
        Response::json(['status' => 'deleted']);
    }

    /**
     * Drafts whichever LinkedIn content idea's day_number lines up with
     * today's actual calendar date — day 1 is the date the current 30-day
     * plan was generated (every row in a batch shares that generated_at
     * timestamp, since "Generate" replaces all 30 at once), so day N is
     * generated_at + (N-1) days. This is a real calendar, not a queue:
     * clicking "Generate now" five times in one day drafts the same day's
     * idea once (already 'used' after the first) rather than racing ahead
     * through the plan, and a day whose only idea is YouTube (or that's
     * already been used, or falls outside the current plan's 30 days)
     * correctly produces nothing rather than substituting a different day's
     * content. Marks the idea 'used' only once a draft was actually
     * created — a failed AI call leaves it available to retry today.
     *
     * @return array{id:int}|null
     */
    public static function generateDraft(): ?array
    {
        $pdo = Database::get();

        $planStart = $pdo->query("SELECT MIN(date(generated_at)) FROM content_ideas")->fetchColumn();
        if (empty($planStart)) {
            error_log('Social draft generation: no content ideas plan exists — generate one in Admin -> Content Ideas.');
            return null;
        }

        $dayNumber = (int) ((strtotime(gmdate('Y-m-d')) - strtotime((string) $planStart)) / 86400) + 1;

        // An idea is available when it is still unused, or was used but its
        // draft has since been deleted (a deleted draft used to leave its idea
        // stuck on "used" forever, so it could never be drafted again).
        $available = "(status = 'idea' OR (status = 'used' AND NOT EXISTS (
            SELECT 1 FROM social_post_drafts d
            WHERE d.source_type = 'content_idea' AND d.source_id = content_ideas.id)))";

        $stmt = $pdo->prepare(
            "SELECT * FROM content_ideas WHERE day_number = ? AND platform = 'linkedin' AND {$available} LIMIT 1"
        );
        $stmt->execute([$dayNumber]);
        $idea = $stmt->fetch();

        // Nothing for today's date (a YouTube/TikTok day, or that idea already
        // has a draft): go back to the beginning of the plan and take the
        // earliest LinkedIn idea that was never drafted, for as long as the
        // 30-day plan is still running. Once the plan's 30 days are over,
        // stop rather than keep drafting from a stale plan.
        if (!$idea && $dayNumber >= 1 && $dayNumber <= 30) {
            $idea = $pdo->query(
                "SELECT * FROM content_ideas WHERE platform = 'linkedin' AND {$available}
                 ORDER BY day_number ASC LIMIT 1"
            )->fetch();
        }
        if (!$idea) {
            error_log("Social draft generation: no unused LinkedIn idea left to draft (plan day {$dayNumber}) — every LinkedIn idea has a draft, or the 30-day plan is over. Generate a new plan in Admin -> Content Ideas.");
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
        $source = ContentIdeasController::sourcePostFor($pdo, $idea);
        $research = WebResearch::search((string) ($idea['title'] ?? ''));
        // A full structured post plus JSON needs far more than the 8s a short
        // reply does, and a 20s budget shared across six providers timed out
        // DeepSeek and Gemini before Anthropic was tried.
        set_time_limit(120);
        $result = AiText::generateWithProvider(self::promptForContentIdea($idea, $research, $source), null, 75);
        if ($result === null) {
            error_log('Social draft generation from content idea: all configured AI providers failed.');
            return null;
        }

        $text = trim((string) preg_replace('/^```(?:json)?\s*|```\s*$/m', '', $result['text']));
        $parsed = self::decodeModelJson($text);
        if (!is_array($parsed) || empty($parsed['content'])) {
            error_log('Social draft generation from content idea: could not parse JSON from model output: ' . substr($text, 0, 800));
            return null;
        }

        $image = SocialImage::generate((string) ($idea['title'] ?? ''));
        if ($image === null) {
            error_log("Social draft generation: branded card render failed for idea {$idea['id']} — draft will have no image.");
        }

        $stmt = $pdo->prepare(
            'INSERT INTO social_post_drafts (source_type, source_id, content, short_content, hashtags, image_url, ai_provider, research_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            'content_idea',
            $idea['id'],
            (string) $parsed['content'],
            !empty($parsed['short_content']) ? (string) $parsed['short_content'] : null,
            !empty($parsed['hashtags']) ? (string) $parsed['hashtags'] : null,
            $image['url'] ?? null,
            $result['provider'],
            self::buildResearchNotes($parsed['angles'] ?? [], $research, $source),
        ]);

        return ['id' => (int) $pdo->lastInsertId()];
    }

    /**
     * @param array<int,array{title:string,link:string,snippet:string,date:?string}> $research
     * @param array{text:string,url:?string}|null $source the real post this idea came from
     */
    private static function promptForContentIdea(array $idea, array $research = [], ?array $source = null): string
    {
        $base = 'You are drafting a social media post for Prince Caleb, a solo developer who builds AI voice agents, chatbots, and business automations on 12+ years of web & mobile engineering. '
            . "Keep it authentic and professional, not salesy or hyperbolic — no invented statistics or false urgency.\n\n";
        $base .= SharedAgentTools::publicContactContext() . "\n\n";
        $jsonSpec = 'Return JSON only: {"content": "the full LinkedIn post, with every line break written as \n", '
            . '"angles": ["3 to 4 short lines, each one a prevailing take from the research, saying which one the post is built on"], '
            . '"short_content": "a punchier version under 260 characters", '
            . '"hashtags": "3-5 relevant hashtags separated by spaces"} — no markdown fences, no commentary.';

        return $base . "Write a LinkedIn post based on this content idea from Caleb's own content calendar:\n"
            . "Title/hook: {$idea['title']}\nAngle: {$idea['description']}\n\n"
            . self::sourcePromptBlock($source)
            . self::researchPromptBlock($research)
            . "Structure it in this order. Layout rule: write each block as a real paragraph of 2 to 4 full "
            . "sentences that belong together, with a blank line between paragraphs. Do not put every sentence on "
            . "its own line, and never stack several one-sentence paragraphs in a row, because that reads choppy. "
            . "The only things that get their own line are the hook, the takeaway, the closing question, and the "
            . "arrow points in block 4, which are short phrases rather than full paragraphs.\n"
            . "1. HOOK: line 1 is a strong observation or a claim most people in the industry get wrong. "
            . "Under 15 words, and it must work alone because LinkedIn cuts the post off after the first lines.\n"
            . "2. PROBLEM: one paragraph naming the familiar behavior, how businesses usually handle this today, "
            . "written as flowing sentences and not a stacked list.\n"
            . "3. SHIFT: the different way of thinking. Caleb's actual perspective and point of view. "
            . "This is the most important part: it must read like expertise and a real opinion, never a generic "
            . "explainer that any AI tool could have written.\n"
            . "4. INSIGHT AND PRACTICAL EXAMPLE: one short lead-in sentence, then 3 to 5 short points, each a "
            . "brief phrase or single sentence on its own line starting with the arrow character \u{2192}, with no "
            . "blank lines between the points. They show what is now possible or what was there all along.\n"
            . "5. TAKEAWAY: one or two punchy lines that sum up the shift, for example 'X isn't the end of the "
            . "process. It's the raw material for the next one.'\n"
            . "6. SPECIFIC QUESTION as the last line. Not 'What do you think?' and not 'Comment below.' Ask about the "
            . "reader's own business so the right people want to describe their situation, and make it easy to "
            . "answer in one sentence, for example: 'For those running webinars, what's the one part of your "
            . "follow-up you still do manually?' Ask about a problem or a current habit. Never ask for a sale, "
            . "never say DM me or contact me, and never promise a free download, audit or discount.\n\n"
            . "Voice and rules:\n"
            . "- Conversational first person, plain words, like Caleb talking to a business owner. No corporate jargon.\n"
            . "- Do not pitch. Do not list Caleb's services, say what he builds or sells, or describe his business "
            . "unless the topic itself is about it. The post earns trust by showing how he thinks, and the "
            . "commercial conversation should come from readers replying, not from a plug inside the post.\n"
            . "- 900 to 1,300 characters in total. No emojis, no em dashes, no bold or markdown symbols, and avoid "
            . "parentheses and square brackets (LinkedIn's API can cut a post off at them).\n"
            . "- Do not put hashtags inside the post; they go in the hashtags field.\n"
            . "- Expand the idea into a real post, do not just restate the title and angle, and never invent "
            . "statistics, client names or results.\n\n{$jsonSpec}";
    }

    /**
     * The real post this content idea was grounded on, so the draft builds on
     * what that post actually said instead of only the idea's short title
     * and angle.
     *
     * @param array{text:string,url:?string}|null $source
     */
    private static function sourcePromptBlock(?array $source): string
    {
        if ($source === null) {
            return '';
        }
        return "Source post: this idea was grounded on a real LinkedIn post"
            . ($source['url'] ? " ({$source['url']})" : '') . ". Its text is below. Build the new post on this "
            . "post's core topic and point, then add Caleb's own perspective on it (the SHIFT). It must be an "
            . "original post in different words and a different structure: do not copy sentences or phrases, "
            . "do not mention or link the source, and do not present its claims or numbers as Caleb's own results.\n"
            . "\"" . $source['text'] . "\"\n\n";
    }

    /**
     * @param array<int,array{title:string,link:string,snippet:string,date:?string}> $research
     */
    private static function researchPromptBlock(array $research): string
    {
        if ($research === []) {
            return '';
        }
        $lines = [];
        foreach ($research as $i => $r) {
            $lines[] = ($i + 1) . '. ' . $r['title'] . ($r['date'] ? ' (' . $r['date'] . ')' : '')
                . ($r['snippet'] !== '' ? ': ' . $r['snippet'] : '');
        }
        return "Research: this is what people are currently saying about the topic (live web search). "
            . "Use it to find the strongest, most useful current take. Build the post on the best perspective, or "
            . "on a clear stance against the consensus when Caleb's own work supports it, and write it as his own "
            . "view in first person ('I think', 'In my experience'). Do not copy phrasing from any result, do not "
            . "quote anyone, and do not state a fact from a result that isn't in the snippet. Never invent a "
            . "personal story or client result for Caleb; opinions are fine, made-up experiences are not.\n"
            . implode("\n", $lines) . "\n\n";
    }

    /**
     * The "angles considered" note shown with the draft so Caleb can see what
     * the post was built on before approving: the model's own summary of the
     * takes it weighed, then the source links it searched.
     *
     * @param mixed $angles
     * @param array<int,array{title:string,link:string,snippet:string,date:?string}> $research
     * @param array{text:string,url:?string}|null $source
     */
    private static function buildResearchNotes(mixed $angles, array $research, ?array $source = null): ?string
    {
        $parts = [];
        if ($source !== null) {
            $parts[] = 'Based on the linked post' . ($source['url'] ? ': ' . $source['url'] : '')
                . "\n\"" . mb_substr($source['text'], 0, 300) . (mb_strlen($source['text']) > 300 ? '...' : '') . "\"";
        }
        if (is_array($angles)) {
            $lines = array_values(array_filter(array_map(
                static fn($a) => is_string($a) ? trim($a) : '',
                $angles
            )));
            if ($lines !== []) {
                $parts[] = "Angles considered:\n- " . implode("\n- ", $lines);
            }
        }
        if ($research !== []) {
            $parts[] = "Sources searched:\n" . implode("\n", array_map(
                static fn(array $r): string => '- ' . $r['title'] . ' ' . $r['link'],
                $research
            ));
        }
        return $parts === [] ? null : implode("\n\n", $parts);
    }

    /**
     * Decodes the model's JSON reply. A multi-line post makes models emit raw
     * newlines inside the "content" string, which is invalid JSON, so a first
     * failure retries with newlines inside string values escaped.
     *
     * @return array<string,mixed>|null
     */
    private static function decodeModelJson(string $text): ?array
    {
        $parsed = json_decode($text, true);
        if (is_array($parsed)) {
            return $parsed;
        }
        $fixed = preg_replace_callback(
            '/"(?:[^"\\\\]|\\\\.)*"/s',
            static fn(array $m): string => str_replace(["\r\n", "\n", "\r", "\t"], ['\n', '\n', '\n', ' '], $m[0]),
            $text
        );
        $parsed = is_string($fixed) ? json_decode($fixed, true) : null;
        return is_array($parsed) ? $parsed : null;
    }
}
