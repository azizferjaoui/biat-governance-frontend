import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-qdrant-panel',
  templateUrl: './qdrant-panel.component.html',
  styleUrls: ['./qdrant-panel.component.css']
})
export class QdrantPanelComponent implements OnInit {
  collectionInfo: any = null;
  loadingInfo = false;
  auditLogs: any[] = [];
  auditStats: any = null;
  loadingLogs = false;
  checkSpecText = '';
  checkResult: any = null;
  checkLoading = false;
  thresholds = { block: 0.98, warn: 0.80, rag: 0.70 };
  activeTab = 'stats';
  private API = 'http://localhost:8000/qdrant';

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadInfo();
    this.loadAuditStats();
  }

  loadInfo(): void {
    this.loadingInfo = true;
    this.http.get(this.API + '/info').subscribe({
      next: (d: any) => {
        this.collectionInfo = d;
        if (d.thresholds) { this.thresholds = d.thresholds; }
        this.loadingInfo = false;
        this.cdr.detectChanges();
      },
      error: () => { this.loadingInfo = false; }
    });
  }

  resetCollection(): void {
    if (!confirm('Supprimer tous les vecteurs ?')) { return; }
    this.http.delete(this.API + '/reset').subscribe({
      next: () => { this.loadInfo(); this.loadAuditStats(); },
      error: () => {}
    });
  }

  loadAuditStats(): void {
    this.http.get(this.API + '/audit-stats').subscribe({
      next: (d: any) => { this.auditStats = d; this.cdr.detectChanges(); },
      error: () => {}
    });
  }

  loadLogs(): void {
    this.loadingLogs = true;
    this.http.get(this.API + '/audit-logs?limit=30').subscribe({
      next: (d: any) => {
        this.auditLogs = d.logs;
        this.loadingLogs = false;
        this.cdr.detectChanges();
      },
      error: () => { this.loadingLogs = false; }
    });
  }

  selectTab(tab: string): void {
    this.activeTab = tab;
    if (tab === 'logs' && this.auditLogs.length === 0) { this.loadLogs(); }
  }

  checkDuplicate(): void {
    if (!this.checkSpecText.trim()) { return; }
    this.checkLoading = true;
    this.checkResult = null;
    this.http.post(this.API + '/check-duplicate', { spec_text: this.checkSpecText }).subscribe({
      next: (d: any) => {
        this.checkResult = d;
        this.checkLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.checkLoading = false; }
    });
  }

  getLevelColor(l: string): string {
    const m: any = { BLOCKED: '#f43f5e', WARNING: '#f59e0b', RAG_MATCH: '#3b82f6', NONE: '#22c55e' };
    return m[l] || '#8b949e';
  }

  getLevelLabel(l: string): string {
    const m: any = { BLOCKED: 'Bloque', WARNING: 'Avertissement', RAG_MATCH: 'RAG', NONE: 'OK' };
    return m[l] || l;
  }

  getResultColor(r: string): string {
    const m: any = { BLOCKED: '#f43f5e', WARNED: '#f59e0b', RAG_ENRICHED: '#3b82f6', STORED: '#22c55e', NO_MATCH: '#8b949e' };
    return m[r] || '#8b949e';
  }

  formatDate(iso: string): string {
    if (!iso) { return '—'; }
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  }

  getSimPercent(s: number | null): number {
    return s ? Math.min(100, Math.round(s * 100)) : 0;
  }

  getThresholdPercent(v: number): number {
    return Math.round(v * 100);
  }
}