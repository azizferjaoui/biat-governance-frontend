import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-api-inventory',
  templateUrl: './api-inventory.component.html',
  styleUrls: ['./api-inventory.component.css']
})
export class ApiInventoryComponent implements OnInit {

  allApis: any[]           = [];
  filteredApis: any[]      = [];
  loadingInventory         = false;
  totalApis: number | null = null;
  searchQuery              = '';
  statusFilter             = '';
  selectedApi: any         = null;
  feedbackMessage          = '';
  feedbackSuccess          = false;

  private BASE = 'http://localhost:8000';

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.loadInventory(); }

  loadInventory(): void {
    this.loadingInventory = true;
    this.http.get<any[]>(`${this.BASE}/results`).subscribe({
      next: (data) => {
        this.allApis          = data;
        this.totalApis        = data.length;
        this.filteredApis     = [...data];
        this.loadingInventory = false;
        this.cdr.detectChanges();
      },
      error: () => { this.loadingInventory = false; }
    });
  }

  onSearchChange(value: string): void {
    this.searchQuery = value;
    this.applyFilters();
  }

  onStatusChange(value: string): void {
    this.statusFilter = value;
    this.applyFilters();
  }

  applyFilters(): void {
    const q = this.searchQuery.toLowerCase().trim();
    this.filteredApis = this.allApis.filter(api => {
      const matchName   = !q || api.spec_id?.toLowerCase().includes(q);
      const matchStatus = !this.statusFilter || api.status === this.statusFilter;
      return matchName && matchStatus;
    });
  }

  selectApi(api: any): void {
    this.selectedApi     = api;
    this.feedbackMessage = '';
    this.http.get<any>(`${this.BASE}/results/${api.id}`).subscribe({
      next: (full) => { this.selectedApi = full; this.cdr.detectChanges(); },
      error: () => {}
    });
  }

  approveApi(api: any): void {
    this.http.post(`${this.BASE}/hitl/review`,
      { api_id: api.id, action: 'approve', user_id: 'admin' }
    ).subscribe({
      next: () => {
        this.feedbackMessage = `API #${api.id} approuvee`;
        this.feedbackSuccess = true;
        api.status           = 'HUMAN_APPROVED';
        this.cdr.detectChanges();
      },
      error: (e: any) => {
        this.feedbackMessage = 'Erreur : ' + (e.error?.detail || e.message);
        this.feedbackSuccess = false;
        this.cdr.detectChanges();
      }
    });
  }

  rejectApi(api: any): void {
    this.http.post(`${this.BASE}/hitl/review`,
      { api_id: api.id, action: 'reject', user_id: 'admin' }
    ).subscribe({
      next: () => {
        this.feedbackMessage = `API #${api.id} rejetee`;
        this.feedbackSuccess = false;
        api.status           = 'HUMAN_REJECTED';
        this.cdr.detectChanges();
      },
      error: (e: any) => {
        this.feedbackMessage = 'Erreur : ' + (e.error?.detail || e.message);
        this.feedbackSuccess = false;
        this.cdr.detectChanges();
      }
    });
  }

  sendFeedback(api: any, expert: 'design' | 'security' | 'chairman', delta: 1 | -1): void {
    this.http.post(`${this.BASE}/hitl/feedback/score`, {
      api_id: api.id, expert, score_delta: delta, user_id: 'admin'
    }).subscribe({
      next: () => {
        const sign = delta > 0 ? '+1' : '-1';
        this.feedbackMessage = `Feedback ${sign} sur ${expert} — poids mis a jour`;
        this.feedbackSuccess = true;
        this.cdr.detectChanges();
        setTimeout(() => { this.feedbackMessage = ''; this.cdr.detectChanges(); }, 3000);
      },
      error: (e: any) => {
        this.feedbackMessage = 'Erreur : ' + (e.error?.detail || e.message);
        this.feedbackSuccess = false;
        this.cdr.detectChanges();
      }
    });
  }

  getScoreColor(score: number | null): string {
    if (score === null || score === undefined) return '#8b949e';
    if (score >= 90) return '#22c55e';
    if (score >= 70) return '#f59e0b';
    return '#f43f5e';
  }

  formatDate(ts: string): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }
}