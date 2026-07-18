<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\Database;
use App\Support\Response;

class TaskController
{
    private const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

    public static function index(): void
    {
        AuthMiddleware::requireAuth();
        $rows = Database::get()->query(
            "SELECT * FROM admin_tasks
             ORDER BY status = 'completed',
                      CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                      due_at IS NULL, due_at ASC, created_at DESC"
        )->fetchAll();
        Response::json($rows);
    }

    public static function store(): void
    {
        $user = AuthMiddleware::requireAuth();
        $fields = self::validate(json_decode(file_get_contents('php://input'), true) ?? []);
        $pdo = Database::get();
        $pdo->prepare('INSERT INTO admin_tasks (title, notes, priority, due_at, assignee, related_url) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$fields['title'], $fields['notes'], $fields['priority'], $fields['due_at'], $fields['assignee'], $fields['related_url']]);
        $id = (int) $pdo->lastInsertId();
        ActivityLog::log($user, 'created', 'task', $id, $fields['title']);
        Response::json(['id' => $id, 'status' => 'created'], 201);
    }

    public static function update(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM admin_tasks WHERE id = ?');
        $stmt->execute([$id]);
        $task = $stmt->fetch();
        if (!$task) Response::error('Task not found.', 404);

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $merged = array_merge($task, $data);
        $fields = self::validate($merged);
        $status = ($data['status'] ?? $task['status']) === 'completed' ? 'completed' : 'open';
        $completedAt = $status === 'completed' ? ($task['completed_at'] ?: date('Y-m-d H:i:s')) : null;
        $pdo->prepare(
            "UPDATE admin_tasks SET title=?, notes=?, priority=?, status=?, due_at=?, assignee=?, related_url=?, completed_at=?, updated_at=datetime('now') WHERE id=?"
        )->execute([$fields['title'], $fields['notes'], $fields['priority'], $status, $fields['due_at'], $fields['assignee'], $fields['related_url'], $completedAt, $id]);
        ActivityLog::log($user, 'updated', 'task', $id, $fields['title'], ['status' => $status]);
        Response::json(['status' => 'updated']);
    }

    public static function destroy(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT title FROM admin_tasks WHERE id=?');
        $stmt->execute([$id]);
        $title = $stmt->fetchColumn();
        if ($title === false) Response::error('Task not found.', 404);
        $pdo->prepare('DELETE FROM admin_tasks WHERE id=?')->execute([$id]);
        ActivityLog::log($user, 'deleted', 'task', $id, (string) $title);
        Response::json(['status' => 'deleted']);
    }

    /** @return array{title:string,notes:?string,priority:string,due_at:?string,assignee:?string,related_url:?string} */
    private static function validate(array $data): array
    {
        $title = trim((string) ($data['title'] ?? ''));
        $notes = trim((string) ($data['notes'] ?? '')) ?: null;
        $priority = (string) ($data['priority'] ?? 'normal');
        $dueAt = trim((string) ($data['due_at'] ?? '')) ?: null;
        $assignee = trim((string) ($data['assignee'] ?? '')) ?: null;
        $relatedUrl = trim((string) ($data['related_url'] ?? '')) ?: null;
        if ($title === '' || mb_strlen($title) > 200) Response::error('Task title is required and must be under 200 characters.', 422);
        if ($notes !== null && mb_strlen($notes) > 5000) Response::error('Task notes are too long.', 422);
        if (!in_array($priority, self::PRIORITIES, true)) Response::error('Invalid task priority.', 422);
        if ($dueAt !== null && !preg_match('/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/', $dueAt)) Response::error('Invalid task due date.', 422);
        if ($assignee !== null && mb_strlen($assignee) > 120) Response::error('Assignee is too long.', 422);
        if ($relatedUrl !== null && (!str_starts_with($relatedUrl, '/') || str_starts_with($relatedUrl, '//'))) Response::error('Related link must be an internal path.', 422);
        return ['title'=>$title,'notes'=>$notes,'priority'=>$priority,'due_at'=>$dueAt,'assignee'=>$assignee,'related_url'=>$relatedUrl];
    }
}
