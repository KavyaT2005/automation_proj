import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import engine, Base
from .routers import documents, mappings, automation, admin

# Create DB tables (if they don't exist)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Set CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import Request
from fastapi.responses import JSONResponse
import time
from collections import defaultdict
from .routers.admin import append_admin_log, load_admin_data
from .services.cache_service import cache_service

# Simple sliding window rate limiter in memory (IP -> list of timestamps)
IP_REQUESTS = defaultdict(list)

@app.middleware("http")
async def rate_limiting_middleware(request: Request, call_next):
    # Check/Generate Correlation ID for Distributed Tracing (Point 10)
    import uuid
    correlation_id = request.headers.get("X-Correlation-ID") or f"corr_{uuid.uuid4().hex[:12]}"
    request.state.correlation_id = correlation_id

    # Only rate limit & auth API requests
    if request.url.path.startswith(settings.API_V1_STR):
        # Exclude admin and auth session routes from auth checks to prevent lockout loops
        if "/admin/" not in request.url.path and "/session/create" not in request.url.path:
            # 1. Resolve API Key & RBAC Info
            api_key_header = request.headers.get("X-API-Key") or request.headers.get("Authorization")
            workspace_name = "Default Workspace"
            user_name = "Guest User"
            api_key_prefix = "Unauthenticated"
            permissions_role = "Read Only"
            plan_name = "Free Tier"
            
            # API Key / Embed Token authentication (Points 1, 4, 5)
            if api_key_header:
                raw_key = api_key_header
                if raw_key.lower().startswith("bearer "):
                    raw_key = raw_key[7:]
                
                # Check if it's a short-lived Bearer Embed Token (Point 1 & 4)
                if raw_key.startswith("uni_sess_"):
                    session_key = f"session:token:{raw_key}"
                    session_payload = cache_service.get(session_key)
                    if session_payload:
                        # Origin Validation (Point 5)
                        client_origin = request.headers.get("Origin") or request.headers.get("Referer")
                        expected_origin = session_payload.get("allowed_origin")
                        
                        # Match origin hostname constraints
                        if expected_origin and client_origin and expected_origin not in client_origin:
                            append_admin_log("auth", "WARNING", f"[{correlation_id}] Embed Token Origin Mismatch: Expected '{expected_origin}', Got '{client_origin}'")
                            return JSONResponse(
                                status_code=403,
                                content={"detail": "Forbidden. Parent origin validation failed."},
                            )
                        
                        workspace_name = session_payload.get("workspace")
                        permissions_role = session_payload.get("role")
                        api_key_prefix = "session_token"
                        user_name = "Embedded Session User"
                        plan_name = "Enterprise Plan" if permissions_role == "Admin" else "Standard Plan"
                    else:
                        return JSONResponse(
                            status_code=401,
                            content={"detail": "Unauthorized. Embed session token has expired or is invalid."},
                        )
                else:
                    # Regular API Key lookup
                    import hashlib
                    key_hash = hashlib.sha256(raw_key.strip().encode()).hexdigest()
                    
                    try:
                        cache_key = f"apikey:hash:{key_hash}"
                        cached_key_info = cache_service.get(cache_key)
                        
                        if cached_key_info:
                            if cached_key_info.get("status") == "active":
                                workspace_name = cached_key_info.get("workspace")
                                permissions_role = cached_key_info.get("role")
                                api_key_prefix = cached_key_info.get("prefix")
                                user_name = cached_key_info.get("name")
                                plan_name = cached_key_info.get("plan")
                            else:
                                return JSONResponse(
                                    status_code=401,
                                    content={"detail": "Unauthorized. Invalid or revoked API Key."},
                                )
                        else:
                            data = load_admin_data()
                            matched_key = None
                            for k in data.get("keys", []):
                                if k.get("hashed_key") == key_hash and k.get("status") == "active":
                                    matched_key = k
                                    break
                            if matched_key:
                                workspace_name = matched_key.get("workspace", "Default Workspace")
                                permissions_role = matched_key.get("role", "Developer")
                                api_key_prefix = matched_key.get("prefix", "uni_live...")
                                user_name = matched_key.get("name", "Operator")
                                plan_name = "Enterprise Plan" if permissions_role == "Admin" else "Standard Plan"
                                
                                permissions_list = ["read"]
                                if permissions_role in ["Admin", "Developer"]:
                                    permissions_list.extend(["write", "delete"])
                                if permissions_role == "Admin":
                                    permissions_list.append("admin")
                                    
                                admin_settings = data.get("settings", {})
                                key_limit = admin_settings.get("rate_limit_api_key", 100)
                                
                                key_info = {
                                    "status": "active",
                                    "hash": key_hash,
                                    "workspace": workspace_name,
                                    "workspace_id": "ws_" + workspace_name.lower().replace(" ", "_"),
                                    "role": permissions_role,
                                    "prefix": api_key_prefix,
                                    "name": user_name,
                                    "plan": plan_name,
                                    "permissions": permissions_list,
                                    "rate_limit_bucket": key_limit
                                }
                                cache_service.set(cache_key, key_info, expire_seconds=600)
                            else:
                                cache_service.set(cache_key, {"status": "revoked"}, expire_seconds=300)
                                append_admin_log("auth", "WARNING", f"[{correlation_id}] Access Denied: Invalid API Key supplied to '{request.url.path}'.")
                                return JSONResponse(
                                    status_code=401,
                                    content={"detail": "Unauthorized. Invalid or revoked API Key."},
                                )
                    except Exception as e:
                        print(f"Failed to lookup API key: {e}")
            
            # 2. Layered Rate Limiter: Per-IP or Per-API-Key (Point 12)
            try:
                admin_settings = load_admin_data()["settings"]
                ip_limit = admin_settings.get("rate_limit_ip", 30)
                key_limit = admin_settings.get("rate_limit_api_key", 100)
            except Exception:
                ip_limit = 30
                key_limit = 100
                
            client_ip = request.client.host or "127.0.0.1"
            
            # Layered Rate Limit Enforcement
            if api_key_header and api_key_prefix != "Unauthenticated":
                key_cache_limit_key = f"apikey:requests:minute:{api_key_prefix}"
                current_requests = cache_service.incr_rate_limit(key_cache_limit_key, window_seconds=60)
                if current_requests > key_limit:
                    append_admin_log("ratelimit", "WARNING", f"[{correlation_id}] Rate limit 429 triggered for API Key '{api_key_prefix}' (Limit: {key_limit} req/min). User: '{user_name}'")
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "Too Many Requests. Rate limit exceeded. Retry later."},
                        headers={"Retry-After": "18", "X-Correlation-ID": correlation_id}
                    )
            else:
                ip_cache_limit_key = f"ip:requests:minute:{client_ip}"
                current_requests = cache_service.incr_rate_limit(ip_cache_limit_key, window_seconds=60)
                is_loopback = client_ip in ["127.0.0.1", "::1", "localhost"]
                if current_requests > ip_limit and not is_loopback:
                    append_admin_log("ratelimit", "WARNING", f"[{correlation_id}] Rate limit 429 triggered for IP '{client_ip}' (Limit: {ip_limit} req/min).")
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "Too Many Requests. IP rate limit exceeded. Retry later."},
                        headers={"Retry-After": "18", "X-Correlation-ID": correlation_id}
                    )
                
            if request.method in ["POST", "DELETE"]:
                try:
                    admin_settings = load_admin_data().get("settings", {})
                    audit_enabled = admin_settings.get("feature_flags_audit", True)
                except Exception:
                    audit_enabled = True
                if audit_enabled:
                    append_admin_log("audit", "INFO", f"[{correlation_id}] Audit: Request {request.method} {request.url.path} from User '{user_name}' ({permissions_role}) in workspace '{workspace_name}'.")


    response = await call_next(request)
    # Inject Correlation ID into Response Headers for Distributed Tracing (Point 10)
    response.headers["X-Correlation-ID"] = correlation_id
    return response

from .routers import documents, mappings, automation, admin, orchestrator

# Route registrations
app.include_router(documents.router, prefix=settings.API_V1_STR)
app.include_router(mappings.router, prefix=settings.API_V1_STR)
app.include_router(automation.router, prefix=settings.API_V1_STR)
app.include_router(admin.router, prefix=settings.API_V1_STR)
app.include_router(orchestrator.router, prefix=settings.API_V1_STR)

# Serve uploaded documents & Playwright screenshots
# Create sub-folders if missing
os.makedirs(os.path.join(settings.UPLOAD_DIR, "screenshots"), exist_ok=True)
app.mount("/static", StaticFiles(directory=settings.UPLOAD_DIR), name="static")

# Serve React frontend static files
from fastapi.responses import FileResponse
from fastapi import HTTPException

static_dist_path = os.path.abspath("static_dist")
if os.path.exists(static_dist_path):
    # Mount assets folder
    assets_path = os.path.join(static_dist_path, "assets")
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")

    @app.get("/{catchall:path}")
    def serve_spa(catchall: str):
        # Allow FastAPI router to handle API and uploads static
        if catchall.startswith(settings.API_V1_STR[1:]) or catchall.startswith("static"):
            raise HTTPException(status_code=404)
            
        # Check if the requested file exists in static_dist (e.g. favicon.ico, logo.png)
        target_file = os.path.join(static_dist_path, catchall)
        if os.path.exists(target_file) and os.path.isfile(target_file):
            return FileResponse(target_file)
            
        # Fallback to index.html for virtual React browser routes
        index_file = os.path.join(static_dist_path, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="React build index.html not found.")
else:
    @app.get("/")
    def read_root():
        return {
            "status": "online",
            "service": settings.PROJECT_NAME,
            "ollama_url": settings.OLLAMA_BASE_URL,
            "slm_model": settings.OLLAMA_MODEL
        }
