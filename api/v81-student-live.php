<?php
/** V81: lightweight published live-session list for the authenticated student. */
declare(strict_types=1);
function academy_v81_route(string $route,string $method,PDO $pdo): void {
 if($route!=='/v81/student/live')return;
 if($method!=='GET')academy_json(['ok'=>false,'error'=>'method_not_allowed'],405);
 $u=academy_current_user(true);
 academy_m1_guard_role($u,['student']);
 $scope=academy_m5_student_scope((string)$u['id']);
 // A single bounded query; no join links or passwords ever returned in the list.
 $sql="SELECT s.id,s.title,s.description,s.subject,s.teacher_id,s.provider,s.starts_at,s.ends_at,s.status,u.display_name AS teacher_name,a.attendance_status
       FROM m5_sessions s
       LEFT JOIN academy_users u ON u.id=s.teacher_id
       LEFT JOIN m5_attendance a ON a.session_id=s.id AND a.student_id=?
       WHERE s.status='published' AND s.education_type=? AND s.stage=? AND s.grade=?
         AND s.ends_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 14 DAY)
         AND s.starts_at<=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 DAY)
       ORDER BY s.starts_at ASC LIMIT 151";
 $q=$pdo->prepare($sql);
 $q->execute([(string)$u['id'],$scope['type'],$scope['stage'],(int)$scope['grade']]);
 $rows=$q->fetchAll(PDO::FETCH_ASSOC);
 $truncated=count($rows)>150;
 if($truncated)array_pop($rows);
 $out=[];
 foreach($rows as $s){
  $out[]=[
    'id'=>(string)$s['id'], 'title'=>(string)$s['title'],
    'description'=>mb_substr((string)($s['description']??''),0,350),
    'subject'=>(string)$s['subject'],
    'teacherName'=>mb_substr((string)($s['teacher_name']??''),0,120),
    'provider'=>in_array($s['provider'],['zoom','meet','teams','youtube','external'],true)?$s['provider']:'external',
    'startsAt'=>(string)$s['starts_at'], 'endsAt'=>(string)$s['ends_at'],
    'attendanceStatus'=>(string)($s['attendance_status']??'unmarked')
  ];
 }
 academy_json(['ok'=>true,'sessions'=>$out,'serverNow'=>gmdate('c'),'truncated'=>$truncated,'window'=>['pastDays'=>14,'futureDays'=>60]]);
}
