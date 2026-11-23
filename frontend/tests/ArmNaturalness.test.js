import {describe,it,expect} from 'vitest';
import {Vector3} from 'three';
import catalog from '../src/shared/lib/localCatalog.json';
import {buildAvatar} from './audit/motionAudit.js';
import {deformSurface,poseJoints,rigRotation} from '../src/health/components/exercise/rig.js';
import {handRestFrame} from '../src/health/components/exercise/exerciseGrip.js';

// Arms that read as human: elbows fold one way, a grip does not wring the
// forearm past its range, both hands mirror each other and a raised arm does
// not inflate the shoulder. Geometry checks only; visual review is still needed.
const v=p=>new Vector3(...p);
const avatar=buildAvatar('male');
const ARMS=[[0,1,3,4,5,17],[1,-1,6,7,8,18]];
// Back of the hand against the forearm's neutral (handshake) direction, weighted by elbow bend.
function forearmScore(id){
 const worst=[1,1];
 for(let f=0;f<24;f++){
  const j=poseJoints(id,f/24,avatar.rest);
  for(const [side,sign,shoulder,elbow,wrist] of ARMS){
   const upper=v(j[elbow]).sub(v(j[shoulder])).normalize(),fore=v(j[wrist]).sub(v(j[elbow])).normalize(),normal=upper.clone().cross(fore);
   if(normal.length()<.35)continue;
   const back=handRestFrame(avatar.rest,side).back.clone().applyQuaternion(rigRotation(j,12+side,avatar.rest));
   back.addScaledVector(fore,-back.dot(fore)).normalize();
   worst[side]=Math.min(worst[side],back.dot(normal.normalize().multiplyScalar(-sign)));
  }
 }
 return worst;
}

describe('natural arms',()=>{
 it('never folds a hanging elbow forward of the shoulder–wrist line',()=>{
  for(const id of ['walk','brisk_walk','standing_march','step_touch','calf','single_calf','hip_abduction','hinge','dumbbell_rdl','barbell_rdl','treadmill_walk'])for(let f=0;f<24;f++){
   const j=poseJoints(id,f/24,avatar.rest),up=v(j[1]).sub(v(j[0])).normalize(),front=v(j[3]).sub(v(j[6])).cross(up).normalize();
   for(const [,,shoulder,elbow,wrist] of ARMS){
    const axis=v(j[wrist]).sub(v(j[shoulder])).normalize(),offset=v(j[elbow]).sub(v(j[shoulder]));
    offset.addScaledVector(axis,-offset.dot(axis));
    expect(offset.dot(front),`${id} frame ${f}`).toBeLessThan(.012);
   }
  }
 });

 it('keeps gripping and clasped hands inside the forearm’s rotation range',()=>{
  const ids=['shoulder_press','lat_pulldown','dumbbell_bench_press','dumbbell_floor_press','barbell_bench_press','barbell_squat','dumbbell_rdl','barbell_rdl','dumbbell_split_squat','triceps_extension','cable_face_pull','band_row','curl','hammer_curl','squat','lunge','side_lunge','sumo_squat','reverse_lunge','sit_stand','wall_hinge'];
  for(const id of ids){
   expect(catalog.some(e=>e.motion_id===id)||['squat','lunge','side_lunge'].includes(id),id).toBe(true);
   const [left,right]=forearmScore(id);
   expect(left,`${id} left`).toBeGreaterThan(-.55);
   expect(right,`${id} right`).toBeGreaterThan(-.55);
   expect(Math.abs(left-right),`${id} symmetry`).toBeLessThan(.35);
  }
 });

 it('turns both palms down in a lateral raise',()=>{
  const j=poseJoints('lateral_raise',.5,avatar.rest);
  for(const [side] of ARMS){
   const back=handRestFrame(avatar.rest,side).back.clone().applyQuaternion(rigRotation(j,12+side,avatar.rest));
   expect(back.y).toBeGreaterThan(.85);
  }
 });

 it('does not inflate the shoulder when the arm is overhead',()=>{
  const j=poseJoints('shoulder_press',.5,avatar.rest),target=new Float32Array(avatar.base.length);
  deformSurface(avatar.base,avatar.weights,j,target,avatar.rest,false);
  let widest=0;
  for(let i=0;i<target.length;i+=3)if(target[i+1]>1.25&&target[i+1]<1.5)widest=Math.max(widest,Math.abs(target[i]));
  // Resting shoulder half-width is about 0.27; the arc blend pushed this past 0.31.
  expect(widest).toBeLessThan(.29);
 });
});
