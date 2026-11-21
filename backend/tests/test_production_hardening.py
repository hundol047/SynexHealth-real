from datetime import date,datetime,timedelta,timezone
import pytest
from test_health import client

def test_migration_checksums_repeated_and_tamper_rejected(tmp_path):
    from app.health.store import HealthStore
    path=tmp_path/'migration.db'
    store=HealthStore(path)
    HealthStore(path)
    with store.connect() as db:
        assert db.execute('SELECT COUNT(*) FROM migration_history').fetchone()[0]==1
        db.execute('UPDATE migration_history SET checksum=?',('tampered',))
    with pytest.raises(RuntimeError,match='checksum'):HealthStore(path)

def test_reusing_mutation_with_changed_body_conflicts(client):
    r=client.post('/api/exercise-routines/generate').json();e=r['exercises'][0]
    p={'routine_id':r['id'],'routine_exercise_id':e['exercise_id'],'day_number':e['day_number'],'exercise_name':e['exercise_name'],'date':date.today().isoformat(),'mutation_id':'checksum-replay','sets_completed':1}
    assert client.post('/api/workouts',json=p).status_code==200
    assert client.post('/api/workouts',json=p).json()['revision']==1
    assert client.post('/api/workouts',json={**p,'sets_completed':2}).status_code==409

def test_pool_settings_validate_without_connecting(monkeypatch):
    from app.services.persistence import Database
    monkeypatch.setenv('DB_POOL_SIZE','2');monkeypatch.setenv('DB_MAX_OVERFLOW','1');monkeypatch.setenv('DB_POOL_TIMEOUT','7');monkeypatch.setenv('DB_POOL_RECYCLE','90')
    d=Database('postgresql+psycopg://test:test@localhost/synex_test')
    assert d.engine.pool.size()==2 and d.engine.pool.timeout()==7
    d.engine.dispose();monkeypatch.setenv('DB_POOL_SIZE','0')
    with pytest.raises(ValueError):Database('postgresql+psycopg://test:test@localhost/synex_test')

def configure(monkeypatch):
    for k,v in {'AUTH_MODE':'oidc','BILLING_MODE':'revenuecat','REVENUECAT_SECRET_KEY':'unit-secret','REVENUECAT_WEBHOOK_AUTH':'Bearer unit','REVENUECAT_PRODUCTS':'plus-test','APPLE_PRODUCT_ID':'plus-test','GOOGLE_PRODUCT_ID':'plus-test','ENTITLEMENT_ID':'plus'}.items():monkeypatch.setenv(k,v)

@pytest.mark.parametrize('event,subscription,state,active',[
 ('INITIAL_PURCHASE',{},'active',True),('RENEWAL',{},'active',True),
 ('CANCELLATION',{'unsubscribe_detected_at':'2026-01-01'},'cancelled',True),
 ('BILLING_ISSUE',{'billing_issues_detected_at':'2026-01-01','grace_period_expires_date':'2099-01-01T00:00:00Z'},'grace_period',True),
 ('BILLING_ISSUE',{'billing_issues_detected_at':'2026-01-01'},'billing_issue',True),
 ('EXPIRATION',{},'expired',False),('REFUND',{'refunded_at':'2026-01-01'},'refunded',False),
 ('PRODUCT_CHANGE',{},'active',True),
])
def test_webhook_lifecycle_refetch_deduplicate_and_auth(client,monkeypatch,event,subscription,state,active):
    from app.health import billing
    configure(monkeypatch)
    cid,_=billing.account('student-jimin');calls=[]
    def get(*args,**kwargs):
        calls.append(1)
        return type('Response',(),{'raise_for_status':lambda self:None,'json':lambda self:{'subscriber':{'entitlements':{'plus':{'product_identifier':'plus-test','expires_date':'2000-01-01T00:00:00Z' if event=='EXPIRATION' else '2099-01-01T00:00:00Z'}},'subscriptions':{'plus-test':{'store':'app_store','is_sandbox':False,**subscription}}}}})()
    monkeypatch.setattr(billing.httpx,'get',get)
    body={'event':{'id':'unique-'+event,'type':event,'app_user_id':cid}}
    with pytest.raises(Exception):billing.webhook(body,'bad')
    assert billing.webhook(body,'Bearer unit')=={'ok':True}
    assert billing.account('student-jimin')[1]['state']==state
    assert billing.account('student-jimin')[1]['active']==active
    assert billing.webhook(body,'Bearer unit')['duplicate'] is True and len(calls)==1
    # Old events must read the current server state, not replay their original entitlement.
    body['event'].update(id='older-'+event,event_timestamp_ms=1)
    billing.webhook(body,'Bearer unit')
    assert billing.account('student-jimin')[1]['state']==state

def test_production_rejects_sandbox_even_when_allow_flag_set(client,monkeypatch):
    from app.health import billing
    configure(monkeypatch);monkeypatch.setenv('REVENUECAT_ALLOW_SANDBOX','true');monkeypatch.setenv('APP_ENV','production')
    billing.account('student-jimin')
    data={'subscriber':{'entitlements':{'plus':{'product_identifier':'plus-test','expires_date':'2099-01-01T00:00:00Z'}},'subscriptions':{'plus-test':{'is_sandbox':True}}}}
    monkeypatch.setattr(billing.httpx,'get',lambda *a,**k:type('R',(),{'raise_for_status':lambda s:None,'json':lambda s:data})())
    p=billing.refresh('student-jimin');assert p['environment']=='sandbox' and not p['active']
    assert not billing.status('student-jimin')['active']
    monkeypatch.delenv('APPLE_PRODUCT_ID');assert not billing.purchase_config()['ready']

def test_catalog_camera_and_export_audit(client):
    entries=client.get('/api/exercise-catalog').json()
    assert next(e for e in entries if e['id']=='squat')['recommended_camera_angle']
    assert client.get('/api/privacy/export').status_code==200
    from app.health.router import audit
    assert any(e['event']=='data_export' and e['detail']=={} for e in audit.list('student-jimin'))


def test_security_headers_validation_redaction_and_auth_budget(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.services import security
    client = TestClient(app)
    api = client.get('/api/health/status')
    assert api.headers['content-security-policy'] == security.API_CSP
    assert 'geolocation=()' in api.headers['permissions-policy']
    assert api.headers['cross-origin-opener-policy'] == 'same-origin'
    page = client.get('/healthz')
    assert "script-src 'self' 'wasm-unsafe-eval'" in page.headers['content-security-policy']
    assert "object-src 'none'" in page.headers['content-security-policy']
    assert "'unsafe-eval'" not in page.headers['content-security-policy'].replace("'wasm-unsafe-eval'", '')
    # Submitted health values must not be reflected by validation errors.
    bad = client.post('/api/body-composition', json={'measurement_date': '2026-01-01', 'weight': 'SECRET-73.5kg', 'skeletal_muscle_mass': 20},
                      headers={'X-Synex-Demo-User': 'student-jimin'})
    assert bad.status_code == 422
    assert 'SECRET-73.5kg' not in bad.text
    assert all(set(item) == {'loc', 'msg', 'type'} for item in bad.json()['detail'])


def test_auth_endpoints_have_a_smaller_rate_budget():
    import asyncio
    from app.services.security import SecurityMiddleware
    statuses = []

    async def inner(scope, receive, send):
        await send({'type': 'http.response.start', 'status': 204, 'headers': []})
        await send({'type': 'http.response.body', 'body': b''})

    middleware = SecurityMiddleware(inner)

    async def call(path):
        async def receive():
            return {'type': 'http.request', 'body': b'', 'more_body': False}

        async def send(message):
            if message['type'] == 'http.response.start':
                statuses.append(message['status'])
        await middleware({'type': 'http', 'method': 'GET', 'path': path, 'headers': [], 'client': ('203.0.113.9', 1), 'scheme': 'http'}, receive, send)

    async def run():
        for _ in range(31):
            await call('/api/auth/session')
        await call('/api/health/status')
    asyncio.run(run())
    assert statuses[:30] == [204] * 30 and statuses[30] == 429
    assert statuses[31] == 204


def test_api_documentation_is_not_published_in_production():
    import os, subprocess, sys
    code = ("from app.main import app;"
            "print([u for u in (app.docs_url, app.redoc_url, app.openapi_url) if u])")
    dev = subprocess.run([sys.executable, '-c', code], capture_output=True, text=True, env={**os.environ, 'APP_ENV': 'development'})
    assert '/openapi.json' in dev.stdout
    pilot_env = {**os.environ, 'PILOT_MODE': 'true'}
    out = subprocess.run([sys.executable, '-c', "import os\nfrom app.services import release_config\nrelease_config.validate_production=lambda env=None:None\n" + code],
                         capture_output=True, text=True, env=pilot_env)
    assert out.stdout.strip() == '[]', out.stderr[-400:]


def test_review_login_locks_after_repeated_wrong_passwords(monkeypatch):
    import hashlib
    from fastapi import HTTPException
    from app.services import review_access
    monkeypatch.setenv('APP_REVIEW_MODE', 'true'); monkeypatch.setenv('APP_REVIEW_USERNAME', 'reviewer'); monkeypatch.setenv('APP_REVIEW_SALT', 'salt')
    monkeypatch.setenv('APP_REVIEW_PASSWORD_HASH', hashlib.pbkdf2_hmac('sha256', b'correct horse', b'salt', 600000).hex())
    review_access.FAILURES.clear()
    for _ in range(review_access.MAX_FAILURES):
        try:
            review_access.review(review_access.Login(username='reviewer', password='wrong'))
        except HTTPException as error:
            assert error.status_code == 401
    # Even the right password is refused while locked, from any address.
    try:
        review_access.review(review_access.Login(username='reviewer', password='correct horse'))
        raise AssertionError('expected lock')
    except HTTPException as error:
        assert error.status_code == 429
    review_access.FAILURES.clear()
