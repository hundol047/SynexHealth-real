// Optional screen lock. It keeps someone who picks up an unlocked phone out of the app.
// Records stay encrypted by the device key either way; the PIN is not the encryption key,
// and a short numeric PIN is not a defence against someone who can read device storage.
const KEY='synex-app-lock-v1',ITERATIONS=310000,FREE_ATTEMPTS=5;
export const PIN_PATTERN=/^\d{4,8}$/;
const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
function read(){try{const v=JSON.parse(localStorage.getItem(KEY));return v&&typeof v.salt==='string'&&typeof v.hash==='string'?v:null;}catch{return null;}}
const write=value=>localStorage.setItem(KEY,JSON.stringify(value));
async function derive(pin,salt,iterations){
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
 return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},material,256));
}
export const appLockEnabled=()=>!!read();
export async function setAppLock(pin){
 if(!PIN_PATTERN.test(pin))throw Error('숫자 4~8자리로 입력하세요.');
 if(/^(\d)\1+$/.test(pin)||'0123456789012345'.includes(pin)||'9876543210987654'.includes(pin))throw Error('같은 숫자 반복이나 연속된 숫자는 사용할 수 없어요.');
 const salt=crypto.getRandomValues(new Uint8Array(16));
 write({salt:encode(salt),hash:encode(await derive(pin,salt,ITERATIONS)),iterations:ITERATIONS,fails:0,lockedUntil:0});
}
/** Seconds the user must still wait after repeated wrong attempts (0 when free to try). */
export function appLockWait(now=Date.now()){const v=read();return v?.lockedUntil>now?Math.ceil((v.lockedUntil-now)/1000):0;}
export async function verifyAppLock(pin,now=Date.now()){
 const v=read();if(!v)return true;
 if(v.lockedUntil>now)return false;
 const actual=await derive(String(pin),decode(v.salt),v.iterations||ITERATIONS),expected=decode(v.hash);
 let difference=actual.length^expected.length;for(let i=0;i<expected.length;i++)difference|=actual[i]^expected[i];
 if(difference===0){write({...v,fails:0,lockedUntil:0});return true;}
 const fails=(v.fails||0)+1;
 // 30 s after the fifth miss, doubling to a 15 minute ceiling.
 write({...v,fails,lockedUntil:fails>=FREE_ATTEMPTS?now+Math.min(900,30*2**(fails-FREE_ATTEMPTS))*1000:0});
 return false;
}
export async function removeAppLock(pin){if(!await verifyAppLock(pin))return false;localStorage.removeItem(KEY);return true;}
