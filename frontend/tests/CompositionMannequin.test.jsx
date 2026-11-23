import React from 'react';
import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import {MUSCLE_STUDY,ageAt,publishedMuscleReference} from '../src/health/lib/publishedMuscleReference.js';
import {standardBodyReference} from '../src/health/lib/standardBodyReference.js';
import {mannequinBase,mannequinPositions,referenceMannequinMeasurement,torsoCircumference,GIRTH_FIELDS} from '../src/health/components/body3d/mannequinMath.js';
const {scene}=vi.hoisted(()=>({scene:vi.fn()}));
vi.mock('../src/health/components/body3d/BodyScene.jsx',()=>({default:p=>{scene(p);return <div>마네킹 뷰어</div>;}}));
import CompositionMannequin from '../src/health/components/body3d/CompositionMannequin.jsx';
const measurement={height:178,weight:78,skeletal_muscle_mass:30,body_fat_percentage:23,measurement_date:'2026-10-08',segments:[]};
const profile={gender:'male',birth_date:'1996-10-09'};
it('uses explicit published whole-body means and measurement-date age, never age/sex guesses',()=>{
 expect(ageAt(profile.birth_date,measurement.measurement_date)).toBe(29);
 expect(ageAt('2000-02-30',measurement.measurement_date)).toBeNull();
 expect(publishedMuscleReference(measurement,profile)).toMatchObject({value:33,differenceKg:-3,age:29});
 expect(publishedMuscleReference(measurement,{...profile,gender:'female'}).value).toBe(21);
 for(const p of [{}, {...profile,birth_date:null},{...profile,birth_date:'2015-01-01'},{...profile,birth_date:'1900-01-01'}])expect(publishedMuscleReference(measurement,p).available).toBe(false);
 expect(publishedMuscleReference({...measurement,weight:30,body_fat_percentage:20},profile).canOverlay).toBe(false);
 expect(publishedMuscleReference({...measurement,body_fat_percentage:null},profile)).toMatchObject({available:true,canOverlay:false});
 expect(MUSCLE_STUDY.sampleSize).toBe(468);expect(MUSCLE_STUDY.method).toBe('전신 MRI');
});
it('fat and muscle deform different body envelopes while a muscle-only overlay preserves pose and height',()=>{
 const base=mannequinBase('male'),own=mannequinPositions(base,measurement,profile),muscle=mannequinPositions(base,{...measurement,skeletal_muscle_mass:40},profile),fat=mannequinPositions(base,{...measurement,body_fat_percentage:38},profile);
 let changedMuscle=0,changedFat=0;
 for(let i=0;i<base.length;i+=3){expect(muscle[i+1]).toBe(own[i+1]);expect(fat[i+1]).toBe(own[i+1]);if(Math.abs(muscle[i+2]-own[i+2])>.0001)changedMuscle++;if(Math.abs(fat[i+2]-own[i+2])>.0001)changedFat++;}
 expect(changedMuscle).toBeGreaterThan(1000);expect(changedFat).toBeGreaterThan(1000);expect(muscle).not.toEqual(fat);
 const short=mannequinPositions(base,{...measurement,height:160},profile);expect(Math.max(...short.filter((_,i)=>i%3===1))/Math.max(...own.filter((_,i)=>i%3===1))).toBeCloseTo(160/178,5);
 expect(own.every(Number.isFinite)).toBe(true);
});
it('fits measured torso perimeters without moving the pose or inventing regional muscle kg',()=>{
 const m={...measurement,chest_circumference:99,waist_circumference:84,hip_circumference:101,segments:[{segment:'LEFT_ARM',lean_mass_kg:3.2,fat_mass_kg:.8}]};
 const shaped=mannequinPositions(mannequinBase('male'),m,profile);
 for(const [key,,plane] of GIRTH_FIELDS)expect(torsoCircumference(shaped,plane)).toBeCloseTo(m[key],0);
 const ref=referenceMannequinMeasurement(m,33);expect(ref.weight).toBe(m.weight);expect(ref.body_fat_percentage).toBe(m.body_fat_percentage);expect(ref.waist_circumference).toBe(84);expect(ref.segments[0]).toEqual({segment:'LEFT_ARM',fat_mass_kg:.8});
 const equalMassRef=referenceMannequinMeasurement(m,m.skeletal_muscle_mass);
 expect(mannequinPositions(mannequinBase('male'),equalMassRef,profile,m.segments)).toEqual(shaped);
 // Bone and mineral totals are displayed/stored, never used to guess bone anatomy.
 expect(mannequinPositions(mannequinBase('male'),{...m,bone_mass:3,mineral_mass:3.5},profile)).toEqual(shaped);
});
it('builds a same-height, same-sex standard body with no extra input',()=>{
 const r=standardBodyReference(measurement,{gender:'male'});
 expect(r).toMatchObject({available:true,canOverlay:true,height:178,weight:69.7,bodyFat:15,value:29.6,differenceKg:.4});
 expect(r.measurement).toMatchObject({height:178,weight:69.7,body_fat_percentage:15,skeletal_muscle_mass:29.6,segments:[]});
 for(const [key] of GIRTH_FIELDS)expect(r.measurement[key]).toBeUndefined();
 const f=standardBodyReference({...measurement,height:160},{gender:'female'});expect(f).toMatchObject({weight:53.8,bodyFat:23});
 expect(standardBodyReference({measurement_date:'2026-10-08'},{gender:'male',height_cm:170})).toMatchObject({available:false,canOverlay:true,weight:63.6,value:null});
 expect(standardBodyReference(measurement,{gender:'unspecified'})).toMatchObject({available:false,missing:['성별']});
 expect(standardBodyReference({...measurement,height:null},{gender:'male'})).toMatchObject({available:false,missing:['키']});
});
it('overlays the standard body without birth date and toggles actual layers',async()=>{
 const user=userEvent.setup();const view=render(<MemoryRouter><CompositionMannequin comparisonData={{measurement,body_profile:{gender:'male'}}}/></MemoryRouter>);
 expect(scene.mock.lastCall[0].mannequin.referenceMeasurement).toMatchObject({height:178,weight:69.7,body_fat_percentage:15,skeletal_muscle_mass:29.6});
 expect(scene.mock.lastCall[0].mannequin.referenceLabel).toBe('표준 체형');
 expect(screen.queryByRole('link',{name:/평균 모형에 필요한 정보 입력/})).toBeNull();
 expect(screen.getByRole('button',{name:'겹쳐보기',exact:true}).getAttribute('aria-pressed')).toBe('true');
 expect(scene.mock.lastCall[0].mannequin.options).toMatchObject({layout:'overlap',showMy:true,showReference:true,myOpacity:.50,referenceOpacity:.30,referenceContour:true});
 expect(screen.getByText(/키·발 위치를 맞춰 같은 자리에/)).toBeTruthy();expect(screen.getByText(/별도 입력 없이 자동 생성/)).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'내 몸만',exact:true}));expect(scene.mock.lastCall[0].mannequin.options.showReference).toBe(false);
 await user.click(screen.getByText('투명도 · 골격 · 표현 설정'));await user.click(screen.getByRole('checkbox',{name:/골격 구조 보기/}));expect(scene.mock.lastCall[0].mannequin.options.skeleton).toBe(true);
 view.rerender(<MemoryRouter><CompositionMannequin comparisonData={{measurement,body_profile:{gender:'unspecified'}}}/></MemoryRouter>);
 expect(scene.mock.lastCall[0].mannequin.referenceMeasurement).toBeNull();expect(scene.mock.lastCall[0].mannequin.options.showMy).toBe(true);
 expect(screen.getByRole('button',{name:'나란히 비교',exact:true}).disabled).toBe(true);
 expect(screen.getByRole('link',{name:'프로필에서 성별 설정'}).getAttribute('href')).toBe('/health/profile');
 expect(screen.getAllByRole('status').find(s=>s.className==='mannequin-reference-setup').textContent).not.toContain('생년월일');
});
it('higher displayed transparency makes both actual materials less opaque',async()=>{
 const user=userEvent.setup();render(<MemoryRouter><CompositionMannequin comparisonData={{measurement,body_profile:profile}}/></MemoryRouter>);
 await user.click(screen.getByText('투명도 · 골격 · 표현 설정'));
 expect(screen.getByLabelText('내 마네킹 투명도').value).toBe('50');expect(screen.getByLabelText('평균 마네킹 투명도').value).toBe('70');
 fireEvent.change(screen.getByLabelText('내 마네킹 투명도'),{target:{value:'80'}});fireEvent.change(screen.getByLabelText('평균 마네킹 투명도'),{target:{value:'75'}});
 expect(scene.mock.lastCall[0].mannequin.options).toMatchObject({myOpacity:.2,referenceOpacity:.25});
 await user.click(screen.getByRole('checkbox',{name:'표준 체형 윤곽선 보기'}));expect(scene.mock.lastCall[0].mannequin.options.referenceContour).toBe(false);
 await user.click(screen.getByRole('button',{name:'나란히 비교',exact:true}));expect(scene.mock.lastCall[0].mannequin.options.layout).toBe('side-by-side');
 await user.click(screen.getByRole('button',{name:'표준 체형 모형',exact:true}));expect(scene.mock.lastCall[0].mannequin.options).toMatchObject({showMy:false,showReference:true});
 expect(screen.queryByText('내 체성분 · 30 kg')).toBeNull();expect(screen.getByText('표준 체형 · 29.6 kg')).toBeTruthy();
});
it('describes muscle against the standard body and still overlays when muscle cannot be compared',()=>{
 const view=render(<MemoryRouter><CompositionMannequin comparisonData={{measurement,body_profile:profile}}/></MemoryRouter>);
 expect(screen.getByText('표준 체형보다 0.4 kg 많아요')).toBeTruthy();
 view.rerender(<MemoryRouter><CompositionMannequin comparisonData={{measurement:{...measurement,body_fat_percentage:null},body_profile:profile}}/></MemoryRouter>);
 expect(scene.mock.lastCall[0].mannequin.referenceMeasurement).toMatchObject({weight:69.7,body_fat_percentage:15});
 expect(scene.mock.lastCall[0].mannequin.referenceMeasurement.skeletal_muscle_mass).toBeUndefined();
 expect(screen.getByText(/표준 체형의 골격근량도 비교합니다/)).toBeTruthy();
 expect(screen.getByRole('button',{name:'표준 체형 모형',exact:true}).disabled).toBe(false);
});
