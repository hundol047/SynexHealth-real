import 'fake-indexeddb/auto';
import React from 'react';
import {webcrypto} from 'node:crypto';
import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import {mockFetch} from './helpers.js';
import {localApi} from '../src/shared/lib/localApi.js';
import {bindOfflineAccount,clearOffline} from '../src/shared/lib/offline.js';
import {LOCAL_ACCOUNT,LOCAL_NAMESPACE} from '../src/shared/lib/localMode.js';
import RoutinePage from '../src/health/pages/RoutinePage.jsx';

beforeEach(async()=>{vi.stubGlobal('crypto',webcrypto);await bindOfflineAccount(LOCAL_ACCOUNT,LOCAL_NAMESPACE);});
afterEach(async()=>{await clearOffline();vi.unstubAllGlobals();});

it('personal mode builds a gentle starter plan before any measurement',async()=>{
 const r=await localApi('/api/exercise-routines/generate',{});
 expect(r.starter).toBe(true);expect(r.based_on_measurement_id).toBeNull();
 expect(r.exercises.length).toBeGreaterThan(0);expect(r.input_snapshot.weight_kg).toBeNull();
 expect(r.rationale.join(' ')).toContain('체성분 측정값이 없어');
 await localApi('/api/body-composition',{measurement_date:'2026-01-01',weight:60,height:165,skeletal_muscle_mass:24,segments:[]});
 const next=await localApi('/api/exercise-routines/generate',{});
 expect(next.starter).toBe(false);expect(next.input_snapshot.muscle_kg).toBe(24);
});

it('server mode guides the user to measurement entry instead of a dead-end error',async()=>{
 const profile={goal:'GENERAL_HEALTH',experience_level:'BEGINNER',days_per_week:3,minutes_per_session:30,training_mode:'mixed',exercise_location:'home',available_equipment:[],limitations:[],preferences:[],focus_regions:[],plan_unit:'week',plan_length:4};
 mockFetch({'/api/exercise-profile':profile,'/api/exercise-routines/generate':{status:404,body:{detail:'체성분 측정 데이터가 없어 루틴을 생성할 수 없습니다.'}},'/api/exercise-routines':[],'/api/adaptive':[]});
 render(<MemoryRouter><RoutinePage/></MemoryRouter>);
 await userEvent.click(await screen.findByRole('button',{name:'내 운동 계획 만들기'}));
 // Generation first confirms the goal, period and focus regions.
 await userEvent.click(await screen.findByRole('button',{name:'이 조건으로 루틴 생성'}));
 expect(await screen.findByText('체성분을 먼저 입력해 주세요')).toBeTruthy();
 expect(screen.getByRole('link',{name:'체성분 입력하기'}).getAttribute('href')).toBe('/health/profile#measurement-entry');
 expect(screen.queryByText('다시 시도')).toBeNull();
});

it('workout screen creates a plan in one tap instead of sending the user elsewhere',async()=>{
 const WorkoutPage=(await import('../src/health/pages/WorkoutPage.jsx')).default;
 let created=false;
 const routine={id:'R1',created_at:'2026-01-01T00:00:00Z',goal:'기본 체력 관리',summary:'',days_per_week:1,exercises:[]};
 mockFetch({'/api/exercise-routines/generate':()=>{created=true;return routine;},'/api/exercise-routines':()=>created?[routine]:[],'/api/workouts':[],'/api/body-composition/latest':{status:404,body:{detail:'none'}}});
 render(<MemoryRouter><WorkoutPage/></MemoryRouter>);
 await userEvent.click(await screen.findByRole('button',{name:'운동 계획 바로 만들기'}));
 await vi.waitFor(()=>expect(screen.queryByText('운동 루틴이 없어요')).toBeNull());
 expect(created).toBe(true);
});
