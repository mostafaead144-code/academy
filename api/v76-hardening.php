<?php
declare(strict_types=1);
/** EGTAZ V76 — scope-safe, bounded legacy analytics helpers. No schema changes. */
function academy_v76_teacher_scores(array $profile,string $teacherId,array $subjects,?int $since=null): array {
    $allowed=[];foreach($subjects as $subject){$subject=(string)$subject;if($subject!=='')$allowed[$subject]=true;}
    if(!$allowed)return ['scores'=>[],'bySubject'=>[],'limited'=>false];
    $history=$profile['quizResultsV22']??[];
    if(!is_array($history))return ['scores'=>[],'bySubject'=>[],'limited'=>false];
    $scores=[];$bySubject=[];$scanned=0;$limited=false;
    foreach($history as $result){
        if(++$scanned>800){$limited=true;break;}
        if(!is_array($result))continue;
        $owner=(string)($result['teacherId']??$result['createdBy']??$result['createdByUid']??'');
        $subject=(string)($result['subject']??'');
        if($owner!==$teacherId||!isset($allowed[$subject]))continue;
        $raw=$result['percentage']??null;
        if(!is_numeric($raw)||!is_finite((float)$raw)||(float)$raw<0||(float)$raw>100)continue;
        $at=(int)($result['submittedAt']??$result['createdAt']??0);
        if($since!==null&&($at<=0||$at<$since))continue;
        $value=round((float)$raw,1);$scores[]=$value;
        $bySubject[$subject][]=$value;
    }
    return ['scores'=>$scores,'bySubject'=>$bySubject,'limited'=>$limited];
}
/** Candidate IDs come from a teacher's group membership indexes, not the whole student database. */
function academy_v76_teacher_candidate_ids(string $tid,array $groups,int $max=1000): array {
    $ids=[];$limited=false;
    foreach($groups as $gid=>$group){
        if(!is_array($group)||($group['teacherId']??$tid)!==$tid||($group['active']??true)!==true)continue;
        if(!academy_teacher_scope_allowed($tid,academy_v64_group_scope($group)))continue;
        $members=$group['members']??[];if(!is_array($members))continue;
        foreach($members as $key=>$member){
            $sid=is_int($key)?(is_array($member)?(string)($member['studentId']??''):(string)$member):(string)$key;
            $sid=strtolower($sid);
            if(!preg_match('/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/D',$sid))continue;
            $ids[$sid]=true;
            if(count($ids)>=$max){$limited=true;break 2;}
        }
    }
    $ordered=array_keys($ids);sort($ordered,SORT_STRING);
    return ['ids'=>$ordered,'limited'=>$limited];
}
function academy_v76_teacher_profiles(string $tid,array $groups,int $max=1000): array {
    $selection=academy_v76_teacher_candidate_ids($tid,$groups,$max);$profiles=[];
    foreach($selection['ids'] as $id){
        $p=academy_read_node('studentProfilesV3/'.$id);
        if(is_array($p)&&academy_v62_teacher_student_allowed($tid,$id,$p,$groups))$profiles[$id]=$p;
    }
    return ['students'=>$profiles,'limited'=>$selection['limited']];
}
/** For legacy aggregate reports: a selected recipient, active group and subject must all match. */
function academy_v76_assignment_applies(array $assignment,string $sid,array $profile,string $tid,array $groups): bool {
    if(($assignment['teacherId']??'')!==$tid||($assignment['status']??'')!=='published'||!empty($assignment['isHidden']))return false;
    if(!academy_scope_matches($assignment,$profile))return false;
    $mode=(string)($assignment['targetMode']??'stage');
    if($mode==='group')return academy_v534_assignment_group_allowed($assignment,$profile,$sid);
    if($mode==='students'){
        $target=$assignment['targetStudentIds']??null;
        if(!is_array($target)||!in_array($sid,array_map('strval',$target),true))return false;
    }elseif(!in_array($mode,['stage','all',''],true))return false;
    if(($assignment['recipientMode']??'all')!=='all')return false; // Individual recipients require a group target and private allowlist.
    foreach($groups as $gid=>$group){
        if(!is_array($group)||($group['teacherId']??$tid)!==$tid)continue;
        if(!academy_v534_group_member_allowed($group,$profile,$sid,(string)$gid))continue;
        if(!academy_teacher_scope_allowed($tid,academy_v64_group_scope($group)))continue;
        $match=true;foreach(['type','stage','grade','subject'] as $key){
            if((string)($assignment[$key]??'')!==(string)($group[$key]??'')){$match=false;break;}
        }
        if($match)return true;
    }
    return false;
}
