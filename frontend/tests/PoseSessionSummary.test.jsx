import React from 'react';
import {describe,it,expect} from 'vitest';
import {render,screen} from '@testing-library/react';
import {PoseSessionReport} from '../src/health/components/exercise/poseFeedback.js';
import PoseFeedbackDetails from '../src/health/components/exercise/PoseFeedbackDetails.jsx';

// One repetition = angle 170 → bottom → 170 over `seconds`, sampled every 150 ms like the camera loop.
function perform(report,start,reps,{seconds=3,bottom=95,balance=4,view='front',detectedEvery=1}={}){
 let time=start,count=0,frame=0;
 for(let rep=0;rep<reps.length;rep++){
  const {seconds:s=seconds,bottom:b=bottom}=reps[rep],steps=Math.round(s*1000/150);
  for(let i=0;i<=steps;i++,time+=150,frame++){
   const done=i===steps;if(done)count++;
   const angle=170-(170-b)*Math.sin(Math.PI*i/steps);
   report.add(frame%detectedEvery?{detected:false}:{detected:true,reps:count,rep_seconds:done?s:null,angle,left_right_balance:balance,metrics:{camera_view:view},issues:[]},time);
  }
 }
 return time;
}
const texts=report=>report.snapshot().summary.map(line=>`${line.tone}:${line.text}`);

describe('pose session summary',()=>{
 it('reports steady pace, held range and small left-right difference as measured',()=>{
  const report=new PoseSessionReport('squat');perform(report,0,Array(6).fill({}));
  const lines=texts(report);
  expect(lines).toContain('good:반복 속도가 일정했어요 · 한 번에 평균 3초');
  expect(lines).toContain('good:움직임 범위가 끝까지 유지됐어요 · 평균 75°');
  expect(lines).toContain('good:좌우 관절 각도 차이가 작았어요 · 평균 4°');
  expect(report.snapshot().reps).toBe(6);
 });

 it('points out uneven pace, shrinking range and a large left-right difference with the numbers',()=>{
  const report=new PoseSessionReport('squat');
  perform(report,0,[{seconds:3.6,bottom:95},{seconds:3.3,bottom:95},{seconds:3,bottom:97},{seconds:2.1,bottom:118},{seconds:1.8,bottom:122},{seconds:1.5,bottom:125}],{balance:24});
  const lines=texts(report);
  expect(lines).toContain('check:반복 속도 차이가 컸어요 · 가장 빠를 때 1.5초, 가장 느릴 때 3.6초');
  expect(lines.find(line=>line.startsWith('check:뒤로 갈수록 움직임 범위가 줄었어요'))).toMatch(/처음 74° → 나중 48°/);
  expect(lines.find(line=>line.includes('좌우 관절 각도 차이가 평균 24°'))).toBeTruthy();
 });

 it('says nothing it did not measure',()=>{
  // Two repetitions are too few for pace or range; a side view says nothing about left/right.
  const few=new PoseSessionReport('squat');perform(few,0,Array(2).fill({}),{view:'side',balance:30});
  expect(few.snapshot().summary).toEqual([]);
  // Fast repetitions get a pace note, never a claim about form.
  const quick=new PoseSessionReport('squat');perform(quick,0,Array(5).fill({seconds:1.2}));
  expect(texts(quick)).toContain('check:한 번에 평균 1.2초로 빠른 편이에요. 반동 없이 조절되는지 확인해 보세요.');
  // Not enough analysable footage: no summary at all.
  const empty=new PoseSessionReport('squat');for(let t=0;t<3000;t+=150)empty.add({detected:false},t);
  expect(empty.snapshot()).toMatchObject({sufficient:false,summary:[]});
 });

 it('notes when much of the clip could not be analysed and renders the lines',()=>{
  // The person was out of frame for the first 15 s, then did six repetitions in view.
  const report=new PoseSessionReport('squat');for(let t=0;t<15000;t+=150)report.add({detected:false},t);perform(report,15000,Array(6).fill({}));
  const snapshot=report.snapshot();
  expect(snapshot.summary[0]).toMatchObject({tone:'check'});expect(snapshot.summary[0].text).toContain('전체의 56%');
  const steady=new PoseSessionReport('squat');perform(steady,0,Array(6).fill({}));
  render(<PoseFeedbackDetails report={steady.snapshot()}/>);
  const list=screen.getByRole('list',{name:'이번 촬영 요약'});
  expect(list.textContent).toContain('잘된 점');expect(list.textContent).toContain('반복 속도가 일정했어요');
  expect(JSON.stringify(steady.snapshot())).not.toContain('landmarks');
 });
});
