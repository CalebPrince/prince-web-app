<?php
declare(strict_types=1);
namespace App\Controllers;
use App\Middleware\AuthMiddleware;
use App\Support\Database;
use App\Support\Response;

final class AgentTaskController
{
    public static function index(): void { AuthMiddleware::requireAuth();$pdo=Database::get();$rows=$pdo->query("SELECT * FROM agent_tasks ORDER BY CASE status WHEN 'failed' THEN 0 WHEN 'leased' THEN 1 WHEN 'queued' THEN 2 ELSE 3 END,priority DESC,datetime(due_at),id DESC LIMIT 250")->fetchAll();foreach($rows as &$r){$r['payload']=json_decode($r['payload_json'],true)?:[];unset($r['payload_json'],$r['lease_token']);}$counts=$pdo->query("SELECT status,COUNT(*) count FROM agent_tasks GROUP BY status")->fetchAll(\PDO::FETCH_KEY_PAIR);Response::json(['tasks'=>$rows,'counts'=>$counts]); }
    public static function retry(array $params): void { AuthMiddleware::requireAuth();$id=(int)($params['id']??0);$stmt=Database::get()->prepare("UPDATE agent_tasks SET status='queued',due_at=datetime('now'),lease_token=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=datetime('now') WHERE id=? AND status IN ('failed','cancelled')");$stmt->execute([$id]);if(!$stmt->rowCount())Response::error('Only failed or cancelled work can be retried.',422);Response::json(['status'=>'queued']); }
    public static function cancel(array $params): void { AuthMiddleware::requireAuth();$id=(int)($params['id']??0);$stmt=Database::get()->prepare("UPDATE agent_tasks SET status='cancelled',lease_token=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=? AND status IN ('queued','leased')");$stmt->execute([$id]);if(!$stmt->rowCount())Response::error('Only queued or leased work can be cancelled.',422);Response::json(['status'=>'cancelled']); }
}
