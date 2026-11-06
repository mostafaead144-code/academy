<?php
/** V53.4 — Two-sided, stage-bound membership for teacher groups and assignments. */
declare(strict_types=1);

function academy_v534_group_member_allowed(array $group,array $profile,string $studentId,string $groupId): bool {
    if($groupId===''||$studentId===''||($group['active']??true)!==true)return false;
    if(!academy_scope_matches($group,$profile))return false;
    // A member must be present in both records. A stale group ID in a student profile
    // is not enough after group deletion, suspension or a change of academic stage.
    $ids=$profile['groupIds']??null;
    if(!is_array($ids))return false;
    $linked=array_is_list($ids)?in_array($groupId,array_map('strval',$ids),true):!empty($ids[$groupId]);
    if(!$linked)return false;
    $members=$group['members']??null;
    if(!is_array($members))return false;
    if(array_is_list($members)){
        foreach($members as $member){
            if((is_string($member)&&$member===$studentId)||(is_array($member)&&($member['studentId']??'')===$studentId))return true;
        }
        return false;
    }
    if(!array_key_exists($studentId,$members))return false;
    $member=$members[$studentId];
    if($member===null||$member===false)return false;
    return !is_array($member)||($member['studentId']??$studentId)===$studentId;
}

function academy_v534_assignment_group_allowed(array $assignment,array $profile,string $studentId): bool {
    $teacherId=(string)($assignment['teacherId']??'');
    $groupId=(string)($assignment['targetGroupId']??'');
    if($groupId===''||$teacherId==='')return false;
    static $groupCache=[];
    $key=$teacherId.'|'.$groupId;
    if(!array_key_exists($key,$groupCache))$groupCache[$key]=academy_read_node('teacherGroupsV4/'.$teacherId.'/'.$groupId);
    $group=$groupCache[$key];
    if(!is_array($group)||!academy_v534_group_member_allowed($group,$profile,$studentId,$groupId))return false;
    // Protect against stale or tampered group references and wrong subject targets.
    foreach(['type','stage','grade','subject'] as $k){
        if((string)($group[$k]??'')!==(string)($assignment[$k]??''))return false;
    }
    if(($assignment['recipientMode']??'all')==='selected'){
        // Private server-side allowlist; student IDs are never part of the publicly readable assignment.
        $aid=(string)($assignment['id']??'');
        if(!preg_match('/^[a-zA-Z0-9_-]{6,100}$/D',$aid))return false;
        $targets=academy_read_node('assignmentTargetsV67/'.$aid);
        if(!is_array($targets)||!is_array($targets['studentIds']??null))return false;
        if(!in_array($studentId,$targets['studentIds'],true))return false;
    }elseif(($assignment['recipientMode']??'all')!=='all')return false;
    return true;
}
