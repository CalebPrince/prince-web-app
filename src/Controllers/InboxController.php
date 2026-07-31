<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;

/** A conversation-level inbox spanning every client contact channel. */
class InboxController
{
    public static function index(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $items = [];
        $states = [];
        $ownerNumbers = array_values(array_filter(array_map(
            static fn(string $key): string => preg_replace('/\D+/', '', (string) Settings::get($key)) ?? '',
            ['owner_whatsapp_number', 'owner_voice_number']
        )));
        foreach ($pdo->query('SELECT item_key,state FROM inbox_item_states')->fetchAll() as $row) $states[$row['item_key']] = $row['state'];

        foreach ($pdo->query("SELECT id,name,email,message,type,status,project_type,budget,timeline,features,created_at
                              FROM inquiries i
                              WHERE status != 'archived'
                                AND (message NOT LIKE '[Live Chat]%'
                                     OR NOT EXISTS (SELECT 1 FROM chat_sessions cs WHERE lower(cs.client_email)=lower(i.email)))")->fetchAll() as $row) {
            $quote = $row['type'] === 'project_request';
            $items[] = [
                'key' => 'inquiry:' . $row['id'], 'source' => $quote ? 'quote' : 'inquiry', 'source_id' => (int) $row['id'],
                'name' => $row['name'], 'email' => $row['email'], 'phone' => '', 'preview' => $row['message'],
                'unread' => $row['status'] === 'unread', 'flagged' => $row['status'] === 'flagged', 'created_at' => $row['created_at'],
                'detail' => ['message' => $row['message'], 'project_type' => $row['project_type'], 'budget' => $row['budget'], 'timeline' => $row['timeline'], 'features' => $row['features']],
                'source_url' => ($quote ? '/admin/quote-requests.html' : '/admin/inquiries.html') . '?open=' . $row['id'],
            ];
        }

        foreach ($pdo->query("SELECT id,token,transcript_json,prototype_status,client_comment,client_name,client_email,client_phone,admin_seen,updated_at FROM chat_sessions WHERE transcript_json != '[]' OR client_email IS NOT NULL")->fetchAll() as $row) {
            $transcript = json_decode($row['transcript_json'], true) ?: [];
            $last = $row['client_comment'] ?: ($transcript ? (string) ($transcript[count($transcript) - 1]['text'] ?? 'Live chat conversation') : 'Live chat conversation');
            $isWhatsApp = str_starts_with($row['token'], 'whatsapp:');
            $sessionDigits = preg_replace('/\D+/', '', (string) $row['token']) ?? '';
            $isOwner = $isWhatsApp && $sessionDigits !== '' && in_array($sessionDigits, $ownerNumbers, true);
            $items[] = [
                'key' => 'chat:' . $row['id'], 'source' => $isWhatsApp ? 'whatsapp' : 'chat', 'source_id' => (int) $row['id'],
                'name' => $isOwner ? 'Prince Caleb' : ($row['client_name'] ?: 'Anonymous visitor'), 'email' => $row['client_email'] ?: '', 'phone' => $row['client_phone'] ?: '',
                'is_owner' => $isOwner,
                'preview' => $last, 'unread' => !(bool) $row['admin_seen'], 'flagged' => false, 'created_at' => $row['updated_at'],
                'detail' => ['message' => $row['client_comment'] ?: '', 'transcript' => $transcript, 'prototype_status' => $row['prototype_status'], 'is_owner' => $isOwner],
                'source_url' => '/admin/chats.html?open=' . $row['id'],
            ];
        }

        foreach ($pdo->query(
            "SELECT id,client_name,client_email,client_phone,appointment_date,appointment_time,
                    duration_minutes,topic,status,admin_seen,created_at
             FROM appointments ORDER BY created_at DESC"
        )->fetchAll() as $row) {
            $schedule = $row['appointment_date'] . ' at ' . $row['appointment_time'];
            $items[] = [
                'key' => 'appointment:' . $row['id'], 'source' => 'appointment', 'source_id' => (int) $row['id'],
                'name' => $row['client_name'], 'email' => $row['client_email'], 'phone' => $row['client_phone'] ?: '',
                'preview' => ($row['topic'] ?: 'Discovery call') . ' — ' . $schedule,
                'unread' => !(bool) $row['admin_seen'], 'flagged' => false, 'created_at' => $row['created_at'],
                'detail' => [
                    'message' => "Booking scheduled for {$schedule}.",
                    'appointment_date' => $row['appointment_date'],
                    'appointment_time' => $row['appointment_time'],
                    'duration' => $row['duration_minutes'] . ' minutes',
                    'topic' => $row['topic'] ?: '—',
                    'booking_status' => $row['status'],
                ],
                'source_url' => '/admin/appointments.html?open=' . $row['id'],
            ];
        }

        $clients = [];
        foreach ($pdo->query("SELECT m.*,c.name,c.email,c.phone FROM client_messages m JOIN clients c ON c.id=m.client_id ORDER BY m.created_at ASC")->fetchAll() as $row) {
            $id = (int) $row['client_id'];
            if (!isset($clients[$id])) $clients[$id] = ['messages' => [], 'unread' => false];
            $clients[$id]['messages'][] = ['sender_type' => $row['sender_type'], 'body' => $row['body'], 'created_at' => $row['created_at']];
            $clients[$id]['unread'] = $clients[$id]['unread'] || ($row['sender_type'] === 'client' && !(bool) $row['read_by_admin']);
            $clients[$id]['row'] = $row;
        }
        foreach ($clients as $clientId => $thread) {
            $row = $thread['row'];
            $items[] = [
                'key' => 'client:' . $clientId, 'source' => 'client', 'source_id' => $clientId, 'name' => $row['name'],
                'email' => $row['email'], 'phone' => $row['phone'] ?: '', 'preview' => $row['body'], 'unread' => $thread['unread'],
                'flagged' => false, 'created_at' => $row['created_at'], 'detail' => ['messages' => $thread['messages']],
                'source_url' => '/admin/clients.html?open=' . $clientId . '&tab=messages',
            ];
        }

        foreach ($items as &$item) {
            $item['state'] = $states[$item['key']] ?? ($item['flagged'] ? 'flagged' : 'normal');
            $item['flagged'] = $item['state'] === 'flagged';
        }
        unset($item);
        usort($items, fn($a, $b) => strcmp($b['created_at'], $a['created_at']));
        Response::json(['items' => $items]);
    }

    public static function markRead(array $params): void
    {
        AuthMiddleware::requireAuth();
        $type = (string) ($params['type'] ?? '');
        $id = (int) ($params['id'] ?? 0);
        $pdo = Database::get();
        if ($type === 'inquiry') $pdo->prepare("UPDATE inquiries SET status='read' WHERE id=? AND status='unread'")->execute([$id]);
        elseif ($type === 'chat') $pdo->prepare('UPDATE chat_sessions SET admin_seen=1 WHERE id=?')->execute([$id]);
        elseif ($type === 'appointment') $pdo->prepare('UPDATE appointments SET admin_seen=1 WHERE id=?')->execute([$id]);
        elseif ($type === 'client') $pdo->prepare("UPDATE client_messages SET read_by_admin=1 WHERE client_id=? AND sender_type='client'")->execute([$id]);
        else Response::error('Unknown inbox source.', 422);
        Response::json(['status' => 'read']);
    }

    public static function updateState(array $params): void
    {
        AuthMiddleware::requireAuth();
        $type = (string) ($params['type'] ?? '');
        $id = (int) ($params['id'] ?? 0);
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $state = (string) ($data['state'] ?? '');
        if (!in_array($type, ['inquiry', 'chat', 'appointment', 'client'], true) || $id < 1) Response::error('Unknown inbox item.', 422);
        if (!in_array($state, ['normal', 'flagged', 'archived', 'deleted'], true)) Response::error('Invalid inbox state.', 422);
        Database::get()->prepare(
            "INSERT INTO inbox_item_states (item_key,state,updated_at) VALUES (?,?,datetime('now'))
             ON CONFLICT(item_key) DO UPDATE SET state=excluded.state,updated_at=datetime('now')"
        )->execute([$type . ':' . $id, $state]);
        Response::json(['status' => $state]);
    }
}
