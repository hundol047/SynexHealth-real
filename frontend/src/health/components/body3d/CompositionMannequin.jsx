import React,{useMemo,useState,useRef,useLayoutEffect} from 'react';
import './mannequin.css';
import {Link} from 'react-router-dom';
import BodyScene from './BodyScene.jsx';
import {BODY_FOCUS_AREAS} from './mannequinFocus.js';
import {standardBodyReference,STANDARD_BODY} from '../../lib/standardBodyReference.js';
import {GIRTH_FIELDS} from './mannequinMath.js';
import {signed} from './overlayMath.js';
import MuscleComparisonReadout,{COMPARISON_OPACITY} from './MuscleComparisonReadout.jsx';
import SegmentComparisonReadout from './SegmentComparisonReadout.jsx';
const format=v=>Number.isFinite(v)?Number(v.toFixed(1)):'—';
export default function CompositionMannequin({comparisonData,height=540}){
 const m=comparisonData?.measurement,profile=comparisonData?.body_profile||{};
 const [display,setDisplay]=useState('overlap'),[selected,setSelected]=useState(null),[focusRegion,setFocusRegion]=useState('whole'),[focusRevision,setFocusRevision]=useState(0);
 const sceneElement=useRef(null),readoutElement=useRef(null);
 useLayoutEffect(()=>{
  const card=readoutElement.current,viewer=sceneElement.current;if(!card||!viewer||!selected)return;
  const measure=()=>viewer.style.setProperty('--comparison-card-height',`${card.getBoundingClientRect().height}px`);
  measure();const observer=new ResizeObserver(measure);observer.observe(card);return()=>observer.disconnect();
 },[selected]);
 function selectSurface(segment){
  const area=BODY_FOCUS_AREAS.find(a=>a.segment===segment&&segment!=='TRUNK');
  if(area)focusArea(area);else{setSelected(segment);setFocusRegion('whole');setFocusRevision(v=>v+1);scrollToComparison();}
 }
 function scrollToComparison(){requestAnimationFrame(()=>{const element=sceneElement.current;if(!element)return;const box=element.getBoundingClientRect();if(box.bottom>window.innerHeight-80||box.top<0)element.scrollIntoView({block:'center',behavior:'auto'});});}
 function focusArea(area){
  setFocusRegion(area.id);setSelected(area.segment);setFocusRevision(v=>v+1);
  scrollToComparison();
 }
 const [myOpacity,setMyOpacity]=useState(COMPARISON_OPACITY.myOpacity),[referenceOpacity,setReferenceOpacity]=useState(COMPARISON_OPACITY.referenceOpacity),[skeleton,setSkeleton]=useState(false),[referenceWireframe,setReferenceWireframe]=useState(false),[referenceContour,setReferenceContour]=useState(true);
 const reference=useMemo(()=>standardBodyReference(m,profile),[m,profile]);
 const refMeasurement=reference.measurement||null;
 const options={showMy:display!=='reference'||!refMeasurement,showReference:display!=='my',layout:display==='side-by-side'?'side-by-side':'overlap',myOpacity,referenceOpacity,skeleton,referenceWireframe,referenceContour};
 const mannequin=useMemo(()=>({referenceMeasurement:refMeasurement,referenceLabel:STANDARD_BODY.label,options}),[refMeasurement,display,myOpacity,referenceOpacity,skeleton,referenceWireframe,referenceContour]);
 const missing=[['height','키'],['weight','체중'],['body_fat_percentage','체지방률'],['skeletal_muscle_mass','골격근량']].filter(([k])=>!Number.isFinite(k==='height'?m?.height||profile.height_cm:m?.[k])).map(([,label])=>label);
 if(!m)return <p>인바디 결과지의 수치를 입력하면 내 마네킹이 만들어집니다. <Link to="/health/profile">측정값 입력하기</Link></p>;
 return <div className="composition-mannequin" aria-label="내 체성분 마네킹">
  <div className="mannequin-heading"><div><span className="mannequin-eyebrow">MY BODY</span><h3>수치로 그린 내 몸</h3><p className="muted">{m.measurement_date} 측정 · 반투명 3D</p></div><Link className="btn btn-secondary" to="/health/profile">인바디 수치 입력</Link></div>
  <div className="mannequin-stats">{[['키',m.height||profile.height_cm,'cm'],['체중',m.weight,'kg'],['체지방률',m.body_fat_percentage,'%'],['골격근량',m.skeletal_muscle_mass,'kg'],...(Number.isFinite(m.bone_mass)?[['추정 골량',m.bone_mass,'kg']]:[]),...(Number.isFinite(m.mineral_mass)?[['무기질량',m.mineral_mass,'kg']]:[])].map(([name,value,unit])=><div key={name}><span>{name}</span><strong>{format(value)} <small>{unit}</small></strong></div>)}</div>
  {missing.length>0&&<p role="status" className="mannequin-note">{missing.join('·')} 미입력: 해당 부분은 기본 형상입니다. <Link to="/health/profile">측정값 보완</Link></p>}
  {!refMeasurement&&<div className="mannequin-reference-setup" role="status"><strong>표준 체형 3D 모형 입력 확인</strong><p>{reference.reason}</p><Link className="btn btn-secondary" to="/health/profile">프로필에서 {reference.missing.join('·')} 설정</Link></div>}
  <div className="mannequin-display" aria-label="마네킹 표시 선택">{[['overlap','겹쳐보기'],['side-by-side','나란히 비교'],['my','내 몸만'],['reference','표준 체형 모형']].map(([id,title])=><button className={`btn ${display===id?'btn-primary':'btn-ghost'}`} key={id} aria-pressed={display===id} disabled={['side-by-side','reference'].includes(id)&&!refMeasurement} onClick={()=>setDisplay(id)}>{title}</button>)}</div>
  <div className={`mannequin-legend ${display==='side-by-side'&&refMeasurement?'paired':''}`}>{options.showMy&&<span><i/>내 체성분 · {format(m.skeletal_muscle_mass)} kg</span>}{options.showReference&&refMeasurement&&<span><i className="reference"/>{STANDARD_BODY.label} · {reference.value!=null?`${format(reference.value)} kg`:`체중 ${format(reference.weight)} kg`}</span>}</div>
  <MuscleComparisonReadout reference={reference} own={m.skeletal_muscle_mass}/>
  {refMeasurement&&options.showMy&&options.showReference&&<p className="mannequin-comparison-hint">{display==='side-by-side'?'왼쪽은 내 몸, 오른쪽은 같은 키·성별의 표준 체형 3D 모형입니다.':'내 몸과 같은 키·성별 표준 체형 모형의 키·발 위치를 맞춰 같은 자리에 겹쳤습니다.'} 청록색 반투명 신체는 내 몸, 살구색 반투명 신체는 표준 체형입니다. 두 신체의 색 면과 입체적인 부피를 겹쳐 비교하세요. 얇은 윤곽선은 경계를 구분하는 보조 표시입니다. 청록색 면이 바깥으로 드러나면 내 몸이, 살구색 면이 드러나면 표준 체형이 더 큰 부분입니다. {display==='overlap'&&'얼굴과 목은 내 모형 하나로 표시합니다.'}</p>}
  <div className="mannequin-focus-picker" role="group" aria-label="부위 확대 선택">
   <strong>자세히 볼 부위</strong><div>{BODY_FOCUS_AREAS.map(area=><button type="button" key={area.id} className={`btn ${focusRegion===area.id?'btn-primary':'btn-ghost'}`} aria-pressed={focusRegion===area.id} onClick={()=>focusArea(area)}>{area.label}</button>)}</div>
   <p aria-live="polite">{focusRegion==='whole'?'부위를 누르면 해당 부위를 크게 보여줍니다.':`${BODY_FOCUS_AREAS.find(a=>a.id===focusRegion).label} 확대 보기 · 드래그로 돌려서 비교하세요.`}</p>
  </div>
  <div ref={sceneElement} className={`mannequin-focus-view ${selected?'has-readout':''}`}>
   <div ref={readoutElement}><SegmentComparisonReadout {...{selected,focusRegion,comparisonData}} totalReference={reference}/></div>
   <BodyScene {...{measurement:m,profile,height,selectedSegment:selected,onSelect:selectSurface,mannequin,focusRegion,focusRevision}} onFocusReset={()=>focusArea(BODY_FOCUS_AREAS[0])} gender={profile.gender} performanceMode="composition_mannequin"/>
  </div>
  <details className="mannequin-settings"><summary>투명도 · 골격 · 표현 설정</summary><div>
   <p className="muted">투명도가 높을수록 모형이 더 비쳐 보입니다.</p>
   <label>내 몸 투명도 {Math.round((1-myOpacity)*100)}%<input aria-label="내 마네킹 투명도" type="range" min="10" max="90" step="1" value={Math.round((1-myOpacity)*100)} onChange={e=>setMyOpacity(Number(((100-Number(e.target.value))/100).toFixed(2)))}/></label>
   <label>평균 투명도 {Math.round((1-referenceOpacity)*100)}%<input aria-label="평균 마네킹 투명도" type="range" min="10" max="90" step="1" value={Math.round((1-referenceOpacity)*100)} onChange={e=>setReferenceOpacity(Number(((100-Number(e.target.value))/100).toFixed(2)))}/></label>
   <label><input type="checkbox" checked={skeleton} onChange={e=>setSkeleton(e.target.checked)}/>골격 구조 보기 (설명용)</label>
   <label><input type="checkbox" checked={referenceWireframe} onChange={e=>setReferenceWireframe(e.target.checked)}/>표준 체형 격자선</label>
   <label><input type="checkbox" checked={referenceContour} onChange={e=>setReferenceContour(e.target.checked)}/>표준 체형 윤곽선 보기</label>
  </div></details>
  <div className="mannequin-reference-card"><h4>같은 키·성별 표준 체형 비교</h4><p>{STANDARD_BODY.basis} 겹친 신체는 설명용 모형입니다.</p>{refMeasurement?<>
   <div className="mannequin-mass-comparison"><span>체중<strong>{format(m.weight)} <small>kg</small></strong><small>표준 {format(reference.weight)} kg</small></span><span>체지방률<strong>{format(m.body_fat_percentage)} <small>%</small></strong><small>표준 {reference.bodyFat}%</small></span><span>골격근량<strong>{format(m.skeletal_muscle_mass)} <small>kg</small></strong><small>표준 {reference.value!=null?`${format(reference.value)} kg`:'—'}</small></span></div>
   <p>{profile.gender==='female'?'여성':'남성'} · 키 {format(reference.height)} cm 기준 · 별도 입력 없이 자동 생성</p>
   <p className="muted">표준 체형의 골격근량은 내 측정의 골격근량/제지방량 비율을 표준 제지방량에 적용한 값입니다. 근육 부족이나 비만을 판정하지 않습니다.</p>
   {reference.muscleReason&&<p>{reference.muscleReason}</p>}
  </>:<p>{reference.reason} <Link to="/health/profile">프로필 설정</Link></p>}</div>
  <p className="mannequin-note">체성분 기반 근사 모형입니다. 지방 분포와 얼굴·뼈 모양을 그대로 복원하지는 못합니다. {GIRTH_FIELDS.some(([k])=>Number.isFinite(m[k]))?'입력한 가슴·허리·엉덩이 둘레를 형상에 반영했습니다.':'가슴·허리·엉덩이 둘레를 추가하면 체형을 더 가깝게 맞출 수 있습니다.'}</p>
 </div>;
}
