# BIAT Governance UI - Project Analysis

**Project Name:** biat-governance-ui  
**Framework:** Angular 16.2.0  
**Status:** Active Development  
**Purpose:** API Governance Dashboard with AI-powered analysis and HITL (Human-In-The-Loop) review system

---

## 1. Project Overview

### Mission
BIAT (Governance) is an Angular-based dashboard for managing API specifications with:
- **Spectral audit automation** (API quality scanning)
- **AI-powered semantic analysis** (using multiple LLM models)
- **Vector database integration** (Qdrant) for duplicate detection
- **Human-In-The-Loop (HITL)** approval/rejection workflows
- **Role-based access control** (Keycloak SSO)
- **Real-time WebSocket notifications**

### Tech Stack
| Component | Technology | Version |
|-----------|-----------|---------|
| **Framework** | Angular | 16.2.0 |
| **Build Tool** | Angular CLI | 16.2.16 |
| **Language** | TypeScript | 5.1.3 |
| **Auth** | Keycloak (Angular) | 16.1.0 / JS 24.0.5 |
| **HTTP** | HttpClientModule | Built-in |
| **Testing** | Karma/Jasmine | 6.4.0 / 4.6.0 |
| **Backend** | (External) | `localhost:8000` |
| **WebSocket Server** | (External) | `localhost:8765` |
| **Keycloak Server** | (External) | `localhost:8080` |

---

## 2. Architecture Overview

### Directory Structure
```
src/app/
├── core/                          # Business logic & services
│   ├── models/
│   │   └── audit-result.model.ts  # Data models (AuditResult, SpectralIssue)
│   └── services/
│       ├── api-governance.service.ts   # HTTP API client
│       └── agent.service.ts            # State management (RxJS subjects)
├── keycloak/                      # Authentication & Authorization
│   ├── auth.service.ts            # User profile & token management
│   ├── keycloak.config.ts         # SSO configuration
│   ├── keycloak.interceptor.ts    # HTTP token injection
│   └── role.guard.ts              # Route protection & role-based redirects
├── components/                    # Reusable UI components
│   ├── navbar/                    # Top navigation (user info, logout)
│   ├── sidebar/                   # Main navigation menu
│   └── ai-agent/                  # Conversational AI sidebar (WebSocket)
├── pages/                         # Full-page components (routed)
│   ├── api-import/                # [Home] Import & audit APIs
│   ├── api-inventory/             # [Owner] Managed API list
│   ├── ai-semantic-analysis/      # [Owner] Semantic search (stub)
│   └── admin/                     # [Owner] Dashboard, HITL review, RL
└── app-routing.module.ts          # Route definitions & role guards
```

### Component Hierarchy
```
<app-root>
  ├── <app-sidebar>
  ├── <app-navbar>              (authenticated user info)
  ├── <router-outlet>           (4 main pages)
  │   ├── <app-api-import>      (/) — public
  │   ├── <app-api-inventory>   (/inventory) — owner only
  │   ├── <app-ai-semantic>     (/ai-semantic) — owner only
  │   └── <app-admin>           (/admin) — owner only (HITL, RL)
  └── <app-ai-agent>            (floating chat sidebar)
```

---

## 3. Authentication & Authorization

### Keycloak Integration

**Configuration** ([keycloak.config.ts](src/app/keycloak/keycloak.config.ts)):
```typescript
- Realm: BIAT_IT
- Client ID: biat-ui
- URL: http://localhost:8080
- Flow: check-sso (silent auth check)
- SSO Silent Redirect: /assets/silent-check-sso.html
```

### User Roles & Permissions

**Roles** (from Keycloak):
- **owner** — Full access: view, approve, reject, feedback, manage RL
- **user** — Limited access: view, submit

**Access Matrix**:
| Page | Route | User | Owner | Notes |
|------|-------|------|-------|-------|
| API Import | `/` | ✅ | ✅ | Default home page |
| Inventory | `/inventory` | ❌ | ✅ | API list management |
| AI Semantic | `/ai-semantic` | ❌ | ✅ | Semantic search (stub) |
| Admin Dashboard | `/admin` | ❌ | ✅ | HITL & RL hub |

### Implementation
- **RoleGuard** ([role.guard.ts](src/app/keycloak/role.guard.ts)): Route-level protection + auto-redirect
  - Owner login → redirects to `/admin`
  - User accessing `/admin` → redirects to `/`
- **AuthService** ([auth.service.ts](src/app/keycloak/auth.service.ts)): User profile caching
- **KeycloakInterceptor**: Injects JWT into all HTTP requests

---

## 4. Core Services

### API Governance Service
**File**: [src/app/core/services/api-governance.service.ts](src/app/core/services/api-governance.service.ts)  
**Base URL**: `http://localhost:8000`

#### Endpoints

**Import & Audit**:
- `POST /import/url` — Import API from URL
- `POST /import/file` — Upload OpenAPI/YAML file
- `GET /results` — Fetch all audit results
- `GET /results/{taskId}` — Fetch single audit result

**HITL (Human-In-The-Loop)**:
- `POST /hitl/review` — Approve/reject API review
  - Params: `api_id`, `action` ('approve'|'reject'), `user_id`, `comment?`
- `POST /hitl/feedback/score` — Adjust expert scores
  - Params: `api_id`, `expert` ('design'|'security'|'chairman'), `score_delta` (±1), `user_id`, `comment?`
- `POST /hitl/correction` — Submit corrected YAML
  - Params: `api_id`, `corrected_yaml`, `user_id`, `comment?`
- `GET /hitl/weights` — Fetch expert weight calibration
- `GET /hitl/feedback/history/{expert}?window_days=30` — Expert feedback trend
- `GET /hitl/simulate/weights?design=X&security=Y&chairman=Z` — Simulate scoring with custom weights

**Qdrant (Vector DB)**:
- `GET /qdrant/info` — Collection stats
- `DELETE /qdrant/reset` — Clear all vectors
- `DELETE /qdrant/api/{apiName}` — Remove API vectors
- `POST /qdrant/search` — Semantic similarity search
  - Params: `spec_text`, `limit`
- `POST /qdrant/check-duplicate` — Duplicate detection
- `GET /qdrant/audit-logs?limit=50` — Vector operation history
- `GET /qdrant/audit-stats` — Aggregate stats

### Agent Service (State Management)
**File**: [src/app/core/services/agent.service.ts](src/app/core/services/agent.service.ts)

Lightweight RxJS-based state management:
```typescript
- audit$ (BehaviorSubject)   → Current audit being analyzed
- stats$ (BehaviorSubject)   → Dashboard statistics
- weights$ (BehaviorSubject) → Expert weights calibration
```

**Usage**: Shared state between admin dashboard and AI agent component.

---

## 5. Data Models

### AuditResult Model
**File**: [src/app/core/models/audit-result.model.ts](src/app/core/models/audit-result.model.ts)

```typescript
interface SpectralIssue {
  code:     string          // Issue code (e.g., "api-standards-rules")
  message:  string          // Human-readable message
  severity: number          // 0=info, 1=warning, 2=error
  path:     string[]        // JSON path to issue in spec
  source?:  string          // Source file/reference
  range: {
    start: { line: number; character: number }
    end:   { line: number; character: number }
  }
}

interface AuditResult {
  id:              number                    // Database ID
  spec_id:         string                    // API identifier
  source:          string                    // Import source (URL/file)
  status:          string                    // 'PENDING'|'PASSED'|'FAILED'|'HUMAN_APPROVED'|'HUMAN_REJECTED'
  score:           number                    // Composite AI score [0-100]
  issues_count:    number                    // Total violations found
  issues_detail:   SpectralIssue[]|string|null  // Detailed violations
  timestamp:       string                    // ISO 8601 audit time
}
```

---

## 6. Pages & Components

### 6.1. API Import Page (/)
**File**: [src/app/pages/api-import/api-import.component.ts](src/app/pages/api-import/api-import.component.ts)

**Purpose**: Primary data entry point for API specs  
**Access**: All users (public)

**Features**:
- **Dual Import**:
  - URL-based: Paste OpenAPI spec URL → fetch & audit
  - File upload: Upload OpenAPI YAML/JSON file → audit
  
- **Real-time Spectral Audit** (violations):
  - Errors, Warnings, Security Alerts counters
  - Rule violations: OAI, MS (Microsoft), BIAT, OWASP
  
- **AI Analysis** (LLM):
  - Model selection: `mistral:7b`, `gemma3:4b`, `llama3.2:3b` (or Groq)
  - AI suggestion + quality score
  - Full response view (expandable)
  
- **Fix Wizard**:
  - AI-generated fixes for detected issues
  - Multi-select fixes
  - Generate corrected YAML
  - Submit correction via HITL endpoint
  
- **Qdrant Pipeline**:
  - Real-time duplicate/similarity detection
  - Levels: `BLOCKED`, `WARNING`, `RAG_ONLY`, `NONE`
  - Similar API + similarity score
  
- **IA Evaluation**:
  - Model used tracking (design/security/chairman roles)
  - Audit metadata storage

### 6.2. Admin Dashboard (/admin)
**File**: [src/app/pages/admin/admin.component.ts](src/app/pages/admin/admin.component.ts)

**Purpose**: Centralized HITL review, RL (Reinforcement Learning) calibration  
**Access**: Owner role only

**Features**:

1. **HITL Review Tab**:
   - List all audits with status filter & search
   - Select audit → view details (YAML corrected/original, issues)
   - Actions: Approve, Reject, Suggest Correction
   - Comments for audit trail
   
2. **Dashboard Tab** (Real-time):
   - Statistics: Total, Passed, Failed, Approved, Rejected, Avg Score
   - WebSocket-driven live events
   - Live audit stream & historical archive
   
3. **RL (Reinforcement Learning) Tab**:
   - Expert weights display: `design`, `security`, `chairman`
   - Weight simulation (what-if analysis)
   - Feedback history per expert (30-day window)
   - Auto-update when new feedback recorded
   
4. **WebSocket Connection**:
   - Connects to `ws://localhost:8765`
   - Sends: `{ role, user_id, token (JWT) }`
   - Receives: Real-time audit events (parsed via `EvTypeLabelPipe`)
   
5. **Custom Pipes** ([admin.pipes.ts](src/app/pages/admin/admin.pipes.ts)):
   - `evTypeLabel` → Map event type to readable label
   - `findById` → Array filter utility
   - `anyPending` → Check if audits pending review
   - `countPending` → Count failed audits awaiting review

### 6.3. API Inventory (/inventory)
**File**: [src/app/pages/api-inventory/api-inventory.component.ts](src/app/pages/api-inventory/api-inventory.component.ts)

**Purpose**: Browse managed APIs with filtering  
**Access**: Owner role only

**Features**:
- List all APIs from `/results` endpoint
- Search by `spec_id`
- Filter by status (`PENDING`, `PASSED`, `FAILED`, etc.)
- Select API → fetch full details via `/results/{id}`
- Approve button → calls `/hitl/review` endpoint
- Nested component: `qdrant-panel` (vector DB stats display)

### 6.4. AI Semantic Analysis (/ai-semantic)
**File**: [src/app/pages/ai-semantic-analysis/ai-semantic-analysis.component.ts](src/app/pages/ai-semantic-analysis/ai-semantic-analysis.component.ts)

**Purpose**: Future semantic search / similarity analysis (stub)  
**Access**: Owner role only  
**Status**: Currently a placeholder component

### 6.5. Navbar Component
**File**: [src/app/components/navbar/navbar.component.ts](src/app/components/navbar/navbar.component.ts)

**Purpose**: Top navigation bar  
**Features**:
- Display authenticated user info (via AuthService)
- Logout button

### 6.6. Sidebar Component
**File**: [src/app/components/sidebar/sidebar.component.ts](src/app/components/sidebar/sidebar.component.ts)

**Purpose**: Left navigation menu  
**Features**:
- Role-based menu display (owner gets extra links)
- Navigation to: Import, Inventory, AI Semantic, Admin

### 6.7. AI Agent Component (Conversational)
**File**: [src/app/components/ai-agent/ai-agent.component.ts](src/app/components/ai-agent/ai-agent.component.ts)

**Purpose**: Floating chat interface for AI-powered guidance  
**Features**:
- Message history (user ↔ assistant)
- Dynamic message types: text, actions, fixes, comparison, reports, alerts
- Suggestions based on audit state
- WebSocket communication with backend AI service
- Integrates with `AgentService` for audit/stats/weights sync

---

## 7. Routing Configuration

**File**: [src/app/app-routing.module.ts](src/app/app-routing.module.ts)

```
Route                Component              Guard        Roles         Auto-Redirect
──────────────────────────────────────────────────────────────────────────────────
/                    ApiImportComponent     RoleGuard    any           owner → /admin
/inventory           ApiInventoryComponent  RoleGuard    ['owner']     user → /
/ai-semantic         AiSemanticComponent    RoleGuard    ['owner']     user → /
/admin               AdminComponent         RoleGuard    ['owner']     user → /
**                   (redirect)             -            -             → /
```

**RoleGuard Logic**:
1. Check if authenticated (via Keycloak)
2. If not → Keycloak login redirect
3. Parse required roles from route.data
4. If owner + path='' → Redirect to /admin
5. If not owner + path='admin' → Redirect to /
6. Otherwise allow access

---

## 8. Deployment Configuration

### Build Configuration
**File**: [angular.json](angular.json)

- **Output Path**: `dist/biat-governance-ui`
- **Main**: `src/main.ts`
- **Index**: `src/index.html`
- **Styles**: `src/styles.css`
- **Assets**: `src/assets/`
- **Production Budgets**:
  - Initial: 600kb max, 1mb error
  - Any component style: 60kb max, 100kb error

### Package Scripts
```bash
npm start          # ng serve (dev server on :4200)
npm build          # ng build (production build)
npm watch          # ng build --watch (development watch)
npm test           # ng test (Karma/Jasmine tests)
```

### Environment Configuration
- **Angular Version**: 16.2.0
- **Node Modules**: Bootstrap dependencies auto-fetched
- **TypeScript Config**: `tsconfig.app.json` (Angular + strict mode)
- **Testing Framework**: Karma + Jasmine

---

## 9. Key Features & Workflows

### 9.1. API Import & Audit Workflow
1. User uploads OpenAPI spec (URL or file)
2. Backend runs **Spectral audit** → detects rule violations
3. **AI analysis** (LLM ensemble) → generates score + suggestions
4. **Qdrant check** → detect duplicates/similarities
5. Results stored → status = `PENDING`
6. Owner reviews in Admin dashboard → `APPROVED` or `REJECTED`

### 9.2. HITL (Human-In-The-Loop) Workflow
1. Owner views pending audits in `/admin`
2. Can **approve** → sets status to `HUMAN_APPROVED`
3. Can **reject** → sets status to `HUMAN_REJECTED`
4. Can submit **corrected YAML** → stores correction with comment
5. Can provide **score feedback** → adjusts expert weights (RL training)

### 9.3. Reinforcement Learning (RL) Calibration
1. Expert weights: `design`, `security`, `chairman` (impact on final score)
2. Owner reviews feedback history → sees if experts' scores were over/under-calibrated
3. Can simulate new weights → what-if analysis on past audits
4. Backend trains new ensemble model weights based on human corrections

### 9.4. Duplicate Detection (Qdrant)
- On import, API spec is vectorized → stored in Qdrant collection
- Check-duplicate endpoint searches for similar specs
- Levels: **BLOCKED** (duplicate found), **WARNING** (similar), **RAG_ONLY** (light search), **NONE** (unique)

---

## 10. External Dependencies & Services

| Service | URL | Purpose |
|---------|-----|---------|
| **Backend API** | `http://localhost:8000` | Audit, HITL, Qdrant endpoints |
| **WebSocket** | `ws://localhost:8765` | Real-time admin dashboard events |
| **Keycloak SSO** | `http://localhost:8080` | Authentication & authorization |
| **Qdrant Vector DB** | (managed by backend) | Semantic similarity search |

---

## 11. Testing Strategy

### Test Files Present
- [src/app/components/navbar/navbar.component.spec.ts](src/app/components/navbar/navbar.component.spec.ts)
- [src/app/components/sidebar/sidebar.component.spec.ts](src/app/components/sidebar/sidebar.component.spec.ts)
- [src/app/pages/api-import/api-import.component.spec.ts](src/app/pages/api-import/api-import.component.spec.ts)
- [src/app/pages/api-inventory/api-inventory.component.spec.ts](src/app/pages/api-inventory/api-inventory.component.spec.ts)
- [src/app/pages/ai-semantic-analysis/ai-semantic-analysis.component.spec.ts](src/app/pages/ai-semantic-analysis/ai-semantic-analysis.component.spec.ts)
- [src/app/core/services/api-governance.service.spec.ts](src/app/core/services/api-governance.service.spec.ts)

**Test Runner**: Karma + Jasmine  
**Command**: `npm test`

---

## 12. Project Status & Observations

### ✅ Completed
- Keycloak integration (SSO + role guards)
- API import & audit workflow
- Admin HITL review interface
- WebSocket real-time dashboard
- Qdrant vector search integration
- Admin role-based access control
- AI agent chat component (basic)
- Custom Angular pipes for data transformation

### 🚧 In Progress / Stubs
- **AI Semantic Analysis** page (component exists but empty)
- **Qdrant Panel** sub-component (likely display stats only)
- Full AI agent backend integration (chat functionality)
- E2E test suite (not yet added)

### ⚠️ Potential Improvements
1. **Error Handling**: Minimal error messaging in components
2. **Loading States**: Basic loading flags but no skeleton loaders
3. **Caching**: No HTTP response caching strategy
4. **Accessibility**: No ARIA labels or keyboard navigation
5. **Mobile Responsiveness**: CSS appears desktop-focused
6. **Type Safety**: Some `any` types used (esp. in admin component)
7. **State Management**: RxJS subjects instead of NgRx/Akita
8. **Documentation**: Limited JSDoc comments in services

---

## 13. Key Files Summary

| File | Purpose | Key Exports |
|------|---------|------------|
| **app.module.ts** | Root module config | AppModule |
| **app-routing.module.ts** | Route definitions | AppRoutingModule, routes[] |
| **api-governance.service.ts** | API client | ApiGovernanceService |
| **agent.service.ts** | State mgmt | AgentService |
| **auth.service.ts** | User management | AuthService, BiatUser |
| **role.guard.ts** | Route protection | RoleGuard |
| **audit-result.model.ts** | Data types | AuditResult, SpectralIssue |
| **admin.pipes.ts** | Custom pipes | EvTypeLabelPipe, FindByIdPipe, etc. |
| **keycloak.config.ts** | Auth config | keycloakConfig, BiatRole, PERMISSIONS |

---

## Summary

**BIAT Governance UI** is a sophisticated Angular 16 dashboard for API governance with:
- **SSO Authentication** via Keycloak
- **Multi-page SPA** with role-based access (user/owner)
- **Real-time Audit Workflow** (import → analyze → review → approve)
- **AI-Powered Analysis** (ensemble LLM models for scoring)
- **Human-In-The-Loop** feedback collection for model improvement (RL)
- **Vector DB Integration** (Qdrant) for semantic duplicate detection
- **WebSocket Live Events** for real-time admin dashboard updates

The application communicates with a Python backend API and supports complex workflows for evaluating and managing API specifications with human expert feedback.

---

**Generated**: May 17, 2026  
**Angular Version**: 16.2.0  
**TypeScript Version**: 5.1.3
