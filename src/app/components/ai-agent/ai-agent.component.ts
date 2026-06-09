import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AgentService } from '../../core/services/agent.service';
import { Subscription } from 'rxjs';

interface Message {
  role     : 'user' | 'assistant';
  content  : string;
  type?    : 'text' | 'actions' | 'fixes' | 'compare' | 'report' | 'alerts' | 'explanation';
  actions? : any[];
  fixes?   : any[];
  compare? : any;
  alerts?  : any[];
  loading? : boolean;
}

@Component({
  selector    : 'app-ai-agent',
  templateUrl : './ai-agent.component.html',
  styleUrls   : ['./ai-agent.component.css'],
})
export class AiAgentComponent implements OnInit, OnDestroy {

  audit  : any = null;
  stats  : any = null;
  weights: any = null;

  messages    : Message[]  = [];
  input                    = '';
  loading                  = false;
  isOpen                   = false;
  suggestions : string[]   = [];
  alertsCount              = 0;
  private subs: Subscription[] = [];

  private BASE = 'http://localhost:8000';

  constructor(
    private http        : HttpClient,
    private cdr         : ChangeDetectorRef,
    private agentService: AgentService
  ) {}

  ngOnInit(): void {
    this.welcome();
    this.subs.push(
      this.agentService.audit$.subscribe(a => {
        this.audit = a;
        this.updateSuggestions();
        this.cdr.detectChanges();
      }),
      this.agentService.stats$.subscribe(s => {
        if (s) { this.stats = s; this.cdr.detectChanges(); }
      }),
      this.agentService.weights$.subscribe(w => { this.weights = w; })
    );
    // Charger les stats directement si AgentService pas encore alimenté
    this.loadStatsFromApi();
    this.loadAlerts();
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  // ── Welcome ─────────────────────────────────────────────────────────────
  welcome(): void {
    this.messages = [{
      role   : 'assistant',
      content: "Bonjour ! Je suis l'assistant IA BIAT Governance. Sélectionnez un audit ou posez une question.",
      type   : 'text'
    }];
    this.updateSuggestions();
  }

  // ── Suggestions contextuelles ────────────────────────────────────────────
  updateSuggestions(): void {
    if (this.audit) {
      this.suggestions = [
        `Explique les violations`,
        `Corrections ligne par ligne`,
        `Compare avec la version précédente`,
        `Génère un rapport complet`,
        `Créer un ticket Jira`,
        `Fermer ticket Jira`,
      ];
    } else {
      this.suggestions = [
        'Résume les audits du jour',
        'Voir les alertes actives',
        'Quel expert MoE performe le mieux ?',
        'Tendances de conformité',
      ];
    }
  }

  // ── Proactive alerts ─────────────────────────────────────────────────────
  loadAlerts(): void {
    this.http.get<any>(`${this.BASE}/agent/alerts?threshold=60`).subscribe({
      next: (res) => { this.alertsCount = res.count || 0; this.cdr.detectChanges(); },
      error: () => {
        // Fallback : calculer localement depuis /results
        this.http.get<any[]>(`${this.BASE}/results`).subscribe({
          next: (results) => {
            if (!results) { return; }
            const low     = results.filter(r => (r.score ?? 100) < 60 && r.status === 'FAILED').length;
            const pending = results.filter(r => r.status === 'FAILED').length;
            this.alertsCount = low + Math.min(pending, 3);
            this.cdr.detectChanges();
          },
          error: () => {}
        });
      }
    });
  }

  // ── Send message ─────────────────────────────────────────────────────────
  async send(text?: string): Promise<void> {
    const content = (text || this.input).trim();
    if (!content || this.loading) { return; }
    this.input   = '';
    this.loading = true;
    this.messages.push({ role: 'user', content, type: 'text' });
    const placeholder: Message = { role: 'assistant', content: '', loading: true, type: 'text' };
    this.messages.push(placeholder);
    this.cdr.detectChanges();
    this.scrollBottom();

    // Détecter le mode
    const lower   = content.toLowerCase();
    let   mode    = 'chat';
    let   endpoint= `${this.BASE}/agent/chat`;

    if (lower.includes('expliqu') || lower.includes('pourquoi') || lower.includes('explain')) {
      if (this.audit?.id) {
        endpoint = `${this.BASE}/agent/explain/${this.audit.id}`;
        this.callGet(placeholder, endpoint); return;
      }
      mode = 'explain';
    } else if (lower.includes('correction') || lower.includes('fix') || lower.includes('ligne par ligne')) {
      if (this.audit?.id) {
        endpoint = `${this.BASE}/agent/fix/${this.audit.id}`;
        this.callGet(placeholder, endpoint); return;
      }
      mode = 'fix';
    } else if (lower.includes('compar')) {
      if (this.audit?.id) {
        endpoint = `${this.BASE}/agent/compare/${this.audit.id}`;
        this.callGet(placeholder, endpoint); return;
      }
      mode = 'compare';
    } else if (lower.includes('rapport') || lower.includes('report')) {
      if (this.audit?.id) {
        endpoint = `${this.BASE}/agent/report/${this.audit.id}`;
        this.callGet(placeholder, endpoint); return;
      }
      mode = 'report';
    } else if (lower.includes('alerte') || lower.includes('alert')) {
      this.callGet(placeholder, `${this.BASE}/agent/alerts`); return;
    } else if (lower.includes('fermer') || lower.includes('fermer ticket') || lower.includes('close ticket')) {
      const key = this.audit?.jira_key || this.audit?.ai_analysis?.jira_key;
      if (key) {
        this.closeJiraTicket(placeholder, key, 'done');
      } else {
        this.replaceMsg(placeholder, {
          role: 'assistant',
          content: `Aucun ticket Jira associé. Créez-en un d'abord.`,
          type: 'text'
        });
        this.loading = false;
        this.cdr.detectChanges();
      }
      return;
    }

    // Chat standard
    this.http.post<any>(endpoint, {
      message : content,
      context : this.buildContext(),
      history : this.messages.filter(m => !m.loading).slice(-8)
                   .map(m => ({ role: m.role, content: m.content })),
      audit   : this.audit,
      mode
    }).subscribe({
      next : (res) => this.handleResponse(placeholder, res),
      error: () => {
        this.replaceMsg(placeholder, { role:'assistant', content:"Erreur de connexion.", type:'text' });
        this.loading = false; this.cdr.detectChanges();
      }
    });
  }

  // ── GET endpoint ─────────────────────────────────────────────────────────
  private callGet(placeholder: Message, url: string): void {
    this.http.get<any>(url).subscribe({
      next : (res) => this.handleResponse(placeholder, res),
      error: (err) => {
        // Si c'est /alerts qui échoue → fallback local
        if (url.includes('/agent/alerts')) {
          this.generateLocalAlerts(placeholder);
        } else {
          const code = err?.status;
          const msg  = code === 404 ? "Endpoint non trouvé — vérifiez que agent_router est inclus dans main.py."
                     : code === 0   ? "Impossible de joindre le backend (localhost:8000)."
                     : `Erreur ${code}.`;
          this.replaceMsg(placeholder, { role:'assistant', content: msg, type:'text' });
          this.loading = false;
          this.cdr.detectChanges();
        }
      }
    });
  }

  private generateLocalAlerts(placeholder: Message): void {
    this.http.get<any[]>(`${this.BASE}/results`).subscribe({
      next: (results) => {
        if (!results?.length) {
          this.replaceMsg(placeholder, {
            role:'assistant',
            content:'Aucune alerte — tous les audits sont traités.',
            type:'text'
          });
          this.loading = false;
          this.cdr.detectChanges();
          return;
        }
        const low     = results.filter(r => (r.score ?? 100) < 60 && r.status === 'FAILED');
        const pending = results.filter(r => r.status === 'FAILED').slice(0, 5);
        const alerts  = [
          ...low.map(r => ({ type:'low_score', severity:'high', spec_id: r.spec_id, score: r.score, message: `Score critique ${r.score}% — correction requise`, action:'review' })),
          ...pending.slice(0, 3).map(r => ({ type:'pending_hitl', severity:'medium', spec_id: r.spec_id, score: r.score, message: `En attente de validation HITL`, action:'approve_or_reject' }))
        ];
        const summary = `${alerts.length} alertes détectées : ${low.length} scores critiques, ${pending.length} audits en attente HITL.`;
        this.replaceMsg(placeholder, {
          role:'assistant', content: summary,
          type:'alerts', alerts: alerts.slice(0, 5)
        });
        this.alertsCount = alerts.length;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.replaceMsg(placeholder, { role:'assistant', content:"Impossible de charger les alertes.", type:'text' });
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Handle response ──────────────────────────────────────────────────────
  private handleResponse(placeholder: Message, res: any): void {
    const msg: Message = {
      role   : 'assistant',
      content: res.response || '',
      type   : res.type || 'text',
      actions: res.actions,
      fixes  : res.fixes,
      compare: res.type === 'compare' ? res : null,
      alerts : res.alerts,
    };
    this.replaceMsg(placeholder, msg);
    this.loading = false;
    this.cdr.detectChanges();
    this.scrollBottom();
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  executeAction(action: any): void {
    if (!action) { return; }
    switch (action.action) {
      case 'approve':
        this.messages.push({ role:'assistant', content:"Approbation → utilisez le bouton Approuver dans le panneau HITL.", type:'text' });
        break;
      case 'reject':
        this.messages.push({ role:'assistant', content:"Rejet → utilisez le bouton Rejeter dans le panneau HITL.", type:'text' });
        break;
      case 'show_yaml':
        this.messages.push({ role:'assistant', content:"Faites défiler le rapport jusqu'à la section YAML corrigé.", type:'text' });
        break;
      case 'create_jira':
        this.createJira(action);
        break;
    }
    this.cdr.detectChanges();
  }

  createJira(data: any): void {
    this.http.post<any>(`${this.BASE}/agent/jira/create`, {
      audit_id   : this.audit?.id,
      title      : data.title || `[BIAT-GOV] ${this.audit?.spec_id}`,
      priority   : data.priority || 'High',
      description: data.description || `Audit #${this.audit?.id} — score: ${this.audit?.score}%`
    }).subscribe({
      next: (res) => {
        const txt = res.status === 'skipped'
          ? 'Jira non configuré — ticket non créé.'
          : `Ticket Jira créé : ${res.key} — ${res.url}`;
        this.messages.push({ role:'assistant', content: txt, type:'text' });
        this.cdr.detectChanges();
      }
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  private buildContext(): string {
    const s = this.stats;
    const total     = s?.total      ?? s?.length ?? 0;
    const passed    = s?.passed     ?? 0;
    const failed    = s?.failed     ?? 0;
    const avg       = s?.avg_score  ?? s?.avgScore ?? 0;
    return `Tu es l'assistant IA de la plateforme BIAT API Governance.
Tu aides les équipes AP Management BIAT à comprendre et améliorer les specs OpenAPI.
Réponds en français, de façon concise et technique.
Stats globales : total=${total}, passed=${passed}, failed=${failed}, score_moyen=${(+avg).toFixed(1)}%
${this.audit ? `Audit sélectionné : ${this.audit.spec_id} | Score: ${this.audit.score ?? '—'}% | RL: ${this.audit.ai?.rl_final_score ?? this.audit.ai_analysis?.rl_final_score ?? 'N/A'}%` : ''}`;
  }

  private replaceMsg(placeholder: Message, newMsg: Message): void {
    const idx = this.messages.indexOf(placeholder);
    if (idx >= 0) { this.messages[idx] = newMsg; }
    else          { this.messages.push(newMsg);   }
  }

  private scrollBottom(): void {
    setTimeout(() => {
      const el = document.querySelector('.agent-messages');
      if (el) { el.scrollTop = el.scrollHeight; }
    }, 50);
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
  }

  toggle()   : void { this.isOpen = !this.isOpen; if (this.isOpen) { setTimeout(() => this.scrollBottom(), 100); } }
  clearChat(): void { this.welcome(); }

  getScoreColor(s: number): string {
    if (s >= 90) { return '#22c55e'; }
    if (s >= 70) { return '#f59e0b'; }
    return '#f43f5e';
  }
  private loadStatsFromApi(): void {
    this.http.get<any[]>(`${this.BASE}/results`).subscribe({
      next: (results) => {
        if (!results?.length) { return; }
        const passed = results.filter(r => ['PASSED','HUMAN_APPROVED'].includes(r.status)).length;
        const failed = results.filter(r => r.status === 'FAILED').length;
        const scores = results.map(r => +(r.score ?? 0)).filter(s => s > 0);
        const avg    = scores.length ? scores.reduce((a,b) => a+b, 0) / scores.length : 0;
        this.stats   = {
          total    : results.length,
          passed,
          failed,
          avg_score: avg.toFixed(1),
          approved : results.filter(r => r.status === 'HUMAN_APPROVED').length,
          rejected : results.filter(r => r.status === 'HUMAN_REJECTED').length,
        };
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  closeJiraTicket(placeholder: any, jiraKey: string, action: string): void {
    this.http.post<any>(`${this.BASE}/agent/jira/close`, {
      jira_key: jiraKey,
      audit_id: this.audit?.id,
      action,
      comment: `Ticket ${action === 'done' ? 'fermé' : 'mis à jour'} par l'admin BIAT depuis l'interface Governance.`
    }).subscribe({
      next: (res) => {
        this.replaceMsg(placeholder, {
          role: 'assistant',
          content: `Ticket ${res.key} ${action === 'done' ? 'fermé' : 'mis à jour'} avec succès. Voir : ${res.url}`,
          type: 'text'
        });
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.replaceMsg(placeholder, { role: 'assistant', content: 'Erreur fermeture ticket.', type: 'text' });
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }


}