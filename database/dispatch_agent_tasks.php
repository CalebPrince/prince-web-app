<?php
declare(strict_types=1);
require dirname(__DIR__).'/src/autoload.php';
use App\Support\AgentTaskQueue;
use App\Support\Database;

$claimed=AgentTaskQueue::claimDue(20,300);$completed=0;$failed=0;
foreach($claimed as $task){try{if($task['kind']!=='lead_recheck')throw new RuntimeException('No dispatcher registered for '.$task['kind']);$payload=$task['payload'];$title=trim((string)($payload['next_action']??''))?:'Follow up with pipeline lead #'.$task['entity_id'];$exists=Database::get()->prepare("SELECT 1 FROM admin_tasks WHERE status='open' AND related_url=? AND title=?");$url='/admin/pipeline.html?open='.(int)$task['entity_id'];$exists->execute([$url,$title]);if(!$exists->fetchColumn())Database::get()->prepare("INSERT INTO admin_tasks(title,notes,priority,due_at,assignee,related_url,is_revenue,activity_type) VALUES (?,?,'high',datetime('now'),'Prince Caleb',?,1,'follow_up')")->execute([$title,$task['reschedule_reason'],$url]);AgentTaskQueue::complete((int)$task['id'],$task['lease_token'],'Created the due revenue follow-up task.');$completed++;}catch(Throwable $e){AgentTaskQueue::fail((int)$task['id'],$task['lease_token'],mb_substr($e->getMessage(),0,2000));$failed++;}}
echo "Claimed ".count($claimed)."; completed {$completed}; failed {$failed}.\n";
