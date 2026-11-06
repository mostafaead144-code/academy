<?php
declare(strict_types=1);
/** EGTAZ V70. Read-only operational analytics. Admin-only, honest bounded aggregates. */
function academy_v70_period_ms(string $period): int {
    if($period==='all')return 0;
    return academy_now_ms()-(['7'=>7,'30'=>30,'90'=>90][$period]*86400000);
}
function academy_v70_created_ms(mixed $raw): int {
    if(!is_numeric($raw))return 0;
    $v=(int)$raw;
    return $v>=100000000000?$v:($v>=1000000000&&$v<10000000000?$v*1000:0);
}
function academy_v70_scope_match(array $r,string $type,string $stage,string $grade,string $teacher): bool {
    if($type!==''&&(string)($r['type']??$r['educationType']??'')!==$type)return false;
    if($stage!==''&&(string)($r['stage']??'')!==$stage)return false;
    if($grade!==''&&(string)($r['grade']??'')!==$grade)return false;
    if($teacher!==''&&(string)($r['teacherId']??'')!==$teacher)return false;
    return true;
}
function academy_v70_route(string $route,string $method,PDO $pdo): void {
    if($route!=='/v70/admin/analytics')return;
    if($method!=='GET')academy_json(['ok'=>false,'error'=>'method_not_allowed'],405);
    $admin=academy_v64_role('admin');
    academy_rate_limit('v70-analytics-'.$admin['id'],90,3600);
    $type=(string)($_GET['type']??'');$stage=(string)($_GET['stage']??'');$grade=(string)($_GET['grade']??'');
    $period=(string)($_GET['period']??'30');$teacher=(string)($_GET['teacherId']??'');
    if(!in_array($type,['','public','azhar'],true)||!in_array($stage,['','primary','prep','sec'],true)
        ||!in_array($grade,['','1','2','3','4','5','6'],true)||!in_array($period,['7','30','90','all'],true)
        ||($teacher!==''&&!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D',$teacher)))
        academy_json(['ok'=>false,'error'=>'invalid_filters'],422);
    if($stage!==''&&$stage!=='primary'&&in_array($grade,['4','5','6'],true))academy_json(['ok'=>false,'error'=>'invalid_grade'],422);
    $since=academy_v70_period_ms($period);
    // SQL counts are academy-wide account totals; curriculum filters do not apply to them.
    $users=$pdo->query("SELECT primary_role,status,COUNT(*) AS total,
        SUM(CASE WHEN last_login_at>=DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS login30
        FROM academy_users WHERE primary_role IN ('student','teacher') GROUP BY primary_role,status")->fetchAll(PDO::FETCH_ASSOC);
    $accounts=['students'=>0,'activeStudents'=>0,'teachers'=>0,'activeTeachers'=>0,'teacherLogins30'=>0];
    foreach($users as $row){$n=(int)$row['total'];$r=(string)$row['primary_role'];$s=(string)$row['status'];
        if($r==='student'){$accounts['students']+=$n;if($s==='active')$accounts['activeStudents']+=$n;}
        if($r==='teacher'){$accounts['teachers']+=$n;if($s==='active'){$accounts['activeTeachers']+=$n;$accounts['teacherLogins30']+=(int)$row['login30'];}}
    }
    $groupRoot=academy_read_node('teacherGroupsV4');$totals=['groups'=>0,'activeGroups'=>0,'memberships'=>0,'assignments'=>0,'pending'=>0,'published'=>0,'rejected'=>0];
    $groupRows=[];$teacherStats=[];$subjects=[];$groupVisited=0;$groupsLimited=false;
    // Bound iteration/output. Counts are explicitly labelled partial if cap is reached.
    if(is_array($groupRoot))foreach($groupRoot as $tid=>$groups){
        if(!is_array($groups))continue;
        foreach($groups as $gid=>$g){
            if(!is_array($g)||($g['teacherId']??(string)$tid)!==(string)$tid)continue;
            if(++$groupVisited>5000){$groupsLimited=true;break 2;}
            $record=$g;$record['teacherId']=(string)$tid;
            if(!academy_v70_scope_match($record,$type,$stage,$grade,$teacher))continue;
            $members=is_array($g['members']??null)?count($g['members']):0;
            $active=($g['active']??true)===true;
            $totals['groups']++;$totals['memberships']+=$members;if($active)$totals['activeGroups']++;
            $subject=mb_substr((string)($g['subjectName']??$g['subject']??'غير محدد'),0,80);
            $subjects[$subject]=($subjects[$subject]??0)+1;
            $t=(string)$tid;
            if(!isset($teacherStats[$t]))$teacherStats[$t]=['id'=>$t,'groups'=>0,'memberships'=>0,'assignments'=>0];
            $teacherStats[$t]['groups']++;$teacherStats[$t]['memberships']+=$members;
            $groupRows[]=['id'=>(string)$gid,'teacherId'=>$t,'name'=>mb_substr((string)($g['name']??'مجموعة'),0,110),
                'subject'=>$subject,'memberships'=>$members,'active'=>$active,
                'type'=>(string)($g['type']??''),'stage'=>(string)($g['stage']??''),'grade'=>(string)($g['grade']??'')];
        }
    }
    $assignRoot=academy_read_node('assignments');$assignRows=[];$weekly=array_fill(0,8,0);$assignVisited=0;$assignLimited=false;
    $now=academy_now_ms();
    if(is_array($assignRoot))foreach($assignRoot as $id=>$a){
        if(!is_array($a))continue;
        if(++$assignVisited>10000){$assignLimited=true;break;}
        if(!academy_v70_scope_match($a,$type,$stage,$grade,$teacher))continue;
        $created=academy_v70_created_ms($a['createdAt']??0);
        if($since>0&&($created===0||$created<$since))continue;
        $status=(string)($a['status']??'published');
        $totals['assignments']++;if(in_array($status,['pending','published','rejected'],true))$totals[$status]++;
        $tid=(string)($a['teacherId']??'');
        if($tid!==''&&isset($teacherStats[$tid]))$teacherStats[$tid]['assignments']++;
        if($created>0&&$created<=$now){$age=(int)floor(($now-$created)/604800000);if($age>=0&&$age<8)$weekly[7-$age]++;}
        $assignRows[]=['id'=>(string)$id,'title'=>mb_substr((string)($a['title']??'واجب'),0,120),
            'teacherId'=>$tid,'status'=>$status,'subject'=>mb_substr((string)($a['subjectName']??$a['subject']??''),0,80),
            'createdAt'=>$created,'dueAt'=>(int)($a['dueAt']??0)];
    }
    usort($groupRows,static fn($a,$b)=>($b['memberships']<=>$a['memberships'])?:strcmp($a['id'],$b['id']));
    usort($assignRows,static fn($a,$b)=>$b['createdAt']<=>$a['createdAt']);
    uasort($teacherStats,static fn($a,$b)=>($b['groups']<=>$a['groups'])?:($b['memberships']<=>$a['memberships']));
    arsort($subjects,SORT_NUMERIC);
    $groupsOut=array_slice($groupRows,0,40);$assignOut=array_slice($assignRows,0,20);$teachersOut=array_slice(array_values($teacherStats),0,15);
    $teacherIds=[];foreach($groupsOut as $r)$teacherIds[$r['teacherId']]=true;
    foreach($assignOut as $r)if($r['teacherId']!=='')$teacherIds[$r['teacherId']]=true;
    foreach($teachersOut as $r)$teacherIds[$r['id']]=true;
    $names=[];$stmt=$pdo->prepare("SELECT display_name FROM academy_users WHERE id=? AND primary_role='teacher' LIMIT 1");
    foreach(array_keys($teacherIds) as $id){if(!preg_match('/^[a-f0-9-]{36}$/D',$id))continue;$stmt->execute([$id]);$names[$id]=mb_substr((string)($stmt->fetchColumn()?:'معلم غير متاح'),0,100);}
    foreach($groupsOut as &$r){$r['teacherName']=$names[$r['teacherId']]??'معلم غير متاح';unset($r['teacherId']);}unset($r);
    foreach($assignOut as &$r){$r['teacherName']=$names[$r['teacherId']]??'معلم غير متاح';unset($r['teacherId']);}unset($r);
    foreach($teachersOut as &$r){$r['name']=$names[$r['id']]??'معلم غير متاح';}unset($r);
    $topSubjects=[];foreach(array_slice($subjects,0,8,true) as $name=>$n)$topSubjects[]=['name'=>(string)$name,'count'=>$n];
    $weekLabels=[];for($i=7;$i>=0;$i--)$weekLabels[]=gmdate('d/m',time()-$i*604800);
    academy_json(['ok'=>true,'accounts'=>$accounts,'totals'=>$totals,'groups'=>$groupsOut,
        'assignments'=>$assignOut,'teachers'=>$teachersOut,'subjects'=>$topSubjects,
        'weekly'=>array_map(static fn($label,$count)=>['label'=>$label,'count'=>$count],$weekLabels,$weekly),
        'filters'=>['type'=>$type,'stage'=>$stage,'grade'=>$grade,'teacherId'=>$teacher,'period'=>$period],
        'limited'=>['groups'=>$groupsLimited,'assignments'=>$assignLimited,'groupsDisplay'=>count($groupRows)>40,'assignmentsDisplay'=>count($assignRows)>20],
        'generatedAt'=>$now,'scopeNotes'=>[
            'حسابات الطلاب والمعلمين من قاعدة الحسابات، وهي إجماليات الأكاديمية ولا تتأثر بفلاتر المناهج.',
            'العضويات هي عدد إدخالات سجل الفصول؛ قد يتكرر الطالب ولا تعني عدد طلاب فريدين أو عضويات محققة.',
            'فلاتر نوع التعليم والصف والمعلم تطبق على الفصول والواجبات فقط؛ فترة الإنشاء تطبق على الواجبات فقط.',
            'اتجاه الواجبات يمثل تاريخ الإنشاء وليس التسليم أو التصحيح. التقارير لا تستنتج درجات أو نسب إنجاز الطلاب.'
        ]]);
}
