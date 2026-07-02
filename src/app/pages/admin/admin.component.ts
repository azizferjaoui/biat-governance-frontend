import { AgentService } from '../../core/services/agent.service';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient }  from '@angular/common/http';
import { AuthService, BiatUser } from '../../keycloak/auth.service';

// Types internes (compatibilité template existant)
export type AdminRole = 'viewer' | 'reviewer' | 'admin' | 'superadmin';
export interface AdminUser { user_id: string; role: AdminRole; name: string; }

@Component({
  selector    : 'app-admin',
  templateUrl : './admin.component.html',
  styleUrls   : ['./admin.component.css']
})
export class AdminComponent implements OnInit, OnDestroy {

  // Auth Keycloak
  kcUser: BiatUser | null = null;

  // Compat template (role picker désactivé en prod Keycloak)
  currentUser : AdminUser = { user_id:'', role:'viewer', name:'' };
  availableUsers: AdminUser[] = [];
  showRolePicker = false;

  // WebSocket
  private ws: WebSocket | null = null;
  wsStatus: 'connecting' | 'connected' | 'disconnected' = 'disconnected';
  WS_URL  = 'ws://localhost:8765';
  API_URL = 'http://localhost:8000';

  // Données
  audits: any[]   = [];
  loadingAudits   = false;
  stats: any = { total:0, passed:0, failed:0, approved:0, rejected:0, avg_score:0 };
  weights: any    = {};
  liveEvents: any[] = [];
  selectedAudit: any = null;
  selectedTab  : 'dashboard'|'live'|'history'|'import'|'llm'|'audits'|string = 'dashboard';
  auditView: 'all' | 'live' | 'history' = 'all';
  liveAuditIds = new Set<number>();

  actionLoading: number | null = null;
  yamlView: string = 'corrected';
  actionComment  = '';
  feedbackComment= '';
  filterStatus   = '';
  searchQuery    = '';

  pipelineActive  : string = 'testing';
  testingLogs     : {ts:string, tag:string, msg:string, cls:string}[] = [];
  showRing        : boolean = false;
  ringPct         : number  = 0;
  ringColor       : string  = '#22c55e';
  ringStatus      : string  = '';
  ringSub         : string  = '';
  ringMeta        : string  = '';
  _wso2DuplicateAlert: any = null;

  // LLM Arena
  llmModels     : any[] = [];
  llmLogs       : any[] = [];
  llmLoading    : boolean = false;
  llmActiveModel: string = 'gpt-oss-120b';
  showLlmArena  : boolean = false;

  // Pipeline progression temps réel
  pipelineProgress: {[key:string]: 'idle'|'run'|'done'|'fail'} = {
    import: 'idle', spectral: 'idle', qdrant: 'idle',
    moe: 'idle', testing: 'idle', hitl: 'idle'
  };
  pipelineCounts: {[key:string]: number} = {
    import: 0, spectral: 0, qdrant: 0, moe: 0, testing: 0, hitl: 0
  };
  pipelineSubLabels: {[key:string]: string} = {
    import: 'specs', spectral: 'validations', qdrant: 'vecteurs',
    moe: 'experts', testing: 'Dredd + Schema', hitl: 'validations'
  };

  constructor(
    private http        : HttpClient,
    private cdr         : ChangeDetectorRef,
    private auth        : AuthService,
    private agentService: AgentService,
  ) {}

  async ngOnInit(): Promise<void> {
    // Charger l'utilisateur depuis Keycloak
    this.kcUser = await this.auth.loadUser();

    // Mapper vers AdminUser (compatibilité template)
    this.currentUser = {
      user_id: this.kcUser.id,
      role   : this.kcUser.role === 'owner' ? 'superadmin' : 'viewer',
      name   : this.kcUser.username,
    };
    this.availableUsers = [this.currentUser];

    this.loadAllAuditsFromDB();
    this.connectWS();
  }

  ngOnDestroy(): void { this.ws?.close(); }

  // ── Permissions depuis Keycloak ──────────────────────────────
  canApprove(): boolean { return this.auth.isOwner(); }
  canReview():  boolean { return this.auth.isOwner(); }

  // ── WebSocket avec token Keycloak ────────────────────────────
  async connectWS(): Promise<void> {
    this.wsStatus = 'connecting';
    const token   = await this.auth.getToken();

    this.ws = new WebSocket(this.WS_URL);
    this.ws.onopen = () => {
      this.wsStatus = 'connected';
      this.ws!.send(JSON.stringify({
        role   : this.kcUser?.role ?? 'user',
        user_id: this.kcUser?.id  ?? 'unknown',
        token,                        // JWT Keycloak réel
      }));
      this.cdr.detectChanges();
    };
    this.ws.onmessage = (evt) => {
      try { this.handleWsEvent(JSON.parse(evt.data)); } catch(e) {}
    };
    this.ws.onclose = () => {
      this.wsStatus = 'disconnected';
      this.cdr.detectChanges();
      setTimeout(() => this.connectWS(), 3000);
    };
    this.ws.onerror = () => { this.wsStatus = 'disconnected'; this.cdr.detectChanges(); };
  }

  // ── Chargement DB ────────────────────────────────────────────
  loadAllAuditsFromDB(): void {
    this.loadingAudits = true;
    this.http.get<any[]>(`${this.API_URL}/results`).subscribe({
      next: (data) => {
        const normalized = data.map(a => ({
          id          : a.id,
          spec_id     : a.spec_id,
          source      : a.source,
          status      : a.status,
          score       : a.score,
          issues_count: a.issues_count,
          timestamp   : a.timestamp,
          jira_key        : a.jira_key ?? null,
          ai              : a.ai_analysis ? this.extractAiSummary(a.ai_analysis) : null,
          ai_analysis     : a.ai_analysis ?? null,
          qdrant          : a.ai_analysis?.qdrant  ?? null,
          ia_eval         : a.ai_analysis?.ia_eval ?? null,
          testing_pipeline: a.ai_analysis?.testing_pipeline ?? null,
          wso2_api_id     : a.ai_analysis?.wso2_api_id ?? null,
          wso2_url        : a.ai_analysis?.wso2_url ?? null,
          wso2_published  : a.status === 'PUBLISHED' || a.ai_analysis?.wso2_published || !!a.ai_analysis?.wso2_api_id,
          _origin         : 'history'
        }));
        const liveOnly = this.audits.filter((a:any) => a._origin === 'live');
        const liveIds  = new Set(liveOnly.map((a:any) => a.id));
        const histOnly = normalized.filter((a:any) => !liveIds.has(a.id));
        this.audits    = [...liveOnly, ...histOnly];
        this.audits.sort((a:any, b:any) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        this.recalcStats();
        this.loadingAudits = false;
        this.cdr.detectChanges();
      },
      error: () => { this.loadingAudits = false; }
    });
  }

  private extractAiSummary(ai: any): any {
    if (!ai) { return null; }
    return {
      ai_score         : ai.ai_score,
      rl_final_score   : ai.rl_final_score,
      similar_api      : ai.qdrant?.similar_api,
      qdrant_level     : ai.qdrant?.level,
      testing_pipeline : ai.testing_pipeline ?? null,
      tests_status     : ai.tests_status ?? null,
      corrected_yaml   : ai.corrected_yaml ?? null,
      fixes            : ai.fixes ?? [],
      ia_eval          : ai.ia_eval ?? null,
      chairman_response: ai.chairman_response ?? null,
    };
  }
  // ── Handler WebSocket ────────────────────────────────────────
  private setPipelineStage(stage: string, state: 'run'|'done'|'fail', count?: number): void {
    const order = ['import','spectral','qdrant','moe','testing','hitl'];
    const idx   = order.indexOf(stage);

    // Marquer les stages précédents comme done avec animation séquentielle
    for (let i = 0; i < idx; i++) {
      if (this.pipelineProgress[order[i]] === 'run' || this.pipelineProgress[order[i]] === 'idle') {
        this.pipelineProgress[order[i]] = 'done';
      }
    }

    // Marquer stage actuel comme run d'abord puis done après délai
    if (state === 'done') {
      this.pipelineProgress[stage] = 'run';
      if (count !== undefined) this.pipelineCounts[stage] = count;
      this.cdr.detectChanges();
      setTimeout(() => {
        this.pipelineProgress[stage] = 'done';
        this.cdr.detectChanges();
      }, 600);
    } else {
      this.pipelineProgress[stage] = state;
      if (count !== undefined) this.pipelineCounts[stage] = count;
    }
  }

  handleWsEvent(data: any): void {
    // Enrichir les logs testing
    if (data.type === 'testing') {
      const tp = data.testing_pipeline;
      if (tp) {
        this.showRing   = true;
        this.ringPct    = tp.summary?.pass_rate ?? 0;
        this.ringColor  = tp.status === 'TESTS_PASSED' ? '#22c55e' : '#f43f5e';
        this.ringStatus = tp.status;
        this.ringSub    = `${tp.summary?.total_passed ?? 0}/${tp.summary?.total_tests ?? 0} tests passés`;
        this.ringMeta   = `Dredd ${tp.dredd?.passed_count ?? 0}/${tp.dredd?.total ?? 0} · Schema ${tp.schemathesis?.passed_count ?? 0}/${tp.schemathesis?.total ?? 0}`;
        this.addTestingLog('Testing', `${tp.status} · Pass rate: ${this.ringPct}%`,
                           tp.status === 'TESTS_PASSED' ? 'tag-pass' : 'tag-fail');
      }
    }
    if (data.type === 'moe') {
      this.addTestingLog('MoE', `Score RL: ${data.rl_score ?? '?'}/100`, 'tag-info');
      this.showRing = false;
    }
    if (data.type === 'score_update' || data.type === 'audit_update') {
      const score = data.score ?? data.score_value;
      if (score !== undefined) {
        this.addTestingLog('Spectral', `Score: ${score}/100 ${data.status ?? ''}`, 'tag-warn');
      } else {
        this.addTestingLog('Import', `Spec reçue: ${data.spec_id ?? '?'}`, 'tag-info');
      }
    }
    if (data.type === 'qdrant_result') {
      const q = data.qdrant || {};
      this.addTestingLog('Qdrant', `${q.level ?? 'NONE'} · ${data.spec_id ?? '?'}`, 'tag-info');
    }
    if (data.type === 'moe_result') {
      this.addTestingLog('MoE', `Score IA: ${data.ai_score ?? '?'} · RL: ${data.rl_score ?? '?'}/100`, 'tag-pass');
      // Pré-sélectionner l'audit en cours pour voir les résultats en direct
      if (!this.selectedAudit) {
        const a = this.audits.find((a:any) => a.id === data.task_id);
        if (a) { this.selectedAudit = a; this.pipelineActive = 'testing'; }
      }
    }
    if (data.type === 'analysis_complete') {
      const tp = data.testing_pipeline ?? data.ai_analysis?.testing_pipeline;
        if (tp) {
          this.addTestingLog('Dredd', `🧪 ${tp.dredd?.passed ? 'PASSED' : 'FAILED'} · ${tp.dredd?.passed_count ?? 0}/${tp.dredd?.total ?? 0} endpoints · ${tp.dredd?.duration_ms ?? 0}ms`, tp.dredd?.passed ? 'tag-pass' : 'tag-fail');
          this.addTestingLog('Schema', `🔬 ${tp.schemathesis?.passed ? 'PASSED' : 'FAILED'} · ${tp.schemathesis?.passed_count ?? 0}/${tp.schemathesis?.total ?? 0} schemas · ${tp.schemathesis?.duration_ms ?? 0}ms`, tp.schemathesis?.passed ? 'tag-pass' : 'tag-warn');
          this.addTestingLog('Testing', `✅ ${tp.status} · Pass rate: ${tp.summary?.pass_rate ?? 0}%`, tp.status==='TESTS_PASSED' ? 'tag-pass' : 'tag-fail');
        }
        this.addTestingLog('Complet', `🏁 Score RL final: ${data.rl_score ?? '?'}/100 · Prêt pour HITL`, 'tag-pass');
      // Auto-sélectionner l'audit pour afficher les résultats testing
      const completedAudit = this.audits.find((a:any) => a.id === data.task_id);
      if (completedAudit) {
        this.selectedAudit = completedAudit;
        this.pipelineActive = 'testing';
      }
    }
    if (data.type === 'weights_update') {
      this.addTestingLog('RL', `Poids mis à jour suite au feedback`, 'tag-info');
    }
    if (data.type === 'feedback_recorded') {
      this.addTestingLog('HITL', `Feedback enregistré — ${data.action ?? '?'}`, 'tag-info');
    }
    switch(data.type) {
      case 'initial_state':
        if (data.stats)   { this.stats   = data.stats; }
        if (data.weights) { this.weights = data.weights; }
        if (data.audits)  { for (const a of data.audits) { this.upsertAudit(a,'history'); } }
        break;
      case 'audit_update':
        const na = this.mapAuditEvent(data); na._origin = 'live';
        this.liveAuditIds.add(data.task_id);
        this.upsertAudit(na, 'live');
        this.stats.total = this.audits.length;
        if (data.score != null) {
          // C'est un update avec score = résultat Spectral
          this.setPipelineStage('import', 'done', this.stats.total);
          const issCount = data.issues_count ?? data.issues?.length ?? 0;
          this.setPipelineStage('spectral', issCount > 0 ? 'done' : 'done', issCount);
          this.addLiveEvent({ icon:'🔍', color:'#f59e0b',
            text:`Spectral — ${data.spec_id} · Score: ${data.score}/100 · ${data.issues_count ?? 0} violations`, ...data });
          const sev0 = data.issues_detail?.filter((i:any)=>i.severity===0).length
                       ?? data.errors_count ?? 0;
          const sev1 = data.issues_detail?.filter((i:any)=>i.severity===1).length
                       ?? data.warnings_count ?? 0;
          const totalIssues = (data.issues_count ?? 0);
          this.addTestingLog('Spectral',
            `🔍 Score: ${data.score}/100 · ${sev0} erreurs · ${sev1} warnings · ${totalIssues} total · ${data.status}`,
            data.status==='PASSED'?'tag-pass':'tag-warn');
        } else {
          // Nouvelle spec
          this.pipelineProgress = { import:'run', spectral:'idle', qdrant:'idle', moe:'idle', testing:'idle', hitl:'idle' };
          this.pipelineCounts['import'] = this.stats.total;
          this.showRing = false;
          this.testingLogs = [];
          this.addLiveEvent({ icon:'📥', color:'#c042ff', text:`Import — ${data.spec_id}`, ...data });
          this.addTestingLog('Import', `📥 Spec reçue → ${data.spec_id} · ID #${data.task_id}`, 'tag-info');
        }
        break;
      case 'qdrant_result':
        const q2 = data.qdrant || {};
        this.updateAudit(data.task_id, { qdrant: q2, qdrant_level: q2.level ?? 'NONE' });
        this.setPipelineStage('qdrant', 'done', q2.rag_count ?? 1);
        this.setPipelineStage('spectral', 'done');
        const lc2 = q2.level==='BLOCKED'?'#f43f5e':q2.level==='WARNING'?'#f59e0b':'#8b949e';
        this.addLiveEvent({ icon: q2.level==='BLOCKED'?'🚫':q2.level==='WARNING'?'⚠️':'🧠',
          color: lc2,
          text:`Qdrant [${q2.level ?? 'NONE'}] — ${data.spec_id}`
               +(q2.similar_api?` → ${q2.similar_api} (${Math.round((q2.similarity??0)*100)}%)`:''),
          ...data });
        const ragMsg = q2.rag_count > 0 ? ` · RAG ×${q2.rag_count} injecté` : ' · Spec unique';
        const simMsg = q2.similar_api ? ` · similaire à ${q2.similar_api} (${Math.round((q2.similarity??0)*100)}%)` : '';
        this.addTestingLog('Qdrant', `🧠 ${q2.level ?? 'NONE'}${simMsg}${ragMsg}`, q2.level==='BLOCKED'?'tag-fail':q2.level==='WARNING'?'tag-warn':'tag-info');
        break;
      case 'moe_result':
        this.updateAudit(data.task_id, {
          ia_eval: data.ia_eval, ai_score: data.ai_score, score_rl: data.rl_score,
          ai: { ia_eval: data.ia_eval, ai_score: data.ai_score,
                rl_final_score: data.rl_score, model: data.model ?? 'gpt-oss-120b' }
        });
        const expertCount = data.ia_eval?.active_experts?.length ?? 3;
        this.setPipelineStage('moe', 'done', expertCount);
        this.setPipelineStage('testing', 'run');
        this.addLiveEvent({ icon:'🤖', color:'#3b82f6',
          text:`MoE — ${data.spec_id} · ${expertCount} experts · RL: ${data.rl_score}/100`, ...data });
        const experts = data.ia_eval?.active_experts ?? ['design','security','biat'];
        const latencies = data.ia_eval?.latency_ms ?? {};
        this.addTestingLog('MoE', `🤖 ${experts.length} experts → ${experts.join(' · ')}`, 'tag-info');
        this.addTestingLog('MoE', `📊 Score agrégé: ${data.ai_score}/100 · RL: ${data.rl_score}/100 · Modèle: ${data.model ?? 'gpt-oss-120b'}`, 'tag-pass');
        // Pré-sélectionner
        if (!this.selectedAudit || this.selectedAudit.id !== data.task_id) {
          const a = this.audits.find((x:any) => x.id === data.task_id);
          if (a) { this.selectedAudit = a; }
        }
        break;
      case 'analysis_complete':
        // Patch complet incluant ai_analysis avec testing_pipeline
        const aiPatch: any = {
          ai: {
            rl_final_score  : data.rl_score,
            ai_score        : data.ai_score,
            testing_pipeline: data.testing_pipeline ?? null,
            corrected_yaml  : data.corrected_yaml   ?? null,
            fixes           : data.fixes            ?? [],
            ia_eval         : data.ia_eval          ?? null,
            chairman_response: data.chairman_response ?? null,
            model           : data.model            ?? 'gpt-oss-120b',
          },
          ai_analysis: data.ai_analysis ?? {
            testing_pipeline: data.testing_pipeline ?? null,
            rl_final_score  : data.rl_score,
          },
          score_rl: data.rl_score,
        };
        this.updateAudit(data.task_id, aiPatch);
        this.setPipelineStage('testing', 'done', this.pipelineCounts['testing'] + 1);
        this.addLiveEvent({ icon:'✅', color:'#22c55e',
          text:`Analyse complète — ${data.spec_id} · Score RL: ${data.rl_score}/100`, ...data });
        const tp = data.testing_pipeline ?? data.ai_analysis?.testing_pipeline;
        if (tp) {
          this.addTestingLog('Dredd', `🧪 ${tp.dredd?.passed ? 'PASSED' : 'FAILED'} · ${tp.dredd?.passed_count ?? 0}/${tp.dredd?.total ?? 0} endpoints · ${tp.dredd?.duration_ms ?? 0}ms`, tp.dredd?.passed ? 'tag-pass' : 'tag-fail');
          this.addTestingLog('Schema', `🔬 ${tp.schemathesis?.passed ? 'PASSED' : 'FAILED'} · ${tp.schemathesis?.passed_count ?? 0}/${tp.schemathesis?.total ?? 0} schemas · ${tp.schemathesis?.duration_ms ?? 0}ms`, tp.schemathesis?.passed ? 'tag-pass' : 'tag-warn');
          this.addTestingLog('Testing', `✅ ${tp.status} · Pass rate: ${tp.summary?.pass_rate ?? 0}%`, tp.status==='TESTS_PASSED' ? 'tag-pass' : 'tag-fail');
        }
        this.addTestingLog('Complet', `🏁 Score RL final: ${data.rl_score ?? '?'}/100 · Prêt pour HITL`, 'tag-pass');
        // Auto-sélectionner et recharger depuis DB pour avoir ai_analysis complet
        const completedAudit = this.audits.find((a:any) => a.id === data.task_id);
        if (completedAudit) {
          this.selectedAudit = completedAudit;
          this.pipelineActive = 'testing';
          // Recharger depuis DB pour avoir les données complètes
          this.http.get<any>(`${this.API_URL}/results/${data.task_id}`).subscribe({
            next: (fresh) => {
              if (fresh.ai_analysis && typeof fresh.ai_analysis === 'string') {
                try { fresh.ai_analysis = JSON.parse(fresh.ai_analysis); } catch {}
              }
              const freshPatch = {
                ai          : fresh.ai_analysis,
                ai_analysis : fresh.ai_analysis,
                score       : fresh.score,
                status      : fresh.status,
                jira_key    : fresh.jira_key,
              };
              this.updateAudit(data.task_id, freshPatch);
              if (this.selectedAudit?.id === data.task_id) {
                this.selectedAudit = { ...this.selectedAudit, ...freshPatch };
              }
              this.cdr.detectChanges();
            }
          });
        }
        break;
      case 'hitl_action':
        this.updateAudit(data.task_id, { status: data.new_status });
        this.stats[data.action==='approve'?'approved':'rejected']++;
        this.recalcStats();
        this.setPipelineStage('hitl', 'done', this.stats.approved + this.stats.rejected);
        this.addLiveEvent({ icon:data.action==='approve'?'✅':'❌',
          color:data.action==='approve'?'#22c55e':'#f43f5e',
          text:`${data.action.toUpperCase()} #${data.task_id} par ${data.by_user}`, ...data });
        this.addTestingLog('HITL', `${data.action.toUpperCase()} par ${data.by_user}`,
                           data.action==='approve'?'tag-pass':'tag-fail');
        if (this.actionLoading === data.task_id) { this.actionLoading = null; }
        break;
      case 'feedback_recorded':
        this.addLiveEvent({ icon:'📊', color:'#00f2ff',
          text:`Feedback ${data.delta>0?'+1':'-1'} sur ${data.expert}`, ...data });
        if (data.new_weights) { this.weights = data.new_weights; }
        break;
      case 'weights_update':
        this.weights = data.weights;
        break;
    }
    this.cdr.detectChanges();
  }

  private mapAuditEvent(data: any): any {
    return {
      id           : data.task_id,
      spec_id      : data.spec_id,
      source       : data.source,
      status       : data.status,
      score        : data.score,
      issues_count : data.issues_count,
      issues_detail: data.issues_detail ?? [],
      errors_count : data.errors_count  ?? 0,
      warnings_count: data.warnings_count ?? 0,
      timestamp    : data.timestamp,
      jira_key     : data.jira_key,
      ai           : data.ai,
      ai_analysis  : data.ai_analysis,
      qdrant       : data.qdrant,
      ia_eval      : data.ia_eval,
    };
  }

  private upsertAudit(audit: any, origin: string): void {
    const idx = this.audits.findIndex((a:any) => a.id === audit.id);
    if (idx >= 0) {
      const ex = this.audits[idx];
      this.audits[idx] = { ...ex, ...audit, _origin: ex._origin==='live'?'live':origin };
    } else {
      this.audits.unshift({ ...audit, _origin: origin });
      this.audits.sort((a:any,b:any) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
    if (this.selectedAudit?.id === audit.id) {
      this.selectedAudit = { ...this.selectedAudit, ...audit };
    }
  }

  private updateAudit(id: number, patch: any): void {
    const idx = this.audits.findIndex((a:any) => a.id === id);
    if (idx >= 0) { this.audits[idx] = { ...this.audits[idx], ...patch }; }
    if (this.selectedAudit?.id === id) { this.selectedAudit = { ...this.selectedAudit, ...patch }; }
  }

  private addLiveEvent(event: any): void {
    this.liveEvents.unshift({ ...event,
      _ts: new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}) });
    if (this.liveEvents.length > 200) { this.liveEvents.pop(); }
  }

  private recalcStats(): void {
    const a = this.audits;
    this.stats.total    = a.length;
    this.stats.passed   = a.filter((x:any) => x.status==='PASSED').length;
    this.stats.failed   = a.filter((x:any) => x.status==='FAILED').length;
    this.stats.approved = a.filter((x:any) => x.status==='HUMAN_APPROVED').length;
    this.stats.rejected = a.filter((x:any) => x.status==='HUMAN_REJECTED').length;
    const scores = a.map((x:any) => x.score).filter((s:any) => s != null);
    this.stats.avg_score = scores.length > 0
      ? Math.round(scores.reduce((a:number,b:number)=>a+b,0)/scores.length*10)/10 : 0;
  }

  // ── Actions HITL ─────────────────────────────────────────────
  approveAudit(audit: any): void {
    if (!this.canApprove()) { return; }
    this.actionLoading = audit.id;
    // 1. Envoyer via WebSocket (HITL)
    this.ws?.send(JSON.stringify({ action:'approve', task_id:audit.id, comment:this.actionComment }));
    // 2. Appeler directement l'API pour déclencher WSO2
    this.http.post<any>(`${this.API_URL}/hitl/review`, {
      api_id : audit.id,
      action : 'approve',
      user_id: 'admin.biat',
      comment: this.actionComment || 'Approuvé par admin BIAT'
    }).subscribe({
      next: (res) => {
        this.actionLoading = null;
        const wr = res.wso2_result;
        if (wr) {
          if (wr.already_exists || wr.duplicate_alert) {
            // Doublon fonctionnel détecté
            this.addTestingLog('WSO2',
              `⚠️ Doublon détecté — ${wr.existing_name ?? 'API'} v${wr.existing_version ?? '?'} déjà existante`,
              'tag-warn');
            this.addTestingLog('Jira',
              `📋 Ticket doublon créé : ${res.duplicate_ticket?.key ?? 'en cours'}`,
              'tag-warn');
            // Afficher alerte dans l'interface
            this._wso2DuplicateAlert = {
              show          : true,
              spec_id       : res.wso2_result?.spec_id,
              existing_name : wr.existing_name,
              existing_ver  : wr.existing_version,
              wso2_url      : wr.wso2_url,
              jira_ticket   : res.duplicate_ticket?.key,
            };
          } else if (wr.simulated) {
            this.addTestingLog('WSO2', `🔵 Simulation → ${wr.message ?? 'OK'}`, 'tag-info');
          } else if (wr.success) {
            this.addTestingLog('WSO2', `✅ Publié → ${wr.message ?? 'OK'}`, 'tag-pass');
          }
        }
        if (res.jira_closed) {
          this.addTestingLog('Jira', `✓ Ticket ${res.jira_key} → DONE`, 'tag-pass');
        }
      },
      error: () => { this.actionLoading = null; }
    });
  }

  rejectAudit(audit: any): void {
    if (!this.canApprove()) { return; }
    this.actionLoading = audit.id;
    this.ws?.send(JSON.stringify({ action:'reject', task_id:audit.id, comment:this.actionComment }));
  }

  sendFeedback(audit: any, expert: string, delta: number): void {
    if (!this.canReview()) { return; }
    this.ws?.send(JSON.stringify({ action:'feedback', task_id:audit.id, expert, delta }));
  }

  sendFeedbackDirect(expert: string, delta: number): void {
    if (!this.selectedAudit) { return; }
    this.sendFeedback(this.selectedAudit, expert, delta);
  }

  // ── Logout Keycloak ──────────────────────────────────────────
  logout(): void { this.auth.logout(); }

  // ── switchUser désactivé en prod (Keycloak gère) ─────────────
  switchUser(_: any): void {}

  // ── Vues filtrées ────────────────────────────────────────────
  get displayedAudits(): any[] {
    let list = this.audits;
    if (this.auditView==='live')    { list = list.filter((a:any)=>a._origin==='live'); }
    if (this.auditView==='history') { list = list.filter((a:any)=>a._origin!=='live'); }
    return list.filter((a:any) => {
      const ms = !this.filterStatus || a.status===this.filterStatus;
      const mq = !this.searchQuery  || a.spec_id?.toLowerCase().includes(this.searchQuery.toLowerCase());
      return ms && mq;
    });
  }
  get filteredAudits(): any[] { return this.displayedAudits; }

  getLiveCount():    number { return this.audits.filter((a:any)=>a._origin==='live').length; }
  getHistoryCount(): number { return this.audits.filter((a:any)=>a._origin!=='live').length; }
  hasAnyPending():   boolean { return this.audits.some((a:any)=>a.status==='FAILED'); }
  countPendingAudits(): number { return this.audits.filter((a:any)=>a.status==='FAILED').length; }
  getPendingAudits():  any[]  { return this.audits.filter((a:any)=>a.status==='FAILED').slice(0,6); }

  selectAudit(a: any):     void { this.selectedAudit = a; }
  openAuditReport(a: any): void { this.selectedAudit = a; }
  selectAuditById(id: number): void {
    const a = this.audits.find((x:any)=>x.id===id);
    if (a) { this.selectedAudit = a; }
  }

  refreshAll(): void { this.audits=[]; this.loadAllAuditsFromDB(); }
  reconnect():  void { this.ws?.close(); this.connectWS(); }

  // ── Helpers dashboard ────────────────────────────────────────
  getWeightsList(): any[] {
    if (!this.weights) { return []; }
    const labels: Record<string,string> = { design:'Design',security:'Security',biat:'BIAT Policy',chairman:'Chairman' };
    return Object.entries(this.weights).map(([key,val]:[string,any]) => ({
      key, label:labels[key]||key,
      weight        : +(val.weight         ?? 1.0),
      total_feedback: +(val.total_feedback ?? 0),
      positive_rate : +(val.positive_rate  ?? 0),
      updated_at    : val.updated_at ?? null
    }));
  }

  getComplianceRate(): number {
    if (this.stats.total===0) { return 0; }
    return Math.round(((this.stats.passed+this.stats.approved)/this.stats.total)*100);
  }
  getComplianceDash(): string {
    const c=2*Math.PI*50, r=this.getComplianceRate()/100;
    return `${c*r} ${c*(1-r)}`;
  }
    getPipelineStages(): any[] {
    const pp = this.pipelineProgress;
    const pc = this.pipelineCounts;
    return [
      { id:'import',   name:'Import',   emoji:'📥', color:'#c042ff',
        count: this.stats.total,                           state: pp['import']   ?? 'idle', sub:'specs'          },
      { id:'spectral', name:'Spectral', emoji:'🔍', color:'#f59e0b',
        count: pc['spectral']  ?? 0,                      state: pp['spectral'] ?? 'idle', sub:'violations'     },
      { id:'qdrant',   name:'Qdrant',   emoji:'🧠', color:'#00f2ff',
        count: pc['qdrant']    ?? 0,                      state: pp['qdrant']   ?? 'idle', sub:'vecteurs'        },
      { id:'moe',      name:'MoE',      emoji:'🤖', color:'#3b82f6',
        count: pc['moe']       ?? 0,                      state: pp['moe']      ?? 'idle', sub:'experts'         },
      { id:'testing',  name:'Testing',  emoji:'🧪', color:'#22c55e',
        count: pc['testing']   ?? 0,                      state: pp['testing']  ?? 'idle', sub:'Dredd + Schema'  },
      { id:'hitl',     name:'HITL',     emoji:'👤', color:'#f59e0b',
        count: this.stats.approved + this.stats.rejected, state: pp['hitl']     ?? 'idle', sub:'validations'     },
    ];
  }

  _stageState(id: string): string {
    const last = this.liveEvents[0];
    if (!last) return 'idle';
    // Vrais types WebSocket du backend
    const typeMap: any = {
      'import'  : ['audit_update'],
      'spectral': ['score_update'],
      'qdrant'  : ['qdrant_result'],
      'moe'     : ['moe_result'],
      'testing' : ['analysis_complete'],
      'hitl'    : ['hitl_action', 'feedback_recorded', 'weights_update']
    };
    const types = typeMap[id] || [];
    // Stage actif = dernier event est de ce type
    if (types.some((t:string) => last.type === t)) return 'run';
    // Stage terminé = un event de ce type existe
    const hasEvent = this.liveEvents.some((e:any) => types.includes(e.type));
    return hasEvent ? 'done' : 'idle';
  }

  selectStage(id: string): void {
    this.pipelineActive = id;
  }

  addTestingLog(tag: string, msg: string, cls: string): void {
    const d = new Date();
    const ts = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
    this.testingLogs.unshift({ ts, tag, msg, cls });
    if (this.testingLogs.length > 20) this.testingLogs.pop();
  }

  getStageClass(state: string): string {
    const map: any = { run:'s-run', done:'s-done', fail:'s-fail', idle:'s-idle' };
    return map[state] || 's-idle';
  }

  getTestingData(audit: any): any {
    if (!audit) return null;
    return audit?.ai?.testing_pipeline
        || audit?.ai_analysis?.testing_pipeline
        || audit?.testing_pipeline
        || null;
  }



  loadLlmModels(): void {
    this.llmLoading = true;
    this.http.get<any>(`${this.API_URL}/agent/llm/models`).subscribe({
      next: (res) => {
        this.llmModels      = (res.models || []).sort((a:any,b:any) => b.score - a.score);
        this.llmLogs        = res.recent_events || [];
        this.llmActiveModel = this.llmModels.find((m:any) => m.is_active)?.model_id || 'gpt-oss-120b';
        this.llmLoading     = false;
      },
      error: () => { this.llmLoading = false; }
    });
  }

  triggerLlmDiscovery(): void {
    this.http.post<any>(`${this.API_URL}/agent/llm/discover`, {}).subscribe({
      next: (res) => {
        this.addTestingLog('LLM', `Cycle discovery lancé — ${res.message}`, 'tag-info');
        setTimeout(() => this.loadLlmModels(), 5000);
      }
    });
  }


  getFallbackChain(): string[] {
    return [
      this.llmActiveModel || 'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'groq/compound-mini',
    ];
  }

  getLatPct(ms: number): number {
    if (!ms) return 0;
    return Math.min(100, Math.round((ms / 8000) * 100));
  }

  getLlmNewCount(): number {
    return this.llmModels.filter((m:any) => m.is_new).length;
  }

  getLlmScoreColor(score: number): string {
    if (score >= 90) return '#22c55e';
    if (score >= 75) return '#f59e0b';
    return '#f43f5e';
  }

  getLlmLatClass(lat: number): string {
    if (lat < 1.5) return 'lat-good';
    if (lat < 3)   return 'lat-mid';
    return 'lat-bad';
  }

  getRingColor(td: any): string {
    if (!td) return '#8b949e';
    if (td.status === 'TESTS_PASSED') return '#22c55e';
    if (td.status === 'FAILED') return '#f43f5e';
    const rate = td.summary?.pass_rate ?? 0;
    if (rate >= 75) return '#22c55e';
    if (rate >= 50) return '#f59e0b';
    return '#f43f5e';
  }

  getStageGlow(s: any): string {
    if (s.state === 'done') return `0 0 10px ${s.color}40`;
    if (s.state === 'run')  return `0 0 14px ${s.color}60`;
    return 'none';
  }

  getLastTestingData(): any {
    // Retourner seulement si un audit est explicitement sélectionné
    if (this.selectedAudit) return this.getTestingData(this.selectedAudit);
    // Retourner seulement si un audit live est en cours (liveEvents récents)
    if (this.liveEvents.length > 0) {
      const lastEvent = this.liveEvents[0];
      const liveAudit = this.audits.find((a:any) => a.id === lastEvent?.task_id);
      if (liveAudit) return this.getTestingData(liveAudit);
    }
    return null;
  }
  getExpertStats(): any[] {
    const wl=this.getWeightsList();
    return [
      { key:'design',  name:'Design',  color:'#c042ff' },
      { key:'security',name:'Security',color:'#f59e0b' },
      { key:'biat',    name:'BIAT',    color:'#22c55e' },
    ].map(e => {
      const field = e.key==='biat'?'chairman_score':e.key+'_score';
      const scores = this.audits.map((a:any)=>a.ia_eval?.[field]).filter((s:any)=>s!=null);
      const avg = scores.length>0 ? scores.reduce((a:number,b:number)=>a+b,0)/scores.length : 0;
      const w = wl.find(w=>w.key===e.key||(e.key==='biat'&&w.key==='chairman'));
      return { ...e, avg:Math.round(avg), weight:w?.weight??1.0 };
    });
  }
  getContribs(ia_eval: any): any[] {
    const c=ia_eval?.moe_aggregation?.contributions;
    if (!c) { return []; }
    return Object.entries(c).map(([k,v]:[string,any])=>({ name:k,...v }));
  }
  getExpertColor(name: string): string {
    const m: Record<string,string>={ design:'#c042ff',security:'#f59e0b',biat:'#22c55e',chairman:'#22c55e' };
    return m[name.toLowerCase()]||'#8b949e';
  }
  getQdrantDescription(level: string): string {
    const m: Record<string,string>={
      BLOCKED:'Spec bloquée — doublon identique (≥98%)',
      WARNING:'Spec similaire — vérification recommandée (≥80%)',
      RAG_ONLY:'Contexte RAG injecté dans le prompt LLM (≥70%)',
      NONE:'Spec unique — aucun doublon détecté',
    };
    return m[level]||level;
  }

  // ── UI helpers ───────────────────────────────────────────────
  getRoleColor(role: string): string {
    return role==='owner'||role==='superadmin' ? '#f43f5e' :
           role==='admin'   ? '#c042ff' :
           role==='reviewer'? '#f59e0b' : '#8b949e';
  }
  getRoleLabel(role: string): string {
    return role==='owner'||role==='superadmin' ? 'Owner' :
           role==='admin'   ? 'Admin' :
           role==='reviewer'? 'Reviewer' : 'User';
  }
  getStatusColor(s: string): string {
    const m: Record<string,string>={ PASSED:'#22c55e',FAILED:'#f43f5e',HUMAN_APPROVED:'#22c55e',HUMAN_REJECTED:'#8b949e',PENDING:'#f59e0b' };
    return m[s]||'#8b949e';
  }
  getScoreColor(score: number|null): string {
    if (!score) { return '#8b949e'; }
    return score>=80?'#22c55e':score>=60?'#f59e0b':'#f43f5e';
  }
  getQdrantColor(level: string): string {
    const m: Record<string,string>={ BLOCKED:'#f43f5e',WARNING:'#f59e0b',RAG_ONLY:'#3b82f6',NONE:'#22c55e' };
    return m[level]||'#8b949e';
  }
  getWeightColor(w: number): string {
    return w>=1.3?'#22c55e':w>=0.9?'#c042ff':w>=0.7?'#f59e0b':'#f43f5e';
  }
  getTrend(w: number): string {
    return w>=1.3?'↑↑':w>=1.1?'↑':w>=0.9?'→':w>=0.7?'↓':'↓↓';
  }
  formatDate(ts: string): string {
    if (!ts) { return '—'; }
    return new Date(ts).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  }
  // ── YAML corrigé — copier et télécharger ─────────────────────────────────
  copyYaml(audit: any): void {
    const yaml = audit.corrected_yaml || audit.ai?.corrected_yaml || '';
    if (yaml) {
      navigator.clipboard.writeText(yaml).then(() => {
        console.log('[Admin] YAML copié dans le presse-papier');
      });
    }
  }

  downloadYaml(audit: any): void {
    const yaml = audit.corrected_yaml || audit.ai?.corrected_yaml || '';
    if (!yaml) { return; }
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = (audit.spec_id || 'spec') + '_corrected.yaml';
    a.click();
    URL.revokeObjectURL(url);
  }


  // ── YAML diff viewer ─────────────────────────────────────────────────────
  getDiffLines(audit: any): any[] {
    const corrected = (audit.corrected_yaml || audit.ai?.corrected_yaml || '').split('\n');
    // Marquer les lignes ajoutées/modifiées par le MoE
    // Heuristique : lignes contenant des mots-clés ajoutés par le builder
    const addedKeywords = [
      'operationId', 'description:', 'contact:', 'security:',
      'authorizationCode', 'authorizationUrl', 'tokenUrl', 'scopes:',
      'servers:', 'https://', 'tags:'
    ];
    return corrected.map((line: string) => {
      const trimmed = line.trim();
      const isAdded = addedKeywords.some(k => trimmed.startsWith(k) || trimmed.includes(k));
      return {
        content: line,
        type: isAdded ? 'added' : 'normal'
      };
    });
  }


  // ── Live pipeline progress bar ───────────────────────────────────────────
  getLivePipelineStages(): any[] {
    const events = this.liveEvents.map((e: any) => e.type);
    const has = (t: string) => events.some((e: string) => e === t);

    const hasAudit    = has('audit_update')     || has('audit_submitted');
    const hasQdrant   = has('qdrant_result');
    const hasMoe      = has('moe_result');
    const hasComplete = has('analysis_complete');
    const hasHitl     = has('hitl_action');

    return [
      { name: 'Import',   done: hasAudit,    active: !hasAudit,    color: '#c042ff', last: false },
      { name: 'Spectral', done: hasQdrant,   active: hasAudit && !hasQdrant,  color: '#3b82f6', last: false },
      { name: 'Qdrant',   done: hasMoe,      active: hasQdrant && !hasMoe,    color: '#f59e0b', last: false },
      { name: 'MoE',      done: hasComplete, active: hasMoe && !hasComplete,  color: '#c042ff', last: false },
      { name: 'HITL',     done: hasHitl,     active: hasComplete && !hasHitl, color: '#22c55e', last: true  },
    ];
  }


  // ── Jira integration ─────────────────────────────────────────────────────
  createJiraTicket(audit: any): void {
    const body = {
      audit_id   : audit.id,
      title      : `[BIAT-GOV] #${audit.id} ${audit.spec_id} — Score ${audit.score}%`,
      priority   : (audit.score ?? 100) < 50 ? 'High' : 'Medium',
      description: `Audit #${audit.id} | Spec: ${audit.spec_id} | Score: ${audit.score}/100 | Violations: ${audit.issues_count} | Statut: ${audit.status}`,
      via_n8n    : false
    };
    this.http.post<any>('http://localhost:8000/agent/jira/create', body).subscribe({
      next: (res) => {
        if (res.status === 'created') {
          audit.jira_key = res.key;
          audit.jira_url = res.url;
          alert(`Ticket ${res.key} créé : ${res.url}`);
          this.cdr.detectChanges();
        }
      },
      error: () => alert('Erreur création ticket Jira')
    });
  }

  closeJiraTicket(audit: any, action: string): void {
    if (!audit.jira_key) { return; }
    const body = {
      jira_key: audit.jira_key,
      audit_id: audit.id,
      action,
      comment : action === 'done'
        ? `Ticket fermé — API ${audit.spec_id} approuvée par l'admin BIAT et publiée sur WSO2.`
        : `Ticket mis à jour — action: ${action}`
    };
    this.http.post<any>('http://localhost:8000/agent/jira/close', body).subscribe({
      next: (res) => {
        alert(`Ticket ${res.key} → ${action}`);
        if (action === 'done') { audit.jira_key = null; }
        this.cdr.detectChanges();
      },
      error: () => alert('Erreur fermeture ticket Jira')
    });
  }


  // Fermer le ticket Jira associé à cet audit
  closeJiraBySpec(audit: any): void {
    const key = audit.jira_key;
    if (!key) {
      alert(`Aucun ticket Jira pour cet audit. Score ${audit.score}% < 90% → ticket créé automatiquement au prochain audit.`);
      return;
    }
    this.http.post<any>('http://localhost:8000/agent/jira/close', {
      jira_key: key,
      audit_id: audit.id,
      action  : 'done',
      comment : `Ticket fermé — API ${audit.spec_id} traitée par l'admin BIAT. Score RL: ${audit.ai?.rl_final_score ?? audit.score}/100.`
    }).subscribe({
      next: (res) => {
        alert(res.status === 'updated'
          ? `Ticket ${res.key} fermé avec succès.`
          : `Erreur : ${res.error || 'inconnue'}`);
        if (res.status === 'updated') { audit.jira_key = null; }
        this.cdr.detectChanges();
      },
      error: () => alert('Erreur fermeture ticket Jira.')
    });
  }


  // ── Testing Pipeline helpers ──────────────────────────────────────────────
  getTestStatus(audit: any): string {
    const t = audit.ai?.testing_pipeline
           || audit.testing_pipeline
           || audit.ai_analysis?.testing_pipeline;
    return t?.status || 'NOT_TESTED';
  }
  getTestColor(audit: any): string {
    return this.getTestStatus(audit) === 'TESTS_PASSED' ? '#22c55e' : '#f43f5e';
  }
  getTestBg(audit: any): string {
    return this.getTestStatus(audit) === 'TESTS_PASSED'
      ? 'rgba(34,197,94,.1)' : 'rgba(244,63,94,.1)';
  }
  getTestData(audit: any, tool: string): any {
    const t = audit.ai?.testing_pipeline
           || audit.testing_pipeline
           || audit.ai_analysis?.testing_pipeline;
    return t?.[tool] ?? null;
  }
  getTestSummary(audit: any): any {
    const t = audit.ai?.testing_pipeline
           || audit.testing_pipeline
           || audit.ai_analysis?.testing_pipeline;
    return t?.summary ?? null;
  }


  downloadPdfReport(audit: any): void {
    const url      = `${this.API_URL}/agent/report/${audit.id}`;
    const filename = `rapport_audit_${audit.id}_${(audit.spec_id||'').replace('.yaml','')}.pdf`;
    this.addTestingLog('PDF', `Génération rapport #${audit.id}...`, 'tag-info');

    this.http.get(url, { responseType: 'arraybuffer' }).subscribe({
      next: (buffer) => {
        const blob    = new Blob([buffer], { type: 'application/pdf' });
        const blobUrl = window.URL.createObjectURL(blob);
        const a       = document.createElement('a');
        a.href        = blobUrl;
        a.download    = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(blobUrl);
        }, 100);
        this.addTestingLog('PDF', `✓ ${filename} téléchargé`, 'tag-pass');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.addTestingLog('PDF', `✗ Erreur téléchargement : ${err.status}`, 'tag-fail');
      }
    });
  }

  recorrectAndRetest(audit: any): void {
    console.log('[Recorrect] Démarrage pour audit', audit.id, 'status:', this.getTestStatus(audit));
    console.log('[Recorrect] testing_pipeline:', audit.ai?.testing_pipeline || audit.ai_analysis?.testing_pipeline);
    this.actionLoading = audit.id;
    this.addTestingLog('MoE', '🔄 Recorrection en cours — injection des violations Schemathesis...', 'tag-warn');

    this.http.post<any>(`${this.API_URL}/agent/recorrect/${audit.id}`, {}).subscribe({
      next: (res) => {
        this.actionLoading = null;
        console.log('[Recorrect] Réponse reçue:', res);

        if (res.error) {
          this.addTestingLog('Recorrect', `✗ Erreur : ${res.error}`, 'tag-fail');
          return;
        }

        const tp = res.testing;
        this.addTestingLog('MoE', `✅ ${res.violations_fixed ?? 0} violations corrigées par ${res.model}`, 'tag-pass');
        if (tp) {
          this.addTestingLog('Testing',
            `${tp.status} — Pass rate: ${res.pass_rate ?? tp?.summary?.pass_rate ?? 0}%`,
            tp.status === 'TESTS_PASSED' ? 'tag-pass' : 'tag-warn');
        }

        // Recharger l'audit complet depuis la DB
        this.http.get<any>(`${this.API_URL}/agent/result/${audit.id}`).subscribe({
          next: (fresh) => {
            if (fresh.ai_analysis && typeof fresh.ai_analysis === 'string') {
              try { fresh.ai_analysis = JSON.parse(fresh.ai_analysis); } catch {}
            }
            const ai = fresh.ai_analysis || {};
            const patch = {
              ai          : ai,
              ai_analysis : ai,
              status      : fresh.status,
              score       : fresh.score,
              corrected_yaml: ai.corrected_yaml,
              testing_pipeline: ai.testing_pipeline,
            };
            this.updateAudit(audit.id, patch);
            if (this.selectedAudit?.id === audit.id) {
              this.selectedAudit = { ...this.selectedAudit, ...patch };
            }
            this.addTestingLog('Recorrect', `✓ Audit #${audit.id} rechargé depuis DB`, 'tag-pass');
            this.cdr.detectChanges();
          },
          error: () => {
            // Fallback si /results/:id n'existe pas
            if (res.new_yaml) {
              if (!audit.ai) audit.ai = {};
              audit.ai.corrected_yaml   = res.new_yaml;
              audit.ai.testing_pipeline = tp;
              if (this.selectedAudit?.id === audit.id) {
                this.selectedAudit = { ...this.selectedAudit,
                  ai: { ...this.selectedAudit.ai, corrected_yaml: res.new_yaml, testing_pipeline: tp }
                };
              }
            }
            this.cdr.detectChanges();
          }
        });
      },
      error: (err) => {
        this.actionLoading = null;
        console.error('[Recorrect] Erreur HTTP:', err);
        this.addTestingLog('Recorrect', `✗ Erreur : ${err.status} ${err.message}`, 'tag-fail');
      }
    });
  }

  rerunTests(audit: any): void {
    this.actionLoading = audit.id;
    this.http.post<any>(`http://localhost:8000/agent/testing/run/${audit.id}`, {})
      .subscribe({
        next: (res) => {
          const tp = res?.testing_pipeline;
          if (tp) {
            if (!audit.ai) { audit.ai = {}; }
            audit.ai.testing_pipeline = tp;
          }
          this.actionLoading = null;
          this.cdr.detectChanges();
        },
        error: () => { this.actionLoading = null; }
      });
  }


}