<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Database;
use App\Support\Response;

/** A conversation-level inbox spanning every client contact channel. */
class InboxController
{
    public static function index(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $items = [];

        foreach ($pdo->query("SELECT id,name,email,message,type,status,project_type,budget,timeline,features,created_at FROM inquiries WHERE status != 'archived' AND message NOT LIKE '[Live Chat]%'")->fetchAll() as $row) {
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
            $items[] = [
                'key' => 'chat:' . $row['id'], 'source' => str_starts_with($row['token'], 'whatsapp:') ? 'whatsapp' : 'chat', 'source_id' => (int) $row['id'],
                'name' => $row['client_name'] ?: 'Anonymous visitor', 'email' => $row['client_email'] ?: '', 'phone' => $row['client_phone'] ?: '',
                'preview' => $last, 'unread' => !(bool) $row['admin_seen'], 'flagged' => false, 'created_at' => $row['updated_at'],
                'detail' => ['message' => $row['client_comment'] ?: '', 'transcript' => $transcript, 'prototype_status' => $row['prototype_status']],
                'source_url' => '/admin/chats.html?open=' . $row['id'],
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
        elseif ($type === 'client') $pdo->prepare("UPDATE client_messages SET read_by_admin=1 WHERE client_id=? AND sender_type='client'")->execute([$id]);
        else Response::error('Unknown inbox source.', 422);
        Response::json(['status' => 'read']);
    }
}
