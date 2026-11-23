import * as THREE from 'three';
import catalog from '../../../shared/lib/localCatalog.json' with { type: 'json' };

const entries = new Map(catalog.map(exercise => [exercise.motion_id, exercise]));
const aliases = { push_up: 'full_pushup', hip_hinge: 'hinge', glute_bridge: 'bridge' };
export const MANNEQUIN_COLORS = { neutral: '#d4dce3', primary: '#c93e43', secondary: '#df9b9b' };
// Broad surface regions for instruction, not individual segmented muscles or
// an estimate of measured activation. Masks are authored in the neutral pose
// and deform with the same vertices as the body, including wrist/hip motion.
const regions = [
  ['대퇴사두근', 'thighFront'], ['햄스트링', 'thighBack'], ['둔근', 'glutes'],
  ['대흉근', 'chest'], ['광배근', 'back'], ['승모근', 'upperBack'],
  ['삼각근', 'shoulders'], ['상완삼두근', 'upperArms'], ['상완이두근', 'upperArms'],
  ['종아리', 'calves'], ['복부', 'core'], ['척추', 'back'],
];
export function mannequinGuide(motion) {
  const exercise = entries.get(aliases[motion] || motion);
  const primaryLabel = (exercise?.target_muscle || []).join(' · ');
  const secondaryLabel = (exercise?.secondary_muscle || []).join(' · ');
  const select = text => [...new Set(regions.filter(([word]) => text.includes(word)).map(([, region]) => region))];
  return { primaryLabel, secondaryLabel, primary: select(primaryLabel), secondary: select(secondaryLabel) };
}
const smooth = THREE.MathUtils.smoothstep;
const band = (value, min, max, fade = .025) => smooth(value, min - fade, min) * (1 - smooth(value, max, max + fade));
export function regionWeight(region, x, y, z) {
  const ax = Math.abs(x), front = smooth(z, .015, .075), back = 1 - smooth(z, -.045, .025);
  const torso = 1 - smooth(ax, .16, .24);
  const thighs = band(y, .57, .91) * (1 - smooth(ax, .22, .28));
  switch (region) {
    case 'thighFront': return thighs * front;
    case 'thighBack': return thighs * back;
    case 'glutes': return band(y, .83, 1.02) * torso * back;
    case 'chest': return band(y, 1.25, 1.44) * torso * front;
    case 'back': return band(y, 1.02, 1.43) * torso * back;
    case 'upperBack': return band(y, 1.36, 1.49) * torso * back;
    case 'core': return band(y, 1.02, 1.24) * torso * front;
    case 'shoulders': return band(y, 1.34, 1.49) * smooth(ax, .14, .20);
    case 'upperArms': return band(y, 1.17, 1.39) * smooth(ax, .19, .24);
    case 'calves': return band(y, .22, .49) * (1 - smooth(ax, .21, .28));
    default: return 0;
  }
}
export function applyMannequinColors(geometry, stature, motion) {
  const { primary, secondary } = mannequinGuide(motion);
  const positions = geometry.attributes.position.array, colors = geometry.attributes.color.array;
  const neutral = new THREE.Color(MANNEQUIN_COLORS.neutral), main = new THREE.Color(MANNEQUIN_COLORS.primary), assist = new THREE.Color(MANNEQUIN_COLORS.secondary), color = new THREE.Color();
  for (let i = 0; i < positions.length; i += 3) {
    const point = [positions[i] / stature, positions[i + 1] / stature, positions[i + 2] / stature];
    const a = Math.max(0, ...primary.map(region => regionWeight(region, ...point)));
    const b = Math.max(0, ...secondary.map(region => regionWeight(region, ...point)));
    color.copy(neutral).lerp(assist, b).lerp(main, a).toArray(colors, i);
  }
  geometry.attributes.color.needsUpdate = true;
  geometry.clearGroups();
  geometry.addGroup(0, geometry.index.count, 0);
}
// Order of the per-pixel muscle regions in the mannequin shader.
export const MANNEQUIN_REGIONS = ['thighFront', 'thighBack', 'glutes', 'chest', 'back', 'upperBack', 'core', 'shoulders', 'biceps', 'triceps', 'calves'];
// Which shader regions a motion lights up. The catalog names both upper-arm muscles as one
// surface region; the shader separates the front (biceps) from the back (triceps).
export function mannequinRegionWeights(motion) {
  const guide = mannequinGuide(motion);
  const flags = (regions, label) => MANNEQUIN_REGIONS.map(region =>
    region === 'biceps' ? Number(regions.includes('upperArms') && (label.includes('이두') || !label.includes('삼두')))
      : region === 'triceps' ? Number(regions.includes('upperArms') && (label.includes('삼두') || !label.includes('이두')))
        : Number(regions.includes(region)));
  return { primary: flags(guide.primary, guide.primaryLabel), secondary: flags(guide.secondary, guide.secondaryLabel) };
}
// The surface is drawn per pixel from the rest-pose position, so muscle shapes and the grooves
// between them stay sharp at any zoom and move with the body. They are a teaching diagram of
// broad surface regions: not segmented anatomy and not a measurement of muscle use.
const MANNEQUIN_SHADER = /* glsl */`
  float mBand(float v,float a,float b,float f){return smoothstep(a-f,a,v)*(1.-smoothstep(b,b+f,v));}
  float mLine(float v,float c,float w){float d=(v-c)/w;return exp(-d*d);}
  void mannequinSurface(vec3 p,out float regions[11],out float groove,out float lift){
    float ax=abs(p.x),y=p.y,z=p.z;
    float front=smoothstep(.015,.07,z),back=1.-smoothstep(-.04,.02,z);
    // Thigh and shin cross-sections: which way a point faces around the leg's own axis.
    float thighX=mix(.14,.10,clamp((y-.52)/.38,0.,1.));
    vec2 thigh=vec2(ax-thighX,z-.045);float thighFacing=thigh.y/max(length(thigh),.001);
    float shinX=mix(.19,.14,clamp((y-.10)/.42,0.,1.));
    vec2 shin=vec2(ax-shinX,z-.04);float shinFacing=shin.y/max(length(shin),.001);
    // Upper arm: position along the shoulder-elbow line and facing around it.
    vec3 shoulder=vec3(.185,1.42,.02),armAxis=normalize(vec3(.14,-.17,.02)),q=vec3(ax,y,z)-shoulder;
    float along=dot(q,armAxis)/.221;vec3 around=q-armAxis*dot(q,armAxis);float armFacing=around.z/max(length(around),.001);
    float onArm=smoothstep(.19,.22,ax)*mBand(along,.20,.94,.07);
    float legs=1.-smoothstep(.22,.28,ax);
    // Quadriceps: the top follows the groin crease up toward the hip bone and
    // the bottom tapers into the kneecap, instead of a straight-edged block.
    float quadTop=mix(.83,.93,smoothstep(.03,.2,ax)),quadBottom=.555+.9*abs(thigh.x);
    regions[0]=smoothstep(quadBottom-.02,quadBottom+.02,y)*(1.-smoothstep(quadTop-.03,quadTop+.01,y))*smoothstep(-.12,.3,thighFacing)*legs;
    regions[1]=mBand(y,.60,.86,.03)*smoothstep(-.02,.4,-thighFacing)*legs;
    regions[2]=back*(1.-smoothstep(.72,1.,length(vec2((ax-.088)/.118,(y-.935)/.098))));
    regions[3]=front*(1.-smoothstep(.78,1.,length(vec2((ax-.088)/.108,(y-1.335)/.088))))*smoothstep(.003,.012,ax);
    regions[4]=back*mBand(y,1.04,1.40,.03)*(1.-smoothstep(0.,.03,ax-(.075+(y-1.04)*.40)))*smoothstep(.006,.016,ax);
    regions[5]=back*mBand(y,1.31,1.53,.02)*(1.-smoothstep(0.,.03,ax-(.17-abs(y-1.43)*1.25)));
    regions[6]=front*mBand(y,1.03,1.25,.02)*(1.-smoothstep(.10,.15,ax));
    regions[7]=1.-smoothstep(.062,.094,length(vec3(ax-.205,y-1.415,(z-.02)*.8)));
    regions[8]=onArm*smoothstep(-.30,.30,armFacing);
    regions[9]=onArm*smoothstep(-.30,.30,-armFacing);
    regions[10]=mBand(y,.25,.50,.03)*smoothstep(-.20,.30,-shinFacing)*legs;
    float g=0.;
    g+=front*mLine(ax,0.,.0045)*mBand(y,1.03,1.45,.02);
    g+=front*(mLine(y,1.085,.004)+mLine(y,1.14,.004)+mLine(y,1.195,.004))*(1.-smoothstep(.068,.088,ax))*.85;
    g+=front*mLine(ax,.088,.004)*mBand(y,1.04,1.24,.02)*.65;
    g+=front*mLine(y,1.258+3.2*(ax-.088)*(ax-.088),.005)*(1.-smoothstep(.165,.195,ax))*smoothstep(.008,.03,ax);
    g+=front*mLine(y,1.468-.10*ax,.004)*(1.-smoothstep(.15,.18,ax))*smoothstep(.02,.04,ax)*.55;
    g+=back*mLine(ax,0.,.006)*mBand(y,.87,1.47,.02);
    g+=back*mLine(y,.848,.006)*(1.-smoothstep(.17,.21,ax))*.8;
    g+=back*mLine(length(vec2(ax-.10,y-1.365)),.078,.004)*.45;
    g+=mBand(y,.58,.88,.03)*mLine(thighFacing,0.,.14)*legs*.45;
    g+=mBand(y,.30,.47,.03)*mLine(shin.x,0.,.005)*smoothstep(0.,.4,-shinFacing)*legs*.6;
    g+=mLine(length(vec3(ax-.205,y-1.415,(z-.02)*.8)),.094,.004)*.5;
    g+=onArm*mLine(armFacing,0.,.16)*.4;
    groove=clamp(g,0.,1.);
    // Kneecap and shin read as bone, slightly lighter than the muscle around them.
    lift=(1.-smoothstep(.7,1.,length(vec2(thigh.x/.036,(y-.525)/.042))))*smoothstep(0.,.3,thighFacing)*legs;
  }
`;
export function mannequinMaterials(motion) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .66, metalness: 0, side: THREE.DoubleSide });
  const weights = mannequinRegionWeights(motion);
  material.onBeforeCompile = shader => {
    shader.uniforms.mannequinPrimary = { value: weights.primary };
    shader.uniforms.mannequinSecondary = { value: weights.secondary };
    shader.uniforms.mannequinNeutral = { value: new THREE.Color(MANNEQUIN_COLORS.neutral) };
    shader.uniforms.mannequinMain = { value: new THREE.Color(MANNEQUIN_COLORS.primary) };
    shader.uniforms.mannequinAssist = { value: new THREE.Color(MANNEQUIN_COLORS.secondary) };
    shader.vertexShader = 'attribute vec3 characterRest; varying vec3 vMannequinRest;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMannequinRest = characterRest;');
    shader.fragmentShader = 'uniform float mannequinPrimary[11]; uniform float mannequinSecondary[11]; uniform vec3 mannequinNeutral; uniform vec3 mannequinMain; uniform vec3 mannequinAssist; varying vec3 vMannequinRest;\n'
      + MANNEQUIN_SHADER + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float mRegions[11];float mGroove;float mLift;
      mannequinSurface(vMannequinRest,mRegions,mGroove,mLift);
      float mMain=0.,mAssist=0.,mAny=0.;
      for(int i=0;i<11;i++){mMain=max(mMain,mRegions[i]*mannequinPrimary[i]);mAssist=max(mAssist,mRegions[i]*mannequinSecondary[i]);mAny=max(mAny,mRegions[i]);}
      // Every muscle region is a touch lighter than the tissue between; grooves are darker.
      vec3 mBase=mannequinNeutral*(1.+.035*mAny+.06*mLift);
      mBase=mix(mBase,mannequinAssist,mAssist*.9);
      mBase=mix(mBase,mannequinMain,mMain*(.82+.18*mMain));
      // Head, hands and feet keep the plain surface: no diagram is drawn on them.
      float mBody=smoothstep(.12,.16,vMannequinRest.y)*(1.-smoothstep(1.52,1.56,vMannequinRest.y));
      diffuseColor.rgb=mix(mannequinNeutral,mBase*(1.-.24*mGroove),mBody);`);
  };
  material.customProgramCacheKey = () => 'synex-instruction-mannequin-v3';
  return { materials: [material], dispose: () => material.dispose() };
}

// Keep clothing, skin and hair materials while tinting the demonstrated regions.
// The weights stay attached to the same vertices as the skinned body.
export function applyAthleteHighlights(geometry, stature, motion, materials) {
  const {primary, secondary} = mannequinGuide(motion);
  const positions = geometry.attributes.position.array;
  const weights = new Float32Array(positions.length / 3);
  for (let i = 0; i < weights.length; i++) {
    const point = [positions[i*3]/stature, positions[i*3+1]/stature, positions[i*3+2]/stature];
    weights[i] = Math.max(0, ...primary.map(r => regionWeight(r,...point))) * .78;
    weights[i] = Math.max(weights[i], Math.max(0, ...secondary.map(r => regionWeight(r,...point))) * .28);
  }
  geometry.setAttribute('exerciseHighlight', new THREE.BufferAttribute(weights, 1));
  const red = new THREE.Color(MANNEQUIN_COLORS.primary);
  for (const material of materials.slice(0,3)) {
    const previousCompile=material.onBeforeCompile,previousKey=material.customProgramCacheKey();
    material.onBeforeCompile = shader => {
      previousCompile?.(shader);
      shader.uniforms.exerciseRed = {value:red};
      shader.vertexShader = 'attribute float exerciseHighlight; varying float vExerciseHighlight;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvExerciseHighlight = exerciseHighlight;');
      shader.fragmentShader = 'uniform vec3 exerciseRed; varying float vExerciseHighlight;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, exerciseRed, vExerciseHighlight);');
    };
    material.customProgramCacheKey = () => previousKey+'-athlete-muscle-guide-v1';
    material.needsUpdate = true;
  }
}
