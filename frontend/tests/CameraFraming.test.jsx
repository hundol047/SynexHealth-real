import React from 'react';
import {describe,it,expect} from 'vitest';
import {render} from '@testing-library/react';
import {framingStatus,framingPose} from '../src/health/components/exercise/cameraFraming.js';
import CameraFrameGuide from '../src/health/components/exercise/CameraFrameGuide.jsx';

// A standing person filling the middle of the image, in MediaPipe's 33-point layout.
function standing({top=.1,bottom=.92,center=.5}={}){
 const span=bottom-top,at=(f,dx=0)=>({x:center+dx,y:top+span*f,visibility:.99});
 const p=Array.from({length:33},()=>at(.5));
 p[0]=at(.04);p[7]=at(.05,-.03);p[8]=at(.05,.03);
 p[11]=at(.2,-.08);p[12]=at(.2,.08);p[13]=at(.36,-.1);p[14]=at(.36,.1);p[15]=at(.5,-.1);p[16]=at(.5,.1);
 p[23]=at(.52,-.05);p[24]=at(.52,.05);p[25]=at(.75,-.05);p[26]=at(.75,.05);p[27]=at(.97,-.05);p[28]=at(.97,.05);
 return p;
}
const lower=[11,12,23,24,25,26,27,28];

describe('camera framing guide',()=>{
 it('accepts a whole body inside the image',()=>{
  expect(framingStatus(standing(),lower)).toMatchObject({state:'ok',edges:[]});
 });
 it('names the cut edge and how to fix it',()=>{
  const feet=framingStatus(standing({top:.2,bottom:1.08}),lower);
  expect(feet.state).toBe('cut');expect(feet.edges).toContain('bottom');expect(feet.hint).toContain('발이 잘렸어요');
  const head=framingStatus(standing({top:-.06,bottom:.9}),lower);
  expect(head.edges).toContain('top');expect(head.hint).toContain('머리가 잘렸어요');
  const side=framingStatus(standing({center:.97}),lower);
  expect(side.edges).toContain('right');expect(side.hint).toContain('가운데');
 });
 it('treats joints the model could not place as outside the picture',()=>{
  const p=standing();for(const i of [25,26,27,28])p[i]={...p[i],visibility:.05};
  expect(framingStatus(p,lower)).toMatchObject({state:'cut',edges:['bottom']});
 });
 it('asks a small, distant person to come closer and waits when nobody is seen',()=>{
  expect(framingStatus(standing({top:.4,bottom:.7}),lower).state).toBe('far');
  expect(framingStatus([],lower).state).toBe('searching');
 });
 it('uses a lying outline for floor exercises and does not require the head there',()=>{
  expect(framingPose('supine')).toBe('floor');expect(framingPose('seated')).toBe('seated');expect(framingPose('upright')).toBe('standing');
  const p=Array.from({length:33},(_,i)=>({x:.1+.8*(i/32),y:.6,visibility:.99}));
  p[0]={x:.5,y:-.2,visibility:.01};
  expect(framingStatus(p,[11,12,23,24,27,28],'floor').state).toBe('ok');
 });
 it('draws the outline in camera coordinates with a red bar on the cut side',()=>{
  const {container}=render(<CameraFrameGuide posture="standing" size={[640,480]} status={{state:'cut',edges:['bottom']}}/>);
  const svg=container.querySelector('svg.coach-frame-guide');
  expect(svg.getAttribute('viewBox')).toBe('0 0 640 480');
  expect(svg.dataset.framing).toBe('cut');
  expect(container.querySelectorAll('.coach-frame-cut')).toHaveLength(1);
  expect(container.querySelector('.coach-frame-cut').getAttribute('y1')).toBe('478');
 });
});
