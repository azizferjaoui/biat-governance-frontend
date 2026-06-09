import { Component, ChangeDetectorRef } from '@angular/core';
import { ApiGovernanceService } from '../../core/services/api-governance.service';

@Component({
  selector: 'app-api-import',
  templateUrl: './api-import.component.html',
  styleUrls: ['./api-import.component.css']
})
export class ApiImportComponent {

  // ─── État général ─────────────────────────────────────────────────────────
  importMode: 'url' | 'file' = 'url';
  openApiUrl: string = '';
  rawYaml: string = '';
  selectedFileName: string = '';
  selectedFile: File | null = null;
  loading: boolean = false;
  auditTermine: boolean = false;
  message: string = '';
  errorMessage: string = '';
  auditReport: any[] = [];
  qualityScore: number = 0;

  // Compteurs violations
  errorsCount: number = 0;
  securityAlertsCount: number = 0;
  warningsCount: number = 0;
  oaiViolations: number = 0;
  msViolations: number = 0;
  biatViolations: number = 0;
  owaspViolations: number = 0;

  aiSuggestion: string = '';
  selectedLine: number | null = null;
  aiScore: number | null = null;
  aiAnalyzed: boolean = false;
  aiFullResponse: string = '';
  showFullAiResponse: boolean = false;
  aiLoading: boolean = false;

  // Fix Wizard
  fixes: any[] = [];
  selectedFixes: { [key: number]: number } = {};
  selectedFixesCount: number = 0;
  showFixWizard: boolean = false;
  correctedYaml: string = '';
  showCorrectedYaml: boolean = false;
  allFixesSelected: boolean = false;
  currentTaskId: number | null = null;

  // IA Eval
  iaEval: any = null;
  showIaEval: boolean = false;
  modelsUsed: any = null;

  // ─── QDRANT PIPELINE — état temps réel ───────────────────────────────────
  qdrantStep: 'idle' | 'checking' | 'done' = 'idle';
  qdrantLevel: string = 'NONE';          // BLOCKED | WARNING | RAG_ONLY | NONE
  qdrantSimilarApi: string | null = null;
  qdrantSimilarity: number | null = null;
  qdrantRagCount: number = 0;
  qdrantBlocked: boolean = false;
  // ─────────────────────────────────────────────────────────────────────────

  constructor(
    private govService: ApiGovernanceService,
    private cdr: ChangeDetectorRef
  ) {}

  // ─── Labels modèles ───────────────────────────────────────────────────────
  getModelLabel(role: string): string {
    if (!this.modelsUsed) {
      return role === 'chairman' ? 'mistral:7b'
           : role === 'design'   ? 'gemma3:4b'
           : 'llama3.2:3b';
    }
    if (this.modelsUsed.mode === 'groq') return 'openai/gpt-oss-120b';
    const map: any = {
      design:   this.modelsUsed.expert_design,
      security: this.modelsUsed.expert_security,
      chairman: this.modelsUsed.chairman
    };
    return map[role] || role;
  }

  getCouncilSubtitle(): string {
    if (!this.modelsUsed) return '3 Stages · Peer Review · Chairman synthèse';
    return this.modelsUsed.mode === 'groq'
      ? '3 Stages · Groq ⚡ · openai/gpt-oss-120b-versatile'
      : '3 Stages · Peer Review · Chairman synthèse';
  }

  getIaEvalSubtitle(): string {
    if (!this.modelsUsed) return "Qualité de l'analyse — 3 Stages LLM Council";
    return this.modelsUsed.mode === 'groq'
      ? "Qualité de l'analyse — Groq ⚡ openai/gpt-oss-120b"
      : "Qualité de l'analyse — 3 Stages LLM Council";
  }

  getLatenceLabel(): string {
    if (!this.modelsUsed) return '5 appels Ollama';
    return this.modelsUsed.mode === 'groq' ? '5 appels Groq API' : '5 appels Ollama';
  }

  // ─── Qdrant helpers UI ────────────────────────────────────────────────────
  getQdrantLevelColor(): string {
    const map: Record<string, string> = {
      BLOCKED:  '#f43f5e',
      WARNING:  '#f59e0b',
      RAG_ONLY: '#3b82f6',
      NONE:     '#22c55e'
    };
    return map[this.qdrantLevel] || '#8b949e';
  }

  getQdrantLevelLabel(): string {
    const map: Record<string, string> = {
      BLOCKED:  'Doublon bloqué',
      WARNING:  'Spec similaire détectée',
      RAG_ONLY: 'Contexte RAG trouvé',
      NONE:     'Spec unique — OK'
    };
    return map[this.qdrantLevel] || 'Vérification...';
  }

  getQdrantStepIcon(): string {
    if (this.qdrantStep === 'checking') return 'pi-spin pi-spinner';
    if (this.qdrantLevel === 'BLOCKED')  return 'pi-ban';
    if (this.qdrantLevel === 'WARNING')  return 'pi-exclamation-triangle';
    if (this.qdrantLevel === 'RAG_ONLY') return 'pi-info-circle';
    if (this.qdrantLevel === 'NONE')     return 'pi-check-circle';
    return 'pi-database';
  }

  // ─── Catégorisation violations ────────────────────────────────────────────
  getIssueCategory(issue: any): 'oai' | 'ms' | 'biat' | 'owasp' | 'design' | 'security' {
    const code = (issue.code || '').toLowerCase();
    const msg  = (issue.message || '').toLowerCase();
    if (code.startsWith('owasp:')) return 'owasp';
    if (!code.startsWith('biat-')) {
      if (msg.includes('security') || msg.includes('oauth') || msg.includes('auth')) return 'security';
      return 'design';
    }
    if (msg.includes('[oai]'))  return 'oai';
    if (msg.includes('[ms]'))   return 'ms';
    if (msg.includes('[biat]')) return 'biat';
    if (code.includes('oauth') || code.includes('security') || code.includes('basic') ||
        code.includes('https') || code.includes('credentials') || code.includes('root-security') ||
        code.includes('servers-not-in') || code.includes('xwso2') || code.includes('global-security'))
      return 'biat';
    if (code.includes('path-lowercase') || code.includes('no-verbs') || code.includes('api-versioning') ||
        code.includes('post-returns') || code.includes('delete-returns') || code.includes('request-body') ||
        code.includes('error-responses') || code.includes('no-generic'))
      return 'ms';
    return 'oai';
  }

  getIssueCategoryLabel(issue: any): string {
    const labels: Record<string, string> = {
      oai: '📋 OpenAPI', ms: '🔷 REST', biat: '🏦 BIAT',
      owasp: '🔒 OWASP', security: '🔒 OWASP', design: '📋 OpenAPI'
    };
    return labels[this.getIssueCategory(issue)] || '📋 OpenAPI';
  }

  getIssueCategoryColor(issue: any): string {
    const colors: Record<string, string> = {
      oai: '#3b82f6', ms: '#8b5cf6', biat: '#f59e0b',
      owasp: '#ef4444', security: '#ef4444', design: '#3b82f6'
    };
    return colors[this.getIssueCategory(issue)] || '#3b82f6';
  }

  // ─── Import ───────────────────────────────────────────────────────────────
  onImportUrl(): void {
    if (!this.openApiUrl) return;
    this.resetAudit();
    this.loading = true;
    this.selectedFileName = this.openApiUrl.split('/').pop() || 'api_spec.yaml';
    fetch(this.openApiUrl)
      .then(r => r.text())
      .then(t => { this.rawYaml = t; this.cdr.detectChanges(); })
      .catch(() => {});
    this.govService.importFromUrl(this.openApiUrl).subscribe({
      next:  (res: any) => this.pollResults(res.id),
      error: () => { this.loading = false; this.errorMessage = "URL invalide ou inaccessible"; }
    });
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile     = file;
      this.selectedFileName = file.name;
      const reader = new FileReader();
      reader.onload = (e: any) => { this.rawYaml = e.target.result; this.resetAudit(); };
      reader.readAsText(file);
    }
  }

  onUploadFile(): void {
    if (!this.selectedFile) return;
    this.resetAudit();
    this.loading = true;
    this.govService.importFile(this.selectedFile).subscribe({
      next:  (res: any) => this.pollResults(res.id),
      error: () => { this.loading = false; this.errorMessage = 'Erreur Upload'; }
    });
  }

  // ─── Polling principal ────────────────────────────────────────────────────
  pollResults(taskId: number): void {
    this.currentTaskId = taskId;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (attempts >= 180) {
        clearInterval(interval);
        if (this.loading) { this.loading = false; this.errorMessage = 'Délai dépassé.'; this.cdr.detectChanges(); }
        return;
      }
      this.govService.getAuditResult(taskId).subscribe((data: any) => {
        if (!data) return;

        // Continuer à poll si encore PENDING
        if (data.status === 'PENDING') return;

        // FIX : si score est null mais status != PENDING → worker a écrit
        // mais score pas encore sauvegardé → attendre 1 poll de plus max
        if (data.score === null && attempts < 5) return;

        clearInterval(interval);

        if (data.issues_count > 0 && !data.issues_detail) {
          this.govService.getAuditDetails(taskId).subscribe({
            next: (details: any) => {
              data.issues_detail = Array.isArray(details)
                ? details : (details.issues_detail || details.issues || []);
              this.processResult(data);
            },
            error: () => this.processResult(data)
          });
        } else {
          this.processResult(data);
        }
      });
    }, 1000);
  }

  // ─── Traitement résultat ──────────────────────────────────────────────────
  processResult(res: any): void {
    this.loading      = false;
    // FIX : res.score=0 est valide, utiliser ?? au lieu de ? ternaire
    const rawScore = res.score ?? res.quality_score ?? null;
    this.qualityScore = rawScore !== null ? Math.round(Number(rawScore)) : 0;
    const ai = res.ai_analysis;

    if (ai && ai.chairman_response && ai.chairman_response.length > 0) {
      // Qdrant déjà dans la réponse
      this.applyQdrantData(ai.qdrant);
      this.loadAiData(ai);
    } else if (this.qualityScore < 90) {
      this.aiAnalyzed     = false;
      this.aiLoading      = true;
      this.qdrantStep     = 'checking';   // ← pipeline démarre
      this.generateAiSuggestion();
      this.pollAiAnalysis(res.id);
    } else {
      this.aiAnalyzed = false;
      this.aiLoading  = false;
      this.generateAiSuggestion();
    }

    try {
      let rawIssues = res.issues_detail;
      let maxDepth  = 5;
      while (typeof rawIssues === 'string' && maxDepth-- > 0) {
        try { rawIssues = JSON.parse(rawIssues); } catch { break; }
      }
      if (rawIssues && !Array.isArray(rawIssues) && typeof rawIssues === 'object') {
        const keys = Object.keys(rawIssues);
        rawIssues = rawIssues.issues_detail || rawIssues.issues || rawIssues.results
                 || rawIssues.data || rawIssues.violations || rawIssues.errors
                 || (keys.length === 1 ? rawIssues[keys[0]] : []);
      }
      this.auditReport = Array.isArray(rawIssues) ? rawIssues : [];
      this.errorsCount = 0; this.securityAlertsCount = 0; this.warningsCount = 0;
      this.oaiViolations = 0; this.msViolations = 0; this.biatViolations = 0; this.owaspViolations = 0;
      this.auditReport.forEach((issue: any) => {
        const severity = issue.severity ?? 1;
        const cat      = this.getIssueCategory(issue);
        if (cat === 'oai' || cat === 'design')         this.oaiViolations++;
        else if (cat === 'ms')                          this.msViolations++;
        else if (cat === 'biat' || cat === 'security')  this.biatViolations++;
        else if (cat === 'owasp')                       this.owaspViolations++;
        if (severity === 0) {
          if (cat === 'owasp' || cat === 'biat' || cat === 'security') this.securityAlertsCount++;
          else this.errorsCount++;
        } else { this.warningsCount++; }
      });
    } catch (e) { this.auditReport = []; }

    this.auditTermine = true;
    this.cdr.detectChanges();
  }

  // ─── Polling IA + extraction Qdrant en temps réel ─────────────────────────
  pollAiAnalysis(taskId: number): void {
    let aiAttempts = 0;
    const aiInterval = setInterval(() => {
      aiAttempts++;
      if (aiAttempts >= 120) {
        clearInterval(aiInterval);
        this.aiLoading  = false;
        this.qdrantStep = 'done';
        this.cdr.detectChanges();
        return;
      }
      this.govService.getAuditResult(taskId).subscribe((data: any) => {
        const ai = data?.ai_analysis;

        // ── Extraire Qdrant dès qu'il apparaît dans ai_analysis ──────────
        if (ai?.qdrant && this.qdrantStep === 'checking') {
          this.applyQdrantData(ai.qdrant);
        }

        // ── Chairman reçu → pipeline terminé ─────────────────────────────
        if (ai?.chairman_response && ai.chairman_response.length > 0) {
          clearInterval(aiInterval);
          // Score mis à jour depuis le backend après correction IA
          if (data.score != null) {
            this.qualityScore = Math.round(Number(data.score));
          }
          this.applyQdrantData(ai.qdrant);
          this.loadAiData(ai);
          this.cdr.detectChanges();
        }
      });
    }, 3000);
  }

  // ─── Appliquer les données Qdrant ─────────────────────────────────────────
  private applyQdrantData(qdrant: any): void {
    if (!qdrant) return;
    this.qdrantStep      = 'done';
    this.qdrantLevel     = qdrant.level     || 'NONE';
    this.qdrantSimilarApi= qdrant.similar_api || null;
    this.qdrantSimilarity= qdrant.similarity  || null;
    this.qdrantRagCount  = qdrant.rag_count   || 0;
    this.qdrantBlocked   = this.qdrantLevel === 'BLOCKED';
    this.cdr.detectChanges();
  }

  // ─── Charger données IA ───────────────────────────────────────────────────
  private loadAiData(ai: any): void {
    this.aiScore        = ai.rl_final_score ?? ai.ai_score ?? null;
    // Mettre à jour qualityScore si disponible depuis l'IA
    if (this.aiScore !== null && this.qualityScore === 0) {
      this.qualityScore = Math.round(Number(this.aiScore));
    }
    this.aiFullResponse = ai.chairman_response;
    this.aiSuggestion   = ai.chairman_response.substring(0, 300).trim()
                        + (ai.chairman_response.length > 300 ? '...' : '');
    this.correctedYaml  = (ai.corrected_yaml || '').replace(/```yaml/g, '').replace(/```/g, '').trim();
    this.fixes          = Array.isArray(ai.fixes) ? [...ai.fixes] : [];
    if (ai.ia_eval)     { this.iaEval     = ai.ia_eval;     this.normalizeLatency(); }
    if (ai.models_used) { this.modelsUsed = ai.models_used; }
    this.aiLoading  = false;
    this.aiAnalyzed = true;
  }

  private normalizeLatency(): void {
    if (!this.iaEval?.latency_ms) return;
    const l = this.iaEval.latency_ms;
    if (!l.total || isNaN(l.total)) {
      l.total = (l.design || 0) + (l.security || 0) + (l.design_review || 0)
              + (l.security_review || 0) + (l.chairman || 0);
    }
  }

  // ─── Fix Wizard ───────────────────────────────────────────────────────────
  selectFix(fixId: number, optionIndex: number): void {
    this.selectedFixes[fixId] = optionIndex;
    this.selectedFixesCount   = Object.keys(this.selectedFixes).length;
    this.checkAllSelected();
    this.cdr.detectChanges();
  }

  checkAllSelected(): void {
    this.allFixesSelected = this.fixes.length > 0
      && this.fixes.every(fix => this.selectedFixes[fix.id] !== undefined);
  }

  isFixSelected(fixId: number, optionIndex: number): boolean {
    return this.selectedFixes[fixId] === optionIndex;
  }

  applyAllFixes(): void {
    if (!this.correctedYaml) {
      this.fixes.forEach(fix => {
        const idx = this.selectedFixes[fix.id];
        if (idx !== undefined && fix.options[idx]) this.correctedYaml += fix.options[idx].yaml + '\n';
      });
    }
    this.showCorrectedYaml = true;
    this.showFixWizard     = false;
    this.cdr.detectChanges();
  }

  downloadCorrectedYaml(): void {
    const blob = new Blob([this.correctedYaml], { type: 'text/yaml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `corrected_${this.selectedFileName || 'spec.yaml'}`; a.click();
    URL.revokeObjectURL(url);
  }

  // ─── IA Eval helpers ──────────────────────────────────────────────────────
  getAiScoreColor(score: number | null | undefined): string {
    if (!score && score !== 0) { return '#8b949e'; }
    if (score >= 80) { return '#22c55e'; }
    if (score >= 60) { return '#f59e0b'; }
    return '#f43f5e';
  }

  getAgreementLabel(): string {
    if (!this.iaEval) return '';
    const r = this.iaEval.agreement_ratio;
    if (r >= 0.8) return 'Forte cohérence';
    if (r >= 0.6) return 'Cohérence modérée';
    return 'Faible cohérence';
  }

  getAgreementColor(): string {
    if (!this.iaEval) return '#8b949e';
    const r = this.iaEval.agreement_ratio;
    if (r >= 0.8) return '#22c55e';
    if (r >= 0.6) return '#f59e0b';
    return '#f43f5e';
  }

  getCoverageLabel(): string {
    if (!this.iaEval) return '';
    const c = this.iaEval.issues_coverage;
    if (c >= 0.8) return 'Couverture excellente';
    if (c >= 0.5) return 'Couverture partielle';
    return 'Couverture faible';
  }

  getTotalLatency(): number {
    if (!this.iaEval?.latency_ms) return 0;
    const l = this.iaEval.latency_ms;
    if (l.total && !isNaN(l.total)) return l.total;
    return (l.design || 0) + (l.security || 0) + (l.design_review || 0)
         + (l.security_review || 0) + (l.chairman || 0);
  }

  getLatencyPercent(stage: string): number {
    if (!this.iaEval?.latency_ms) return 0;
    const total = this.getTotalLatency();
    if (!total) return 0;
    const val = this.iaEval.latency_ms[stage];
    if (!val || isNaN(val)) return 0;
    return Math.round((val / total) * 100);
  }

  formatLatency(ms: number | undefined | null): string {
    if (ms === undefined || ms === null || isNaN(ms as number)) return '—';
    return (ms as number) >= 1000 ? ((ms as number) / 1000).toFixed(1) + 's' : ms + 'ms';
  }

  // ─── Utils violations ─────────────────────────────────────────────────────
  getSeverityColor(issue: any): string {
    const cat = this.getIssueCategory(issue);
    if (cat === 'owasp' || cat === 'security') return '#ef4444';
    if (cat === 'biat')   return '#f59e0b';
    if (cat === 'ms')     return '#8b5cf6';
    if (cat === 'oai' || cat === 'design') return '#3b82f6';
    return issue.severity <= 0 ? '#f43f5e' : '#6366f1';
  }

  getSeverityColorByCategory(category: string): string {
    return category === 'security' ? '#f59e0b' : '#f43f5e';
  }

  generateAiSuggestion(): void {
    if (this.owaspViolations > 0)
      this.aiSuggestion = `🔒 ${this.owaspViolations} violation(s) OWASP — rate limiting et sécurité JWT à corriger.`;
    else if (this.biatViolations > 0)
      this.aiSuggestion = `🏦 ${this.biatViolations} violation(s) BIAT — OAuth2, HTTPS, path params à vérifier.`;
    else if (this.msViolations > 0)
      this.aiSuggestion = `🔷 ${this.msViolations} violation(s) REST — conventions nommage et codes HTTP à corriger.`;
    else if (this.oaiViolations > 0)
      this.aiSuggestion = `📋 ${this.oaiViolations} violation(s) OpenAPI — description, contact, tags à compléter.`;
    else if (this.qualityScore >= 90)
      this.aiSuggestion = '✅ Parfait ! La spec est 100% conforme aux standards BIAT.';
    else
      this.aiSuggestion = `${this.errorsCount} violation(s) détectée(s). Le LLM Council prépare des corrections...`;
  }

  toggleFullAiResponse(): void { this.showFullAiResponse = !this.showFullAiResponse; }

  isSecurityIssue(issue: any): boolean {
    const cat = this.getIssueCategory(issue);
    return cat === 'security' || cat === 'owasp' || cat === 'biat';
  }

  getLineNumber(issue: any): number | null {
    return issue?.range?.start?.line ?? null;
  }

  scrollToLine(line: number | null): void {
    if (line === null) return;
    this.selectedLine = line;
    setTimeout(() => {
      const el = document.querySelector(`.line-${line}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  // ─── Contributions HITL RL ──────────────────────────────────────────────
  getContribEntries(): any[] {
    const contribs = this.iaEval?.moe_aggregation?.contributions;
    if (!contribs) return [];
    const labels: Record<string, string> = {
      design: 'Design', security: 'Security', biat: 'BIAT Policy'
    };
    return Object.entries(contribs).map(([key, val]: [string, any]) => ({
      name        : labels[key] || key,
      score       : val.score,
      w_rl        : val.w_rl?.toFixed(2) ?? '1.00',
      confidence  : val.confidence?.toFixed(2) ?? '0.50',
      contribution: val.contribution?.toFixed(1) ?? '—'
    }));
  }

  // ─── Reset ────────────────────────────────────────────────────────────────
  resetAudit(): void {
    this.auditTermine = false; this.auditReport = []; this.errorsCount = 0;
    this.securityAlertsCount = 0; this.warningsCount = 0; this.oaiViolations = 0;
    this.msViolations = 0; this.biatViolations = 0; this.owaspViolations = 0;
    this.selectedLine = null; this.errorMessage = ''; this.loading = false;
    this.aiAnalyzed = false; this.aiLoading = false; this.aiScore = null;
    this.aiFullResponse = ''; this.showFullAiResponse = false;
    this.fixes = []; this.selectedFixes = {}; this.selectedFixesCount = 0;
    this.showFixWizard = false; this.correctedYaml = ''; this.showCorrectedYaml = false;
    this.allFixesSelected = false; this.currentTaskId = null;
    this.iaEval = null; this.showIaEval = false; this.modelsUsed = null;
    // Reset Qdrant pipeline
    this.qdrantStep      = 'idle';
    this.qdrantLevel     = 'NONE';
    this.qdrantSimilarApi= null;
    this.qdrantSimilarity= null;
    this.qdrantRagCount  = 0;
    this.qdrantBlocked   = false;
  }

  resetError(): void { this.resetAudit(); }
}