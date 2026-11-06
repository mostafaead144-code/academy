<?php
/** V49: one read-only, role-scoped inbox badge snapshot. No new tables. */
declare(strict_types=1);
function academy_v49_count_status(mixed $tree,array $statuses): int {
    $count=0; $nodes=0;
    $walk=function($part)use(&$walk,&$count,&$nodes,$statuses){
       if(++$nodes>20000||!is_array($part))return;
       if(isset($part['status'])&&is_string($part['status'])){
           if(in_array($part['status'],$statuses,true))$count++;
           return;
       }
       foreach($part as $item)if(is_array($item))$walk($item);
    };
    $walk($tree);return $count;
}
function academy_v49_badges(PDO $pdo,array $u): array {
   $role=$u['primary_role'];$uid=$u['id'];$counts=[];
   if($role==='admin'){
      $submissions=academy_read_node('teacherSubmissions');$counts['approvals']=academy_v49_count_status($submissions,['pending']);
      $countProfiles=0;
      if(is_array($submissions))foreach($submissions as $items)if(is_array($items))foreach($items as $item)if(is_array($item)&&($item['status']??'')==='pending'&&($item['submissionKind']??'')==='profile')$countProfiles++;
      $counts['teachers-admin']=$countProfiles;
      $counts['assignment-review']=academy_v49_count_status(academy_read_node('assignments'),['pending']);
      $counts['subscription-requests']=academy_v49_count_status(academy_read_node('subscriptionRequestsV1'),['pending']);
      $counts['communications']=academy_v49_count_status(academy_read_node('communicationSubmissionsV1'),['pending']);
      $counts['support']=academy_v49_count_status(academy_read_node('supportTicketsV1'),['new','reviewing','in_progress']);
      $tables=['m1-challenges'=>['m1_challenges','pending'],'m2-bank'=>['m2_questions','pending'],'m4-hub'=>['m4_tournaments','pending'],'m5-calendar'=>['m5_sessions','pending']];
      foreach($tables as $view=>[$table,$status]){
          // Names come from a fixed whitelist, not request parameters.
          $counts[$view]=(int)$pdo->query("SELECT COUNT(*) FROM `$table` WHERE status='pending'")->fetchColumn();
      }
   }elseif($role==='teacher'){
      $items=academy_read_node('teacherSubmissions/'.$uid);
      // Rejected requests need action from the teacher; pending ones are awaiting admin, not an unread notification.
      $counts['content']=academy_v49_count_status($items,['rejected']);
      $questions=academy_read_node('teacherCommunicationInboxV1/'.$uid);
      $pending=0;
      if(is_array($questions))foreach($questions as $q)if(is_array($q)&&($q['status']??'')==='approved'&&empty($q['hasApprovedReply']))$pending++;
      $counts['teacher-communications']=$pending;
      // Count submitted, ungraded student work only on assignments owned by this teacher.
      $assignments=academy_read_node('assignments');$active=[];
      if(is_array($assignments))foreach($assignments as $id=>$a)if(is_array($a)&&($a['teacherId']??'')===$uid&&($a['status']??'')==='published')$active[(string)$id]=true;
      $toGrade=0;
      if($active){$submissions=academy_read_node('assignmentSubmissions');if(is_array($submissions))foreach($submissions as $aid=>$entries){if(!isset($active[(string)$aid])||!is_array($entries))continue;foreach($entries as $r)if(is_array($r)&&($r['status']??'')==='submitted')$toGrade++;}}
      $counts['teacher-assignments']=$toGrade;
   }
   return array_filter($counts,static fn($c)=>$c>0);
}
function academy_v49_route(string $route,string $method,PDO $pdo):void {
   if($route!=='/v49/badges')return;
   if($method!=='GET')academy_json(['ok'=>false,'error'=>'method_not_allowed'],405);
   $u=academy_current_user(true);
   if(!in_array($u['primary_role'],['admin','teacher'],true))academy_json(['ok'=>false,'error'=>'forbidden'],403);
   academy_json(['ok'=>true,'counts'=>academy_v49_badges($pdo,$u),'updatedAt'=>academy_now_ms()]);
}
