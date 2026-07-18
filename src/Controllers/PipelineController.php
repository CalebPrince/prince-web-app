<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\Database;
use App\Support\Response;

/** Unified, identity-deduplicated sales pipeline across every lead source. */
class PipelineController
{
    private const STAGES = ['new', 'researching', 'contacted', 'discovery', 'proposal', 'won', 'lost'];
    private const RANK = ['lost' => 0, 'new' => 1, 'researching' => 2, 'contacted' => 3, 'discovery' => 4, 'proposal' => 5, 'won' => 6];

    public static function index(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $leads = [];

        self::collect($leads, $pdo->query("SELECT id, name, email, message, type, pipeline_stage, created_at FROM inquiries WHERE status != 'archived'")->fetchAll(),
            'inquiry', fn($r) => self::mapInquiry((string) $r['pipeline_stage']), fn($r) => $r['type'] === 'project_request' ? '/admin/quote-requests.html' : '/admin/inquiries.html',
            fn($r) => $r['message']);
        self::collect($leads, $pdo->query('SELECT id, business_name AS name, contact_email AS email, contact_phone AS phone, website_url, status, created_at FROM marketing_leads')->fetchAll(),
            'marketing', fn($r) => self::mapMarketing((string) $r['status']), fn() => '/admin/marketing-leads.html', fn($r) => $r['website_url'] ?: 'Marketing lead');
        self::collect($leads, $pdo->query('SELECT id, username AS name, lead_email AS email, platform, post_content, created_at FROM beacon_social_leads')->fetchAll(),
            'social', fn() => 'new', fn() => '/admin/agent-chat.html', fn($r) => $r['platform'] . ': ' . $r['post_content']);
        self::collect($leads, $pdo->query('SELECT id, client_name AS name, client_email AS email, client_phone AS phone, topic, status, created_at FROM appointments')->fetchAll(),
            'booking', fn($r) => $r['status'] === 'cancelled' ? 'lost' : 'discovery', fn() => '/admin/appointments.html', fn($r) => $r['topic'] ?: 'Discovery call booked');
        self::collect($leads, $pdo->query('SELECT id, client_name AS name, client_email AS email, total_amount, currency, title, status, created_at FROM proposals')->fetchAll(),
            'proposal', fn($r) => $r['status'] === 'accepted' ? 'won' : ($r['status'] === 'declined' ? 'lost' : 'proposal'), fn() => '/admin/proposals.html', fn($r) => $r['title'], true);
        self::collect($leads, $pdo->query('SELECT id, name, email, phone, created_at FROM clients')->fetchAll(),
            'client', fn() => 'won', fn() => '/admin/clients.html', fn() => 'Client account');
        self::collect($leads, $pdo->query("SELECT id, COALESCE(client_name, client_email, 'Chat lead') AS name, client_email AS email, client_phone AS phone, created_at FROM chat_sessions WHERE client_email IS NOT NULL AND client_email != ''")->fetchAll(),
            'chat', fn() => 'new', fn() => '/admin/chats.html', fn() => 'Live chat lead');
        self::collect($leads, $pdo->query('SELECT id, name, email, phone, summary, estimated_value AS total_amount, currency, initial_stage, created_at FROM manual_leads')->fetchAll(),
            'manual', fn($r) => $r['initial_stage'], fn() => '/admin/pipeline.html', fn($r) => $r['summary'], true);

        $insert = $pdo->prepare('INSERT OR IGNORE INTO pipeline_leads (lead_key, stage) VALUES (?, ?)');
        $autoUpdate = $pdo->prepare("UPDATE pipeline_leads SET stage=?, updated_at=datetime('now') WHERE lead_key=? AND manual_stage=0");
        foreach ($leads as $key => $lead) {
            $insert->execute([$key, $lead['inferred_stage']]);
            $autoUpdate->execute([$lead['inferred_stage'], $key]);
        }

        $stored = [];
        foreach ($pdo->query('SELECT id, lead_key, stage, manual_stage, notes, next_action, follow_up_at, updated_at FROM pipeline_leads')->fetchAll() as $row) {
            $stored[$row['lead_key']] = $row;
        }
        $attribution = [];
        $hasAttribution = $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='lead_attribution'")->fetchColumn();
        if ($hasAttribution) {
            foreach ($pdo->query('SELECT source_type, source_id, landing_path, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term FROM lead_attribution')->fetchAll() as $row) {
                $attribution[$row['source_type'] . ':' . $row['source_id']] = array_diff_key($row, ['source_type' => true, 'source_id' => true]);
            }
        }
        $out = [];
        foreach ($leads as $key => $lead) {
            $record = $stored[$key] ?? null;
            if (!$record) continue;
            unset($lead['inferred_stage']);
            $lead['id'] = (int) $record['id'];
            $lead['stage'] = $record['stage'];
            $lead['manual_stage'] = (bool) $record['manual_stage'];
            $lead['notes'] = (string) ($record['notes'] ?? '');
            $lead['next_action'] = (string) ($record['next_action'] ?? '');
            $lead['follow_up_at'] = $record['follow_up_at'] ?? null;
            $lead['attribution'] = null;
            foreach ($lead['sources'] as $source) {
                $sourceKey = $source['type'] . ':' . $source['id'];
                if (isset($attribution[$sourceKey])) { $lead['attribution'] = $attribution[$sourceKey]; break; }
            }
            $out[] = $lead;
        }
        usort($out, fn($a, $b) => strcmp($b['latest_at'], $a['latest_at']));
        Response::json(['leads' => $out, 'stages' => self::STAGES]);
    }

    public static function store(): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $name = trim((string) ($data['name'] ?? ''));
        $email = strtolower(trim((string) ($data['email'] ?? '')));
        $phone = trim((string) ($data['phone'] ?? ''));
        $summary = trim((string) ($data['summary'] ?? ''));
        $stage = trim((string) ($data['stage'] ?? 'new'));
        $currency = strtoupper(trim((string) ($data['currency'] ?? 'GHS')));
        $value = $data['estimated_value'] ?? 0;

        if ($name === '' || mb_strlen($name) > 200) Response::error('Enter a lead name of 200 characters or fewer.', 422);
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) Response::error('Enter a valid email address.', 422);
        if (mb_strlen($phone) > 100) Response::error('Phone number is too long.', 422);
        if ($summary === '' || mb_strlen($summary) > 5000) Response::error('Enter opportunity context of 5,000 characters or fewer.', 422);
        if (!in_array($stage, self::STAGES, true)) Response::error('Invalid pipeline stage.', 422);
        if (!preg_match('/^[A-Z]{3}$/', $currency)) Response::error('Currency must be a three-letter code.', 422);
        if (!is_numeric($value) || (float) $value < 0 || (float) $value > 999999999) Response::error('Enter a valid estimated value.', 422);
        $estimatedValue = (int) round((float) $value * 100);

        $pdo = Database::get();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('INSERT INTO manual_leads (name, email, phone, summary, estimated_value, currency, initial_stage) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$name, $email ?: null, $phone ?: null, $summary, $estimatedValue, $currency, $stage]);
            $manualId = (int) $pdo->lastInsertId();
            $leadKey = $email !== '' ? 'email:' . $email : 'manual:' . $manualId;
            $pdo->prepare('INSERT OR IGNORE INTO pipeline_leads (lead_key, stage, manual_stage) VALUES (?, ?, 1)')->execute([$leadKey, $stage]);
            $pdo->prepare("UPDATE pipeline_leads SET stage=?, manual_stage=1, updated_at=datetime('now') WHERE lead_key=?")->execute([$stage, $leadKey]);
            $pipelineId = (int) $pdo->query("SELECT id FROM pipeline_leads WHERE lead_key=" . $pdo->quote($leadKey))->fetchColumn();
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        ActivityLog::log($user, 'pipeline_lead_created', 'pipeline_lead', $pipelineId, null, ['name' => $name, 'stage' => $stage, 'source' => 'manual']);
        Response::json(['status' => 'created', 'id' => $pipelineId], 201);
    }

    public static function update(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $id = (int) $params['id'];
        $pdo = Database::get();
        $fields = []; $values = [];
        if (array_key_exists('stage', $data)) {
            $stage = (string) $data['stage'];
            if (!in_array($stage, self::STAGES, true)) Response::error('Invalid pipeline stage.', 422);
            $fields[] = 'stage=?'; $values[] = $stage; $fields[] = 'manual_stage=1';
        }
        foreach (['notes' => 5000, 'next_action' => 500] as $field => $limit) {
            if (array_key_exists($field, $data)) { $value = trim((string) $data[$field]); if (mb_strlen($value) > $limit) Response::error(ucwords(str_replace('_',' ',$field)).' is too long.', 422); $fields[] = "$field=?"; $values[] = $value ?: null; }
        }
        if (array_key_exists('follow_up_at', $data)) { $follow = trim((string) $data['follow_up_at']); if ($follow !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/', $follow)) Response::error('Invalid follow-up date.', 422); $fields[]='follow_up_at=?'; $values[]=$follow ?: null; }
        if (!$fields) Response::error('Nothing to update.', 422);
        $fields[] = "updated_at=datetime('now')"; $values[] = $id;
        $stmt = $pdo->prepare('UPDATE pipeline_leads SET '.implode(', ', $fields).' WHERE id=?');
        $stmt->execute($values);
        if ($stmt->rowCount() === 0) Response::error('Pipeline lead not found.', 404);
        if (array_key_exists('follow_up_at', $data)) $pdo->prepare("DELETE FROM notification_reads WHERE notification_key=?")->execute(['follow_up:'.$id]);
        ActivityLog::log($user, 'pipeline_lead_updated', 'pipeline_lead', $id, null, array_intersect_key($data, array_flip(['stage','next_action','follow_up_at'])));
        Response::json(['status' => 'updated']);
    }

    private static function collect(array &$leads, array $rows, string $source, callable $stage, callable $url, callable $summary, bool $hasValue = false): void
    {
        foreach ($rows as $row) {
            $email = strtolower(trim((string) ($row['email'] ?? '')));
            $key = filter_var($email, FILTER_VALIDATE_EMAIL) ? 'email:' . $email : $source . ':' . $row['id'];
            $candidateStage = $stage($row);
            if (!isset($leads[$key])) {
                $leads[$key] = [
                    'name' => trim((string) ($row['name'] ?? '')) ?: 'Unnamed lead', 'email' => $email,
                    'phone' => (string) ($row['phone'] ?? ''), 'summary' => trim((string) $summary($row)),
                    'created_at' => $row['created_at'], 'latest_at' => $row['created_at'], 'sources' => [],
                    'value' => 0, 'currency' => '', 'inferred_stage' => $candidateStage,
                ];
            }
            $lead =& $leads[$key];
            if (($row['created_at'] ?? '') > $lead['latest_at']) {
                $lead['latest_at'] = $row['created_at'];
                if (!empty($row['name'])) $lead['name'] = $row['name'];
                if (!empty($row['phone'])) $lead['phone'] = $row['phone'];
                $lead['summary'] = trim((string) $summary($row));
            }
            $lead['sources'][] = ['type' => $source, 'id' => (int) $row['id'], 'url' => $url($row)];
            if ((self::RANK[$candidateStage] ?? 0) > (self::RANK[$lead['inferred_stage']] ?? 0) || $candidateStage === 'lost') $lead['inferred_stage'] = $candidateStage;
            if ($hasValue && (int) ($row['total_amount'] ?? 0) >= $lead['value']) {
                $lead['value'] = (int) $row['total_amount'];
                $lead['currency'] = (string) ($row['currency'] ?? '');
            }
            unset($lead);
        }
    }

    private static function mapInquiry(string $stage): string
    {
        return ['new' => 'new', 'reviewing' => 'researching', 'proposal_sent' => 'proposal', 'won' => 'won', 'lost' => 'lost'][$stage] ?? 'new';
    }

    private static function mapMarketing(string $status): string
    {
        return ['pending' => 'new', 'audited' => 'researching', 'pitch_ready' => 'contacted', 'sent' => 'contacted', 'rejected' => 'lost'][$status] ?? 'new';
    }
}
