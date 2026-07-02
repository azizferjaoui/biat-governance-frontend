import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../keycloak/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-developer',
  templateUrl: './developer.component.html',
  styleUrls: ['./developer.component.css']
})
export class DeveloperComponent implements OnInit {

  API_URL    = 'http://localhost:8000';
  myAudits   : any[] = [];
  selectedAudit: any = null;
  filterStatus = '';
  searchQuery  = '';
  username     = '';

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    const user = await this.auth.loadUser();
    this.username = user.username;
    this.loadMyAudits();
  }

  loadMyAudits(): void {
    this.http.get<any[]>(`${this.API_URL}/results`).subscribe({
      next: (data) => {
        // Filtrer par username du développeur connecté
        this.myAudits = data
          .filter(a => !a.source || a.source === this.username
                    || a.source === 'API-Pipeline')
          .map(a => ({
            ...a,
            ai         : a.ai_analysis || null,
            qdrant     : a.ai_analysis?.qdrant || null,
            ia_eval    : a.ai_analysis?.ia_eval || null,
            corrected_yaml: a.ai_analysis?.corrected_yaml || null,
          }))
          .sort((a:any,b:any) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
        this.cdr.detectChanges();
      }
    });
  }

  get filteredAudits(): any[] {
    return this.myAudits.filter(a => {
      const ms = !this.filterStatus || a.status === this.filterStatus;
      const mq = !this.searchQuery  ||
                 a.spec_id?.toLowerCase().includes(this.searchQuery.toLowerCase());
      return ms && mq;
    });
  }

  selectAudit(a: any): void { this.selectedAudit = a; }

  countByStatus(s: string): number {
    return this.myAudits.filter(a => a.status === s).length;
  }

  getAvgScore(): string {
    const scores = this.myAudits.map(a => a.score).filter(s => s != null);
    if (!scores.length) return '—';
    return Math.round(scores.reduce((a:number,b:number)=>a+b,0)/scores.length).toString();
  }

  getUserInitials(): string {
    return this.username ? this.username.substring(0,2).toUpperCase() : 'DV';
  }

  getTestSummary(): any {
    if (!this.selectedAudit) return null;
    const t = this.selectedAudit.ai?.testing_pipeline
           || this.selectedAudit.ai_analysis?.testing_pipeline;
    return t?.summary || null;
  }

  getTestStatus(): string {
    const t = this.selectedAudit?.ai?.testing_pipeline
           || this.selectedAudit?.ai_analysis?.testing_pipeline;
    return t?.status || 'NOT_TESTED';
  }

  downloadYaml(): void {
    const yaml = this.selectedAudit?.corrected_yaml
              || this.selectedAudit?.ai?.corrected_yaml || '';
    if (!yaml) return;
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = (this.selectedAudit.spec_id || 'spec') + '_corrected.yaml';
    a.click();
    URL.revokeObjectURL(url);
  }

  downloadPdf(): void {
    if (!this.selectedAudit) return;
    const url = `${this.API_URL}/agent/report/${this.selectedAudit.id}`;
    this.http.get(url, { responseType: 'arraybuffer' }).subscribe({
      next: (buffer) => {
        const blob    = new Blob([buffer], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        const a       = document.createElement('a');
        a.href        = blobUrl;
        a.download    = `rapport_${this.selectedAudit.id}.pdf`;
        a.click();
        URL.revokeObjectURL(blobUrl);
      }
    });
  }

  logout(): void { this.auth.logout(); }

  // ── Helpers UI ──────────────────────────────────────────────
  getStatusColor(s: string): string {
    const m: any = {
      PASSED:'#22c55e', FAILED:'#f43f5e', HUMAN_APPROVED:'#3b82f6',
      PUBLISHED:'#00f2ff', PENDING:'#f59e0b', HUMAN_REJECTED:'#8b949e'
    };
    return m[s] || '#8b949e';
  }

  getStatusIcon(s: string): string {
    const m: any = {
      PASSED:'✅', FAILED:'❌', HUMAN_APPROVED:'🔵',
      PUBLISHED:'🌐', PENDING:'⏳', HUMAN_REJECTED:'🚫'
    };
    return m[s] || '•';
  }

  getScoreColor(score: number): string {
    if (!score) return '#8b949e';
    return score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#f43f5e';
  }

  getQdrantColor(level: string): string {
    const m: any = {
      BLOCKED:'#f43f5e', WARNING:'#f59e0b',
      RAG_ONLY:'#3b82f6', NONE:'#22c55e'
    };
    return m[level] || '#8b949e';
  }

  formatDate(ts: string): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('fr-FR', {
      day:'2-digit', month:'2-digit',
      hour:'2-digit', minute:'2-digit'
    });
  }
}
