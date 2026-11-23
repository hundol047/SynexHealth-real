import {describe,it,expect} from 'vitest';
import catalog from '../src/shared/lib/localCatalog.json';
import {STRETCHES} from '../src/health/components/exercise/stretchCatalog.js';
import {deformSurface,poseJoints,REST} from '../src/health/components/exercise/rig.js';
import {gripSurface} from '../src/health/components/exercise/exerciseGrip.js';
import {exerciseHandShape} from '../src/health/components/exercise/handPoses.js';
import {equipmentBounds} from '../src/health/components/exercise/exerciseEquipmentBounds.js';
import {buildAvatar,auditMotion,armThroughTorso} from './audit/motionAudit.js';

// Whole-catalog physical plausibility. Synthetic geometry checks only: they catch limbs
// drawn through the body, floor, wall or machines, not real-world exercise correctness.
const MOTIONS=[...catalog,...STRETCHES].map(m=>m.motion_id);
// The renderer re-grounds these on their lowest point every frame.
const GROUNDED=id=>id.startsWith('recovery_')||['squat','lunge','side_lunge','full_pushup','push_up','plank','bridge','glute_bridge','hinge','hip_hinge'].includes(id);

describe('all 104 demonstrations stay physically plausible',()=>{
 it('never sweeps an arm through the trunk or head, including enter and release transitions',()=>{
  expect(MOTIONS).toHaveLength(104);
  for(const id of MOTIONS)for(let f=0;f<120;f++){
   const {depth,point}=armThroughTorso(poseJoints(id,f/120,REST));
   expect(depth,`${id} t=${(f/120).toFixed(3)} ${point}`).toBeLessThan(.35);
  }
 });

 it('moves stretches without single-frame changes of speed',()=>{
  // Largest change in a joint's velocity between consecutive frames, as a share of that joint's
  // peak speed. Before the fixes these were 0.86-1.59: a visible snap of a knee, ankle or arm.
  const N=480,joints=[2,4,5,7,8,10,11,13,14,0];
  for(const id of ['recovery_shoulder_cross','recovery_triceps','recovery_side_reach','recovery_calf_straight','recovery_adductor_side','recovery_child','recovery_child_side']){
   const poses=[];for(let f=0;f<N;f++)poses.push(poseJoints(id,f/N,REST));
   let worst=0;
   for(const joint of joints){
    const velocity=poses.map((pose,f)=>[0,1,2].map(k=>(poses[(f+1)%N][joint][k]-pose[joint][k])*N));
    const peak=Math.max(...velocity.map(v=>Math.hypot(...v)));if(peak<.05)continue;
    velocity.forEach((v,f)=>{const next=velocity[(f+1)%N];worst=Math.max(worst,Math.hypot(v[0]-next[0],v[1]-next[1],v[2]-next[2])/peak);});
   }
   expect(worst,id).toBeLessThan(.45);
  }
 });

 it('keeps skin, shoes, walls and joint ranges valid on the real clothed surface',()=>{
  const avatar=buildAvatar(undefined);
  for(const id of MOTIONS){
   const r=auditMotion(id,avatar,24);
   expect(r.boneErr,`${id} limb length`).toBeLessThan(.001);
   expect(r.kneeFold,`${id} knee fold`).toBeLessThan(150);
   expect(r.hipFlex,`${id} hip flexion`).toBeLessThan(id.startsWith('recovery_child')?160:140);
   if(id!=='knee_side_plank')expect(r.kneeBack,`${id} backward knee`).toBeLessThan(8);
   if(id!=='recovery_triceps')expect(r.handTorso,`${id} hand inside trunk`).toBeGreaterThan(.05);
   if(r.wall!=null)expect(r.wall,`${id} wall`).toBeGreaterThan(-.005);
   if(!GROUNDED(id)){
    expect(r.skinMin,`${id} skin below floor (frame ${r.skinMinFrame})`).toBeGreaterThan(-.015);
    expect(r.shoeMin,`${id} shoe below floor (frame ${r.shoeMinFrame})`).toBeGreaterThan(-.012);
   }
  }
 },120000);

 it('holds supine stretches within hip range with a flat planted foot and hands at the thigh',()=>{
  for(const id of ['recovery_knee_hug','recovery_double_knee','recovery_supine_hamstring']){
   const pose=poseJoints(id,.5,REST);
   // Planted or lifted, a toe never points below the mat.
   expect(Math.min(pose[15][1],pose[16][1]),id).toBeGreaterThan(0);
   // The lifted knee is above the abdomen, not inside the chest.
   expect(pose[10][1]-pose[0][1],`${id} knee height`).toBeGreaterThan(.25);
   expect(pose[10][2],`${id} knee stays on the hip side of the ribs`).toBeGreaterThan(pose[1][2]+.2);
   for(const [wrist,knee] of [[5,10],[8,id==='recovery_double_knee'?13:10]]){
    const dx=pose[wrist][0]-pose[knee][0],dy=pose[wrist][1]-pose[knee][1],dz=pose[wrist][2]-pose[knee][2];
    expect(Math.hypot(dx,dy,dz),`${id} hand near thigh`).toBeLessThan(.22);
   }
  }
  const support=poseJoints('recovery_knee_hug',.5,REST);
  expect(support[16][1],'planted shoe lies flat').toBeLessThan(support[14][1]);
  expect(support[16][2]-support[14][2]).toBeGreaterThan(.12);
 });

 it('places machine pads on the body and keeps dumbbells and pivots out of the legs',()=>{
  const avatar=buildAvatar(undefined),{base,weights,rest,palm,dominant}=avatar,target=new Float32Array(base.length);
  const surface=(id,t)=>{
   const pose=poseJoints(id,t,rest);if(pose.handRoll&&!pose.boneRotations?.[12])pose.handRoll=palm;
   deformSurface(gripSurface(base,weights,rest,exerciseHandShape(id,pose)),weights,pose,target,rest,false);
   return {pose,parts:equipmentBounds(id,pose,rest,1).parts};
  };
  const inside=(part,p,margin=0)=>p.every((v,i)=>v>part.min[i]+margin&&v<part.max[i]-margin);
  for(const id of ['leg_extension','seated_leg_curl'])for(const t of [0,.25,.5]){
   const {pose,parts}=surface(id,t);
   for(const knee of [10,13])expect(parts.some(part=>inside(part,pose[knee])),`${id} pivot through knee`).toBe(false);
  }
  for(const [id,width] of [['seated_leg_curl',.51],['lat_pulldown',.46]]){
   const {parts}=surface(id,0),pad=parts.find(part=>Math.abs(part.max[0]-part.min[0]-width)<.005&&part.max[1]-part.min[1]>.12);
   expect(pad,`${id} thigh pad`).toBeTruthy();
   let top=-Infinity;const z=(pad.min[2]+pad.max[2])/2;
   for(let i=0;i<dominant.length;i++)if(dominant[i]>=6&&dominant[i]<=9&&Math.abs(target[i*3+2]-z)<.03)top=Math.max(top,target[i*3+1]);
   expect(pad.min[1],`${id} pad is not buried in the thigh`).toBeGreaterThan(top-.03);
   expect(pad.min[1],`${id} pad still reaches the thigh`).toBeLessThan(top+.05);
  }
  for(const id of ['curl','hammer_curl'])for(let f=0;f<24;f++){
   const {parts}=surface(id,f/24);let deep=0;
   for(let i=0;i<dominant.length;i++){
    if(dominant[i]<6||dominant[i]>9)continue;
    const p=[target[i*3],target[i*3+1],target[i*3+2]];
    if(parts.some(part=>inside(part,p,.03)))deep++;
   }
   expect(deep,`${id} frame ${f} dumbbell inside leg`).toBe(0);
  }
 },120000);
});
