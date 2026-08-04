<?php
declare(strict_types=1);
namespace App\Support;

final class AgentTaskQueue
{
    public static function enqueue(string $kind, string $agentKey, ?string $entityType, ?int $entityId, array $payload, string $dueAt, int $priority = 0, ?string $reason = null): int
    {
        $pdo = Database::get();
        if ($entityType !== null && $entityId !== null) {
            $find=$pdo->prepare("SELECT id FROM agent_tasks WHERE kind=? AND entity_type=? AND entity_id=? AND status IN ('queued','leased') ORDER BY id DESC LIMIT 1");
            $find->execute([$kind,$entityType,$entityId]); $id=(int)$find->fetchColumn();
            if ($id) { $pdo->prepare("UPDATE agent_tasks SET agent_key=?,payload_json=?,due_at=?,priority=?,reschedule_reason=?,status='queued',lease_token=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=?")->execute([$agentKey,json_encode($payload,JSON_UNESCAPED_SLASHES),$dueAt,$priority,$reason,$id]); return $id; }
        }
        $stmt=$pdo->prepare('INSERT INTO agent_tasks (kind,agent_key,entity_type,entity_id,payload_json,due_at,priority,reschedule_reason) VALUES (?,?,?,?,?,?,?,?)');
        $stmt->execute([$kind,$agentKey,$entityType,$entityId,json_encode($payload,JSON_UNESCAPED_SLASHES),$dueAt,$priority,$reason]); return (int)$pdo->lastInsertId();
    }

    public static function claimDue(int $limit = 10, int $leaseSeconds = 300): array
    {
        $pdo=Database::get(); $pdo->beginTransaction();
        try {
            $pdo->exec("UPDATE agent_tasks SET status='queued',lease_token=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE status='leased' AND datetime(lease_expires_at)<=datetime('now')");
            $ids=$pdo->query("SELECT id FROM agent_tasks WHERE status='queued' AND datetime(due_at)<=datetime('now') AND attempts<max_attempts ORDER BY priority DESC,datetime(due_at),id LIMIT ".max(1,min(100,$limit)))->fetchAll(\PDO::FETCH_COLUMN);
            $claimed=[];
            foreach($ids as $id){$token=bin2hex(random_bytes(16));$stmt=$pdo->prepare("UPDATE agent_tasks SET status='leased',lease_token=?,lease_expires_at=datetime('now',?),attempts=attempts+1,updated_at=datetime('now') WHERE id=? AND status='queued'");$stmt->execute([$token,'+'.max(30,$leaseSeconds).' seconds',(int)$id]);if($stmt->rowCount()){ $row=$pdo->query('SELECT * FROM agent_tasks WHERE id='.(int)$id)->fetch();$row['lease_token']=$token;$row['payload']=json_decode($row['payload_json'],true)?:[];$claimed[]=$row;}}
            $pdo->commit(); return $claimed;
        } catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    public static function complete(int $id,string $token,string $outcome): void { self::finish($id,$token,'completed',$outcome,null); }
    public static function fail(int $id,string $token,string $error): void
    {
        $pdo=Database::get();$stmt=$pdo->prepare('SELECT attempts,max_attempts FROM agent_tasks WHERE id=? AND lease_token=? AND status=\'leased\'');$stmt->execute([$id,$token]);$task=$stmt->fetch();if(!$task)throw new \RuntimeException('Agent task lease is no longer valid.');
        $retry=(int)$task['attempts']<(int)$task['max_attempts'];$delay=min(60,5*(2**max(0,(int)$task['attempts']-1)));
        $update=$pdo->prepare("UPDATE agent_tasks SET status=?,last_error=?,due_at=CASE WHEN ?='queued' THEN datetime('now',?) ELSE due_at END,lease_token=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=? AND lease_token=? AND status='leased'");
        $status=$retry?'queued':'failed';$update->execute([$status,$error,$status,'+'.$delay.' minutes',$id,$token]);if(!$update->rowCount())throw new \RuntimeException('Agent task lease is no longer valid.');
    }
    private static function finish(int $id,string $token,string $status,?string $outcome,?string $error): void { $stmt=Database::get()->prepare("UPDATE agent_tasks SET status=?,outcome=?,last_error=?,completed_at=CASE WHEN ?='completed' THEN datetime('now') ELSE NULL END,lease_token=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=? AND lease_token=? AND status='leased'");$stmt->execute([$status,$outcome,$error,$status,$id,$token]);if(!$stmt->rowCount())throw new \RuntimeException('Agent task lease is no longer valid.'); }
}
