import React,{useEffect,useRef,useState} from 'react';
import {appLockEnabled,appLockWait,verifyAppLock,setAppLock,removeAppLock} from '../lib/appLock.js';
import {clearLocalAccount} from '../lib/accountLifecycle.js';

const RELOCK_AFTER_MS=60000;
const PinInput=React.forwardRef(function PinInput({label,value,onChange,disabled},ref){
 return <label className="app-lock-field">{label}<input ref={ref} className="text-input" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={8} disabled={disabled} value={value} onChange={e=>onChange(e.target.value.replace(/\D/g,''))}/></label>;
});

/** Hides the whole app behind the PIN at launch and after a minute in the background. */
export default function AppLockGate({children}){
 const [locked,setLocked]=useState(()=>appLockEnabled()),[pin,setPin]=useState(''),[error,setError]=useState(''),[wait,setWait]=useState(()=>appLockWait()),[busy,setBusy]=useState(false),[forgot,setForgot]=useState(false);
 const hiddenAt=useRef(0),input=useRef(null);
 useEffect(()=>{
  const onVisibility=()=>{
   if(document.hidden)hiddenAt.current=Date.now();
   else if(hiddenAt.current&&Date.now()-hiddenAt.current>RELOCK_AFTER_MS&&appLockEnabled()){setPin('');setError('');setLocked(true);}
  };
  document.addEventListener('visibilitychange',onVisibility);return()=>document.removeEventListener('visibilitychange',onVisibility);
 },[]);
 useEffect(()=>{if(!locked||!wait)return;const timer=setInterval(()=>setWait(appLockWait()),1000);return()=>clearInterval(timer);},[locked,wait]);
 useEffect(()=>{if(locked&&!wait)input.current?.focus?.();},[locked,wait]);
 if(!locked)return children;
 async function unlock(event){
  event.preventDefault();if(busy||wait||pin.length<4)return;setBusy(true);
  try{
   if(await verifyAppLock(pin)){setLocked(false);setError('');}
   else{const seconds=appLockWait();setWait(seconds);setError(seconds?'여러 번 틀렸어요. 잠시 후 다시 시도하세요.':'PIN이 맞지 않아요.');}
  }catch{setError('PIN을 확인하지 못했어요. 다시 시도하세요.');}
  finally{setPin('');setBusy(false);}
 }
 async function wipe(){
  if(!window.confirm('이 기기의 모든 기록과 설정을 지우고 처음 상태로 돌아갑니다. 백업 파일이 없으면 복구할 수 없어요. 계속할까요?'))return;
  setBusy(true);try{await clearLocalAccount();}finally{location.replace('/health');}
 }
 return <main className="app-lock-screen" aria-labelledby="app-lock-title">
  <form className="app-lock-card" onSubmit={unlock}>
   <div className="health-brand-icon" aria-hidden="true">SH</div>
   <h1 id="app-lock-title">앱 잠금</h1>
   <p className="muted">PIN을 입력하면 내 건강 기록이 열려요.</p>
   <PinInput ref={input} label="PIN" value={pin} onChange={setPin} disabled={busy||!!wait}/>
   {wait>0&&<p role="status" className="text-warning">{wait}초 뒤에 다시 입력할 수 있어요.</p>}
   {error&&!wait&&<p role="alert" className="text-danger">{error}</p>}
   <button className="btn btn-primary" type="submit" disabled={busy||!!wait||pin.length<4}>잠금 해제</button>
   <button className="btn btn-ghost" type="button" onClick={()=>setForgot(v=>!v)}>PIN을 잊었어요</button>
   {forgot&&<div className="app-lock-forgot"><p className="muted">PIN은 복구할 수 없어요. 계속 사용하려면 이 기기의 기록을 모두 지우고 새로 시작해야 합니다. 암호화 백업 파일이 있다면 초기화 뒤에 복원할 수 있어요.</p><button className="btn btn-ghost text-danger" type="button" disabled={busy} onClick={wipe}>기록을 지우고 새로 시작</button></div>}
  </form>
 </main>;
}

/** Settings card: one field to turn the lock on, one to turn it off. */
export function AppLockSettings(){
 const [enabled,setEnabled]=useState(()=>appLockEnabled()),[pin,setPin]=useState(''),[again,setAgain]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function enable(event){
  event.preventDefault();if(pin!==again){setMessage('두 PIN이 서로 달라요.');setPin('');setAgain('');return;}
  setBusy(true);try{await setAppLock(pin);setEnabled(true);setMessage('앱 잠금을 켰어요. 앱을 열 때와 1분 이상 자리를 비운 뒤에 PIN을 묻습니다.');}catch(e){setMessage(e.message);}finally{setPin('');setAgain('');setBusy(false);}
 }
 async function disable(event){
  event.preventDefault();setBusy(true);
  try{if(await removeAppLock(pin)){setEnabled(false);setMessage('앱 잠금을 껐어요.');}else{const seconds=appLockWait();setMessage(seconds?`여러 번 틀렸어요. ${seconds}초 뒤에 다시 시도하세요.`:'PIN이 맞지 않아요.');}}
  catch(e){setMessage(e.message);}finally{setPin('');setBusy(false);}
 }
 return <section className="card" id="app-lock-settings"><div className="card-title-row"><h2>앱 잠금</h2><span className={`badge badge-${enabled?'success':'demo'}`}>{enabled?'켜짐':'꺼짐'}</span></div>
  <p className="muted">다른 사람이 내 폰을 잠깐 쓸 때 건강 기록이 보이지 않게 PIN으로 가립니다. 기록은 잠금과 관계없이 기기 암호화로 보관됩니다.</p>
  {enabled?<form onSubmit={disable} className="app-lock-form"><PinInput label="현재 PIN" value={pin} onChange={setPin} disabled={busy}/><button className="btn btn-ghost" type="submit" disabled={busy||pin.length<4}>앱 잠금 끄기</button></form>
  :<form onSubmit={enable} className="app-lock-form"><PinInput label="새 PIN (숫자 4~8자리)" value={pin} onChange={setPin} disabled={busy}/><PinInput label="새 PIN 다시 입력" value={again} onChange={setAgain} disabled={busy}/><button className="btn btn-primary" type="submit" disabled={busy||pin.length<4||again.length<4}>앱 잠금 켜기</button></form>}
  {message&&<p role="status">{message}</p>}
  {!enabled&&<p className="muted">PIN을 잊으면 복구할 수 없고 기기 기록을 지워야 해요. 먼저 암호화 백업을 만들어 두세요.</p>}
 </section>;
}
