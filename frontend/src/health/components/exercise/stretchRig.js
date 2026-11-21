import * as THREE from 'three';
import {makeFrame,orientation,scaleFor,segmentLength,setFoot,setHand,smoothStep,solveLimb,vector} from './poseMath.js';
import {floorCatalogPose} from './floorCatalogRig.js';
import {STRETCHES} from './stretchCatalog.js';
import {handRestFrame} from './exerciseGrip.js';
const ids=new Set(STRETCHES.map(s=>s.motion_id));
export const FLOOR_STRETCHES=new Set(['hamstring_floor','figure_four','hip_flexor','butterfly','child','child_side','knee_hug','double_knee','supine_hamstring','ankle_circles','cat_release'].map(s=>`recovery_${s}`));

// A planted supine foot lies flat on the mat; a lifted foot stays square to its shin.
// The former fixed toes-up rotation stood planted shoes on their heels like a wall stance.
function supineFoot(j,side,id,amount){
 const flat=new THREE.Quaternion();
 if(!(id==='double_knee'||side===0))return flat;
 const [knee,ankle]=side?[13,14]:[10,11],shin=vector(j[ankle]).sub(vector(j[knee])).normalize(),lifted=smoothStep(0,.3,amount);
 if(id==='figure_four')return flat.slerp(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,-1,0),shin),lifted);
 return flat.setFromAxisAngle(new THREE.Vector3(1,0,0),-(Math.atan2(shin.y,shin.z)+Math.PI/2)*lifted);
}

// Fixed-length limb IK, authored endpoints and a slow enter/hold/release cycle.
// No measured-person motion or biomechanical accuracy is implied by this rig.
function rawStretchPose(motion,t,rest){
 if(!ids.has(motion))return null;
 const id=motion.slice(9),h=scaleFor(rest),s=p=>p.map(v=>v*h),amount=smoothStep(0,.12,t)*(1-smoothStep(.88,1,t));
 if(id==='cat_release')return floorCatalogPose('cat_cow',(t*3)%1,rest);
 const seated=['hamstring_floor','butterfly','ankle_circles'].includes(id),supine=['figure_four','knee_hug','double_knee','supine_hamstring'].includes(id),child=id.startsWith('child');
 let hip=rest[0],up=[0,1,0],front=[0,0,1];
 if(seated){hip=s([0,.22,0]);if(id==='hamstring_floor')up=[0,1,.25*amount];}
 if(supine){hip=s([0,.17,.20]);up=[0,0,-1];front=[0,1,0];}
 if(child){
  // Knees are the fixed support, not the unconstrained IK bend point. Solving
  // only toward the heels put the knees 12 cm below the mat at full flexion.
  const travel=.29*h*amount,thigh=segmentLength(rest,9,10),lateral=.14*h-Math.abs(rest[9][0]);
  hip=[0,.085*h+Math.sqrt(thigh*thigh-travel*travel-lateral*lateral),-.22*h-travel];
  up=[0,-.32*amount,1];front=[0,-1,-.32*amount];
 }
 if(id==='hip_flexor'){hip=s([0,.49,.04*amount]);}
 if(id==='hamstring_stand'){hip=s([0,.91,-.03]);up=[0,1,.32*amount];}
 if(id==='side_reach')up=[-.20*amount,1,0];
 if(id==='thoracic_turn')front=[Math.sin(.35*amount),0,Math.cos(.35*amount)];
 if(id==='adductor_side')hip=s([-.08*amount,.86,0]);
 if(id==='calf_bent')hip=s([0,.85,.06*amount]);
 if(id==='calf_straight')hip=s([0,.90,.04*amount]);
 const j=makeFrame(rest,hip,up,front,id==='thoracic_turn'?[0,0,1]:front);
 if(child){
  const neck=[0,-.12*amount,1];
  j[2]=vector(j[1]).addScaledVector(vector(neck).normalize(),segmentLength(rest,1,2)).toArray();
  j.boneRotations[1]=orientation(neck,[0,-1,-.12*amount]).toArray();
 }
 if(id==='triceps'){j[3][1]+=.10*h*amount;j[6][1]+=.04*h*amount;}
 const arm=(side,target,pole=[side===0?1:-1,0,0])=>solveLimb(j,rest,side,'arm',s(target),pole);
 const leg=(side,target,pole=[0,0,1])=>solveLimb(j,rest,side,'leg',s(target),pole);
 const endpoint=(side,target,pole)=>{const shoulder=j[side?6:3],neutral=[shoulder[0]/h+(side?-.055:.055),shoulder[1]/h-.46,shoulder[2]/h+.045];arm(side,neutral.map((v,i)=>v+(target[i]-v)*amount),pole);};
 for(const side of [0,1]){
  const sign=side===0?1:-1;
  leg(side,[sign*.16,.09,0]);
  const shoulder=j[side?6:3];arm(side,[shoulder[0]/h+sign*.055,shoulder[1]/h-.46,shoulder[2]/h+.045]);
 }
 if(seated){for(const side of [0,1])leg(side,[(side?-.14:.14),.09,id==='hamstring_floor'?.80:.69],[0,1,0]);for(const side of [0,1])arm(side,[(side?-.24:.24),.12,.10],[side?-1:1,0,0]);}
 if(supine){for(const side of [0,1]){leg(side,[(side?-.14:.14),.10,.775],[0,1,0]);arm(side,[(side?-.26:.26),.10,.15],[side?-1:1,0,0]);}}
 if(child){for(const side of [0,1]){
  const sign=side?-1:1,[root,knee,ankle]=side?[12,13,14]:[9,10,11];
  const dy=j[root][1]-.085*h,dx=j[root][0]-sign*.14*h,thigh=segmentLength(rest,root,knee);
  j[knee]=[sign*.14*h,.085*h,j[root][2]+Math.sqrt(Math.max(0,thigh*thigh-dy*dy-dx*dx))];
  const shin=segmentLength(rest,knee,ankle),rise=.015*h;
  j[ankle]=[j[knee][0],.10*h,j[knee][2]-Math.sqrt(shin*shin-rise*rise)];
  arm(side,[sign*.20+(id==='child_side'?.12*amount:0),.047,.36],[sign*.15,1,0]);
 }}
 switch(id){
  case 'neck_side':case 'neck_diagonal':{
   const axis=vector([.24*amount,1,id==='neck_diagonal'?.18*amount:0]).normalize();j[2]=vector(j[1]).addScaledVector(axis,segmentLength(rest,1,2)).toArray();j.boneRotations[1]=orientation(axis.toArray(),front).toArray();break;
  }
  case 'neck_turn':j.boneRotations[1]=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.45*Math.sin(t*Math.PI*2)).toArray();break;
  case 'shoulder_cross':endpoint(0,[-.27,1.31,.23],[0,-1,1]);endpoint(1,[j[4][0]/h,j[4][1]/h-.08,j[4][2]/h+.04],[0,-1,1]);break;
  case 'triceps':{
   endpoint(0,[.17,1.52,-.15],[.05,2,0]);endpoint(1,[.10,1.75,.06],[-1,1,1]);
   if(amount===1){j[4]=vector(j[3]).addScaledVector(vector([0,1,.12]).normalize(),segmentLength(rest,3,4)).toArray();j[5]=vector(j[4]).addScaledVector(vector([0,-.9,-.44]).normalize(),segmentLength(rest,4,5)).toArray();}
   break;
  }
  case 'lat_reach':endpoint(0,[.19,1.92,.12],[1,0,1]);endpoint(1,[-.19,1.92,.12],[-1,0,1]);break;
  case 'side_reach':endpoint(0,[-.12,1.91,.03],[1,1,0]);break;
  case 'chest_open':endpoint(0,[.36,1.09,-.13],[1,0,0]);endpoint(1,[-.36,1.09,-.13],[-1,0,0]);break;
  case 'chest_high':endpoint(0,[.40,1.64,-.02],[1,-1,0]);endpoint(1,[-.40,1.64,-.02],[-1,-1,0]);break;
  case 'biceps':endpoint(0,[.28,1.02,-.19],[1,0,0]);break;
  case 'wrist_flex':case 'wrist_extend':endpoint(0,[.17,1.31,.50],[1,-1,0]);endpoint(1,[.16,1.31,.49],[-1,-1,0]);break;
  case 'upper_back':endpoint(0,[.06,1.36,.51],[1,-1,0]);endpoint(1,[-.06,1.36,.51],[-1,-1,0]);break;
  case 'thoracic_turn':endpoint(0,[.10,1.28,.27],[1,-1,0]);endpoint(1,[-.02,1.31,.32],[-1,-1,0]);break;
  case 'hamstring_stand':leg(0,[.16,.09,.29],[0,0,1]);endpoint(0,[.14,1.0,.20]);endpoint(1,[-.14,1.0,.20]);break;
  case 'hamstring_floor':for(const side of [0,1])arm(side,[(side?-.18:.18),.36,.30+.10*amount],[side?-1:1,0,0]);break;
  case 'figure_four':{
   leg(1,[-.13,.10,.60],[0,1,0]);
   const rest0=vector(j[11]),perch=vector(j[12]).lerp(vector(j[13]),.8);perch.y+=.105*h;
   solveLimb(j,rest,0,'leg',rest0.lerp(perch,amount).toArray(),[amount,1-.5*amount,0]);break;
  }
  case 'quad_stand':leg(0,[.15,.09+.82*amount,-.25*amount],[0,-.7,1]);endpoint(0,[.15,.98,-.25],[1,0,-1]);break;
  case 'hip_flexor':leg(0,[.16,.09,.43],[0,0,1]);leg(1,[-.14,.09,-.40],[0,-1,1]);endpoint(0,[.15,.63,.28]);endpoint(1,[-.11,.66,.24]);break;
  case 'calf_straight':case 'calf_bent':leg(0,[.15,.09,.25],[0,0,1]);leg(1,[-.15,.09,-.24],[0,0,1]);break;
  case 'adductor_side':leg(0,[.44,.09,0],[0,0,1]);leg(1,[-.44,.09,0],[0,0,1]);break;
  case 'butterfly':leg(0,[.035,.09,.36],[1,0,0]);leg(1,[-.035,.09,.36],[-1,0,0]);arm(0,[.08,.23,.34],[1,0,0]);arm(1,[-.08,.23,.34],[-1,0,0]);break;
  case 'knee_hug':case 'double_knee':case 'supine_hamstring':{
   // Hip and knee angles are authored directly. The former ankle target folded the
   // thigh ~150 degrees so it passed through the abdomen, and the hands through the chest.
   const [phi1,theta1,inward]=id==='knee_hug'?[125,115,.12]:id==='double_knee'?[122,115,0]:[118,40,.08];
   const rad=Math.PI/180,phi=(40+(phi1-40)*amount)*rad,theta=(88+(theta1-88)*amount)*rad;
   for(const side of id==='double_knee'?[0,1]:[0]){
    const sign=side?-1:1,[root,knee,ankle]=side?[12,13,14]:[9,10,11];
    const thigh=vector([-sign*inward*amount,Math.sin(phi),Math.cos(phi)]).normalize();
    j[knee]=vector(j[root]).addScaledVector(thigh,segmentLength(rest,root,knee)).toArray();
    j[ankle]=vector(j[knee]).addScaledVector(vector([0,Math.sin(phi-theta),Math.cos(phi-theta)]),segmentLength(rest,knee,ankle)).toArray();
   }
   // Hands support the back of the thigh just above the knee, approached from the sides.
   for(const side of [0,1]){
    const sign=side?-1:1,legSide=id==='double_knee'?side:0,[root,knee]=legSide?[12,13]:[9,10];
    const along=vector(j[knee]).sub(vector(j[root])).normalize(),back=vector([0,-along.z,along.y]);
    const grip=vector(j[knee]).addScaledVector(along,-.08*h).addScaledVector(back,.015*h);grip.x+=sign*.078*h;
    const neutral=vector(s([sign*.26,.10,.15]));
    solveLimb(j,rest,side,'arm',neutral.lerp(grip,amount).toArray(),[sign,.6,-.3]);
    j.thighGrip||=[];j.thighGrip[side]=vector([-sign*.55,0,0]).addScaledVector(back,.85).normalize().toArray();
   }
   break;
  }
  case 'ankle_circles':leg(0,[.15,.14,.67],[0,1,0]);break;
 }
 const frame=orientation(up,front);
 for(const side of [0,1]){
  const [elbow,wrist]=side?[7,8]:[4,5];
  let direction=vector(j[wrist]).sub(vector(j[elbow])).normalize().toArray();
  if(id==='triceps'&&side===1)direction=vector(direction).lerp(vector(j[4]).sub(vector(j[wrist])).normalize(),smoothStep(.3,.8,amount)).normalize().toArray();
  if(id==='quad_stand'&&side===0)direction=vector(direction).lerp(vector(j[11]).sub(vector(j[wrist])).normalize(),smoothStep(.3,.8,amount)).normalize().toArray();
  if(j.thighGrip)direction=vector(direction).lerp(vector(j.thighGrip[side]),smoothStep(.3,.8,amount)).normalize().toArray();
  if(side===0&&id.startsWith('wrist_'))direction=vector(direction).applyAxisAngle(new THREE.Vector3(1,0,0),(id==='wrist_flex'?-1:1)*Math.PI/3*amount).toArray();
  setHand(j,rest,side,direction);
  const footRotation=supine?supineFoot(j,side,id,amount):seated?new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2):new THREE.Quaternion();
  if(child)footRotation.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI);
  if(id==='quad_stand'&&side===0)footRotation.setFromAxisAngle(new THREE.Vector3(1,0,0),-1.2*amount);
  if(id==='ankle_circles'&&side===0)footRotation.setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2+Math.cos(t*Math.PI*4)*.18).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.sin(t*Math.PI*4)*.18));
  setFoot(j,rest,side,footRotation);j.boneRotations[side?11:10]=footRotation.toArray();
 }
 // Transport limb frames with the torso so a lying figure cannot invert palms.
 for(const [index,[a,b]] of [[3,4],[4,5],[6,7],[7,8],[9,10],[10,11],[12,13],[13,14],[5,17],[8,18]].entries()){
  const from=vector(rest[b]).sub(vector(rest[a])).normalize(),to=vector(j[b]).sub(vector(j[a])).normalize();
  const side=[0,1,8].includes(index)?0:1;
  const sagittal=index>=4&&index<8||seated||supine||child||['wrist_flex','wrist_extend','upper_back'].includes(id)||id==='triceps'&&side===0;
  const localNormal=sagittal?[1,0,0]:[0,0,1],worldNormal=vector(localNormal).applyQuaternion(frame).toArray();
  // A stable anatomical plane avoids the 180-degree shortest-arc singularity
  // when an arm travels from lowered to overhead. Hands use the same plane.
  j.boneRotations[index<8?index+2:index+4]=orientation(to.toArray(),worldNormal).multiply(orientation(from.toArray(),localNormal).invert()).toArray();
 }
 if(child)for(const side of [0,1]){
  setHand(j,rest,side,[0,0,1]);
  const {wrist,along,back}=handRestFrame(rest,side);
  const palm=orientation([0,0,1],[0,1,0]).multiply(orientation(along.toArray(),back.toArray()).invert());
  j.boneRotations[12+side]=palm.toArray();
  const elbow=side?7:4,from=vector(rest[wrist]).sub(vector(rest[elbow])).normalize().applyQuaternion(palm);
  const to=vector(j[wrist]).sub(vector(j[elbow])).normalize();
  j.boneRotations[3+2*side]=new THREE.Quaternion().setFromUnitVectors(from,to).multiply(palm).toArray();
 }
 return j;
}

const ARM_ROUTES={side_reach:{0:'side'},triceps:{0:'front',1:'front'},shoulder_cross:{0:'front',1:'front'}};
const transitions=new WeakMap();
export function stretchPoseJoints(motion,t,rest){
 if(!ids.has(motion))return null;
 const posed=rawStretchPose(motion,t,rest),id=motion.slice(9);
 if(['cat_release','ankle_circles','neck_turn','child','child_side'].includes(id))return posed;
 let map=transitions.get(rest);if(!map){map=new Map();transitions.set(rest,map);}
 if(!map.has(id))map.set(id,[rawStretchPose(motion,0,rest),rawStretchPose(motion,.5,rest)]);
 const [start,end]=map.get(id),amount=smoothStep(0,.12,t)*(1-smoothStep(.88,1,t));
 // Interpolate fixed-length limb rotations, not a straight wrist target through
 // the shoulder. Target interpolation crossed the IK singularity on arm raises.
 const limbs=[[3,4,2],[4,5,3],[6,7,4],[7,8,5]];
 if(['quad_stand','knee_hug','double_knee','supine_hamstring'].includes(id))limbs.push([9,10,6],[10,11,7],[12,13,8],[13,14,9]);
 limbs.push([5,17,12],[8,18,13]);
 for(const [a,b,bone] of limbs){
  const from=new THREE.Quaternion().fromArray(start.boneRotations[bone]),to=new THREE.Quaternion().fromArray(end.boneRotations[bone]);
  // A single shortest arc from a hanging arm to an overhead or cross-body hold
  // swept the limb straight through the chest and neck. Raise it around the body first.
  const armSide=[2,3,12].includes(bone)?0:[4,5,13].includes(bone)?1:-1,route=armSide<0?null:ARM_ROUTES[id]?.[armSide];
  let rotation;
  if(route){
   const via=(route==='side'?new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),(armSide?-1:1)*1.66):new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-1.4)).multiply(from);
   rotation=amount<.5?from.clone().slerp(via,amount*2):via.slerp(to,amount*2-1);
  }else rotation=from.slerp(to,amount);
  posed.boneRotations[bone]=rotation.toArray();posed[b]=vector(rest[b]).sub(vector(rest[a])).applyQuaternion(rotation).add(vector(posed[a])).toArray();
 }
 if(['knee_hug','double_knee','supine_hamstring'].includes(id))for(const side of [0,1])posed.boneRotations[10+side]=supineFoot(posed,side,id,amount).toArray();
 for(const [ankle,toe,bone] of [[11,15,10],[14,16,11]])posed[toe]=vector(rest[toe]).sub(vector(rest[ankle])).applyQuaternion(new THREE.Quaternion().fromArray(posed.boneRotations[bone])).add(vector(posed[ankle])).toArray();
 return posed;
}
