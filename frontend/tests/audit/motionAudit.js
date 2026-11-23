// Whole-catalog physical plausibility audit used by MotionAudit.test.js.
// Mirrors the renderer: grip surface → dual-quaternion deform (no auto-grounding) + rounded shoes.
import {Quaternion,Vector3} from 'three';
import {personalizedVertices,sportswear} from '../../src/health/components/body3d/avatar.js';
import {footwearAnchors} from '../../src/health/components/body3d/Footwear.jsx';
import {exerciseShoeFloor,heelContactHeights} from '../../src/health/components/exercise/athleteModel.js';
import {bindSurface,deformSurface,poseJoints,REST,calibratePalmRoll} from '../../src/health/components/exercise/rig.js';
import {calibrateGripScale,gripSurface} from '../../src/health/components/exercise/exerciseGrip.js';
import {calibrateWallSupport} from '../../src/health/components/exercise/wallSupportCalibration.js';
import {exerciseHandShape} from '../../src/health/components/exercise/handPoses.js';
const v=p=>new Vector3(...p);
const deg=r=>r*180/Math.PI;
export function buildAvatar(gender){
 const neutral=personalizedVertices({height:178,weight:70,body_fat_percentage:20,skeletal_muscle_mass:32},{gender});
 const base=sportswear(neutral,1,gender).positions,weights=bindSurface(neutral),shoes=footwearAnchors(neutral),rest=REST.map(p=>p.slice());
 rest.handGripScale=calibrateGripScale(base,weights,rest);rest.heelContactHeights=heelContactHeights(shoes,rest);
 rest.wallSupport=calibrateWallSupport(base,weights,rest);
 const palm=calibratePalmRoll(base,weights,rest);
 // dominant bone per vertex
 const dominant=weights.map(w=>w.reduce((a,b)=>b[1]>a[1]?b:a,[0,0])[0]);
 return {base,weights,shoes,rest,palm,dominant,grips:new Map()};
}
const segDist=(p,a,b)=>{const ab=b.clone().sub(a),t=Math.max(0,Math.min(1,p.clone().sub(a).dot(ab)/ab.lengthSq()));return p.distanceTo(a.clone().addScaledVector(ab,t));};
export function auditMotion(id,avatar,frames=48){
 const {base,weights,shoes,rest,palm,dominant}=avatar,target=new Float32Array(base.length);
 const r={id,skinMin:Infinity,skinMinBone:-1,skinMinFrame:0,shoeMin:Infinity,shoeMinFrame:0,lowestMax:-Infinity,wall:null,kneeBack:0,kneeFold:0,elbowFold:0,neck:0,wrist:0,ankleMin:180,ankleMax:0,hipFlex:0,handTorso:Infinity,handHead:Infinity,handLeg:Infinity,footFoot:Infinity,boneErr:0};
 for(let f=0;f<frames;f++){
  const pose=poseJoints(id,f/frames,rest);
  if(pose.handRoll&&!pose.boneRotations?.[12])pose.handRoll=palm;
  const shape=exerciseHandShape(id,pose),key=JSON.stringify(shape);
  if(!avatar.grips.has(key))avatar.grips.set(key,gripSurface(base,weights,rest,shape));
  deformSurface(avatar.grips.get(key),weights,pose,target,rest,false);
  let frameMin=Infinity;
  for(let i=0;i<dominant.length;i++){const y=target[i*3+1];if(y<frameMin)frameMin=y;if(y<r.skinMin){r.skinMin=y;r.skinMinBone=dominant[i];r.skinMinFrame=f;}}
  const feet=shoes.map((shoe,side)=>{const [ankle,toe]=side?[14,16]:[11,15];
   const rotation=pose.boneRotations?.[10+side]?new Quaternion().fromArray(pose.boneRotations[10+side]).normalize():new Quaternion().setFromUnitVectors(v(rest[toe]).sub(v(rest[ankle])).normalize(),v(pose[toe]).sub(v(pose[ankle])).normalize());
   return exerciseShoeFloor({...shoe,rotation,center:v(shoe.center).sub(v(rest[ankle])).applyQuaternion(rotation).add(v(pose[ankle])).toArray()});});
  const shoe=Math.min(...feet);if(shoe<r.shoeMin){r.shoeMin=shoe;r.shoeMinFrame=f;}
  r.lowestMax=Math.max(r.lowestMax,Math.min(frameMin,shoe));
  const wallZ=pose.equipment?.wallZ;
  if(wallZ!=null){const rear=id==='wall_hinge'||id==='wall_sit';let c=Infinity;for(let i=0;i<dominant.length;i++){const z=target[i*3+2];c=Math.min(c,rear?z-wallZ:wallZ-z);}r.wall=Math.min(r.wall??Infinity,c);}
  const J=pose.map(v),side=J[9].clone().sub(J[12]).normalize();
  for(const [hip,knee,ankle] of [[9,10,11],[12,13,14]]){const a=J[knee].clone().sub(J[hip]).normalize(),b=J[ankle].clone().sub(J[knee]).normalize();
   r.hipFlex=Math.max(r.hipFlex,deg(a.angleTo(J[0].clone().sub(J[1]))));
   const s=a.clone().cross(b).dot(side);if(s<0)r.kneeBack=Math.max(r.kneeBack,deg(Math.asin(Math.min(1,-s))));r.kneeFold=Math.max(r.kneeFold,deg(a.angleTo(b)));}
  for(const [sh,el,wr,fi] of [[3,4,5,17],[6,7,8,18]]){const a=J[el].clone().sub(J[sh]),b=J[wr].clone().sub(J[el]),h=J[fi].clone().sub(J[wr]);r.elbowFold=Math.max(r.elbowFold,deg(a.angleTo(b)));r.wrist=Math.max(r.wrist,deg(b.angleTo(h)));}
  r.neck=Math.max(r.neck,deg(J[1].clone().sub(J[0]).angleTo(J[2].clone().sub(J[1]))));
  for(const [knee,ankle,toe] of [[10,11,15],[13,14,16]]){const a=deg(J[ankle].clone().sub(J[knee]).angleTo(J[toe].clone().sub(J[ankle])));r.ankleMin=Math.min(r.ankleMin,a);r.ankleMax=Math.max(r.ankleMax,a);}
  for(const h of [5,17,8,18]){r.handTorso=Math.min(r.handTorso,segDist(J[h],J[0],J[1]));r.handHead=Math.min(r.handHead,J[h].distanceTo(J[2]));for(const [a,b] of [[9,10],[10,11],[12,13],[13,14]])r.handLeg=Math.min(r.handLeg,segDist(J[h],J[a],J[b]));}
  r.footFoot=Math.min(r.footFoot,J[11].distanceTo(J[14]),J[15].distanceTo(J[16]));
  // rigid limb lengths
  for(const [a,b] of [[3,4],[4,5],[6,7],[7,8],[9,10],[10,11],[12,13],[13,14]])r.boneErr=Math.max(r.boneErr,Math.abs(J[a].distanceTo(J[b])-v(rest[a]).distanceTo(v(rest[b]))));
 }
 return r;
}
// Joint-level check that no arm point lies inside the trunk or head.
// The trunk is a conservative elliptical cylinder well inside the clothed surface,
// so any positive depth means the arm is drawn through the body, not resting on it.
export function armThroughTorso(pose){
 const J=pose.map(v),up=J[1].clone().sub(J[0]),length=up.length();up.normalize();
 const side=J[3].clone().sub(J[6]).normalize(),front=side.clone().cross(up).normalize();
 let depth=0,point='';
 for(const [name,a,b] of [['left upper arm',3,4],['left forearm',4,5],['left hand',5,17],['right upper arm',6,7],['right forearm',7,8],['right hand',8,18]])for(const u of [.5,.75,1]){
  if(a===3||a===6){if(u<1)continue;}
  const p=J[a].clone().lerp(J[b],u),rel=p.clone().sub(J[0]),along=rel.dot(up);
  if(along>.06&&along<length*.95){const x=rel.dot(side)/.125,z=(rel.dot(front)-.02)/.075,d=1-Math.hypot(x,z);if(d>depth){depth=d;point=`${name}@${u} trunk`;}}
  const head=p.distanceTo(J[2]);if(head<.07&&1-head/.07>depth){depth=1-head/.07;point=`${name}@${u} head`;}
 }
 return {depth,point};
}
