import os, logging
from .services.release_config import validate_production
validate_production()
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .health.router import router as health_router, store as health_store
from .health.demo_seed import seed_demo_data
from .health.providers.base import ProviderNotConfigured
from .health import health_agent

log = logging.getLogger('synex_health')


def resolve_cors_config(cors_origins_env=None, allow_credentials_env=None):
    """Same rule as SynexAgent's main.py: allow_credentials=True (needed for the demo auth session
    cookie) can never be combined with a wildcard origin -- see that file's docstring for the
    CSRF-shaped hole this prevents."""
    origins = [o.strip() for o in (cors_origins_env if cors_origins_env is not None else
               os.getenv('SYNEX_CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173')).split(',') if o.strip()]
    allow_credentials = (allow_credentials_env if allow_credentials_env is not None else
                          os.getenv('SYNEX_CORS_ALLOW_CREDENTIALS', 'true')).lower() != 'false'
    if '*' in origins and allow_credentials:
        raise RuntimeError('SYNEX_CORS_ORIGINS must not be "*" while credentialed CORS is enabled.')
    return origins, allow_credentials


@asynccontextmanager
async def lifespan(app):
    if os.getenv('AUTH_MODE', 'demo').lower() == 'demo' and os.getenv('SYNEX_HEALTH_DEMO_SEED', 'true').lower() != 'false':
        seed_demo_data(health_store)
    yield

# Interactive API documentation describes every endpoint and schema; never publish it in production.
_public_docs = os.getenv('APP_ENV') != 'production' and os.getenv('PILOT_MODE') != 'true'
app = FastAPI(title='Synex Health API', version='0.1.0', lifespan=lifespan,
              docs_url='/docs' if _public_docs else None, redoc_url='/redoc' if _public_docs else None,
              openapi_url='/openapi.json' if _public_docs else None)
from .services.security import SecurityMiddleware
app.add_middleware(SecurityMiddleware)
_cors_origins, _cors_allow_credentials = resolve_cors_config()
app.add_middleware(CORSMiddleware, allow_origins=_cors_origins, allow_credentials=_cors_allow_credentials,
                    allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
                    allow_headers=['Content-Type', 'Authorization', 'X-Synex-Demo-User', 'Idempotency-Key'])


@app.exception_handler(RequestValidationError)
async def validation_handler(request, exc):
    # The default response echoes the submitted value ("input") and context back. Those are
    # health measurements; return only where the problem is and what it is.
    return JSONResponse(status_code=422, content={'detail': [
        {'loc': list(error.get('loc', ())), 'msg': error.get('msg', ''), 'type': error.get('type', '')} for error in exc.errors()]})


@app.exception_handler(Exception)
async def unexpected_handler(request, exc):
    # Log the failure class and route only -- never the message, which can carry user data.
    log.error('unhandled %s on %s %s', type(exc).__name__, request.method, request.url.path)
    return JSONResponse(status_code=500, content={'detail': '일시적인 오류가 발생했습니다. 잠시 후 다시 시도하세요.'})


@app.exception_handler(ProviderNotConfigured)
async def provider_not_configured_handler(request, exc):
    return JSONResponse(status_code=501, content={'detail': str(exc)})


@app.get('/api/health/status')
def health_status():
    from .health.providers.configured import inbody
    provider=inbody(health_store)
    return {
        'status': 'ok', 'demo': os.getenv('AUTH_MODE', 'demo').lower() == 'demo', 'service': 'synex-health', 'review_login':os.getenv('APP_REVIEW_MODE')=='true',
        'agent': {'status': 'ok', 'mode': health_agent.agent_mode()},
        'auth': {'status': 'ok', 'mode': os.getenv('AUTH_MODE', 'demo').lower()},
        'providers': {'mock': 'ok' if os.getenv('AUTH_MODE','demo')=='demo' else 'disabled', 'manual': 'ok', 'csv': 'ok', 'inbody': 'configured' if provider.configured() else 'not_configured', 'biogram': 'not_configured'},
    }


app.include_router(health_router)
from .health.billing import router as billing_router
app.include_router(billing_router)
from .health.extensions import router as extensions_router
app.include_router(extensions_router)
from .services.review_access import router as review_router
app.include_router(review_router)
from .services.persistent_login import router as persistent_login_router
app.include_router(persistent_login_router)


@app.get('/healthz', include_in_schema=False)
def liveness():
    return {'status':'ok'}


@app.get('/readyz', include_in_schema=False)
def readiness():
    # Probe the same storage as user writes; never expose connections or exception details.
    try:
        from .health.migrations import VERSION
        with health_store.connect() as db:
            version=db.execute('SELECT MAX(version) FROM schema_migrations').fetchone()
            db.execute('SELECT 1 FROM users LIMIT 1').fetchone()
        if not version or version[0]!=VERSION:
            return JSONResponse(status_code=503,content={'status':'not_ready'})
        return {'status':'ready'}
    except Exception:
        return JSONResponse(status_code=503,content={'status':'not_ready'})


DIST = Path(__file__).resolve().parents[2] / 'frontend' / 'dist'
if (DIST / 'index.html').is_file() and (DIST / 'assets').is_dir():
    import mimetypes
    mimetypes.add_type('application/octet-stream', '.task')
    if (DIST / 'pose').is_dir():
        app.mount('/pose', StaticFiles(directory=DIST / 'pose'), name='pose')
    app.mount('/assets', StaticFiles(directory=DIST / 'assets'), name='assets')
    models_dir = Path(__file__).resolve().parents[2] / 'frontend' / 'public' / 'models'
    if models_dir.exists():
        app.mount('/models', StaticFiles(directory=models_dir), name='models')

    @app.get('/{full_path:path}', include_in_schema=False)
    def spa(full_path: str):
        candidate = (DIST / full_path).resolve()
        if not candidate.is_relative_to(DIST.resolve()):
            raise HTTPException(404, 'Not found')
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST / 'index.html')
