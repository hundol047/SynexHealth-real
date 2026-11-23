"""Bounded request bodies, process-local abuse guard and redacted error responses.
Deploy a shared gateway limiter for multi-worker/global enforcement.
"""
import time,hashlib
from collections import OrderedDict
from starlette.responses import JSONResponse
# API responses are data only: nothing in them may load or run anything.
API_CSP="default-src 'none'; frame-ancestors 'none'"
# The app shell runs only its own bundled scripts. WebAssembly is the bundled pose model,
# blob: covers local video recordings and workers, inline styles come from React style props.
# connect-src keeps https: because the OIDC token endpoint is on the identity provider's host.
APP_CSP=("default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; "
 "img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; worker-src 'self' blob:; "
 "connect-src 'self' https: data: blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")
# Only the camera (pose coaching) and microphone (optional recording) are ever requested.
PERMISSIONS_POLICY='camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), bluetooth=(), browsing-topics=()'
# FastAPI's interactive docs load their script from a CDN and start it inline. They are only
# served outside production (see main.py), so they are exempt rather than loosening APP_CSP.
DOCS_PATHS=frozenset(('/docs','/redoc','/docs/oauth2-redirect'))
class SecurityMiddleware:
 def __init__(self,app):self.app=app;self.buckets=OrderedDict()
 async def __call__(self,scope,receive,send):
  if scope['type']!='http':return await self.app(scope,receive,send)
  import os
  if os.getenv('APP_ENV')=='production' and scope.get('scheme')!='https':return await JSONResponse({'detail':'HTTPS 연결이 필요합니다.'},400)(scope,receive,send)
  path=scope.get('path','');headers=dict(scope.get('headers',[]));method=scope['method']
  if path.startswith('/api/'):
   key=hashlib.sha256(((scope.get('client') or ('unknown',0))[0]+('review' if path=='/api/auth/review' else '')).encode()).digest();minute=int(time.time()/60)
   old,count=self.buckets.get(key,(minute,0));count=count+1 if old==minute else 1;self.buckets[key]=(minute,count);self.buckets.move_to_end(key)
   while len(self.buckets)>10000:self.buckets.popitem(last=False)
   # Session changes get a smaller budget than ordinary API reads. Public sign-in configuration
   # (GET) is not counted: every login screen loads it, and a whole class behind one campus
   # address opening the app together must not lock each other out.
   if path.startswith('/api/auth/') and path!='/api/auth/review' and method not in ('GET','HEAD','OPTIONS'):
    auth_key=key+b'auth';old_auth,auth_count=self.buckets.get(auth_key,(minute,0));auth_count=auth_count+1 if old_auth==minute else 1;self.buckets[auth_key]=(minute,auth_count)
    if auth_count>60:return await JSONResponse({'detail':'요청이 많습니다. 잠시 후 다시 시도하세요.'},429,headers={'Retry-After':'60'})(scope,receive,send)
   if count>(10 if path=='/api/auth/review' else 240):return await JSONResponse({'detail':'요청이 많습니다. 잠시 후 다시 시도하세요.'},429,headers={'Retry-After':'60'})(scope,receive,send)
   if headers.get(b'cookie') and not headers.get(b'authorization',b'').lower().startswith(b'bearer ') and method not in ('GET','HEAD','OPTIONS'):
    import os
    allowed=os.getenv('SYNEX_CORS_ORIGINS','http://localhost:5173,http://127.0.0.1:5173').split(',')
    allowed=[origin.strip() for origin in allowed]
    if headers.get(b'origin',b'').decode() not in allowed:return await JSONResponse({'detail':'허용되지 않은 요청 출처입니다.'},403)(scope,receive,send)
   messages=[];size=0
   while True:
    message=await receive()
    if message['type']=='http.disconnect':return
    size+=len(message.get('body',b''))
    if size>2*1024*1024:return await JSONResponse({'detail':'요청 크기 제한을 초과했습니다.'},413)(scope,receive,send)
    messages.append(message)
    if not message.get('more_body'):break
   async def bounded_receive():return messages.pop(0) if messages else await receive()
  else:bounded_receive=receive
  async def secure_send(message):
   if message['type']=='http.response.start':
    message['headers']=list(message.get('headers',[]))+[(b'x-content-type-options',b'nosniff'),(b'referrer-policy',b'no-referrer'),(b'x-frame-options',b'DENY'),(b'cache-control',b'no-store'),
     *([] if path in DOCS_PATHS else [(b'content-security-policy',(API_CSP if path.startswith('/api/') else APP_CSP).encode())]),(b'permissions-policy',PERMISSIONS_POLICY.encode()),
     (b'cross-origin-opener-policy',b'same-origin'),(b'x-permitted-cross-domain-policies',b'none')]
    if scope.get('scheme')=='https':message['headers'].append((b'strict-transport-security',b'max-age=31536000; includeSubDomains'))
   await send(message)
  await self.app(scope,bounded_receive,secure_send)
