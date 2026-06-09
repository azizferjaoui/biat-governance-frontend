import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiGovernanceService {

  private BASE = 'http://localhost:8000';

  constructor(private http: HttpClient) {}

  // ─── Audit existant (INCHANGE) ───────────────────────────────────────────
  importFromUrl(url: string): Observable<any> {
    return this.http.post(`${this.BASE}/import/url`, { url });
  }

  importFile(file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post(`${this.BASE}/import/file`, fd);
  }

  getAuditResult(taskId: number): Observable<any> {
    return this.http.get(`${this.BASE}/results/${taskId}`);
  }

  getAuditDetails(taskId: number): Observable<any> {
    return this.http.get(`${this.BASE}/results/${taskId}`);
  }

  getAllResults(): Observable<any> {
    return this.http.get(`${this.BASE}/results`);
  }

  // ─── HITL — nouveaux endpoints ───────────────────────────────────────────
  submitReview(apiId: number, action: 'approve' | 'reject',
               userId: string, comment?: string): Observable<any> {
    return this.http.post(`${this.BASE}/hitl/review`,
      { api_id: apiId, action, user_id: userId, comment });
  }

  submitScoreFeedback(apiId: number,
                      expert: 'design' | 'security' | 'chairman',
                      delta: 1 | -1, userId: string,
                      comment?: string): Observable<any> {
    return this.http.post(`${this.BASE}/hitl/feedback/score`,
      { api_id: apiId, expert, score_delta: delta, user_id: userId, comment });
  }

  submitCorrection(apiId: number, correctedYaml: string,
                   userId: string, comment?: string): Observable<any> {
    return this.http.post(`${this.BASE}/hitl/correction`,
      { api_id: apiId, corrected_yaml: correctedYaml, user_id: userId, comment });
  }

  getExpertWeights(): Observable<any> {
    return this.http.get(`${this.BASE}/hitl/weights`);
  }

  getFeedbackHistory(expert: string, windowDays: number = 30): Observable<any> {
    return this.http.get(`${this.BASE}/hitl/feedback/history/${expert}?window_days=${windowDays}`);
  }

  simulateWeights(design: number, security: number, chairman: number): Observable<any> {
    return this.http.get(
      `${this.BASE}/hitl/simulate/weights?design=${design}&security=${security}&chairman=${chairman}`
    );
  }

  // ─── Qdrant — nouveaux endpoints ─────────────────────────────────────────
  getQdrantInfo(): Observable<any> {
    return this.http.get(`${this.BASE}/qdrant/info`);
  }

  resetQdrantCollection(): Observable<any> {
    return this.http.delete(`${this.BASE}/qdrant/reset`);
  }

  deleteQdrantApi(apiName: string): Observable<any> {
    return this.http.delete(`${this.BASE}/qdrant/api/${encodeURIComponent(apiName)}`);
  }

  searchQdrant(specText: string, limit: number = 5): Observable<any> {
    return this.http.post(`${this.BASE}/qdrant/search`, { spec_text: specText, limit });
  }

  checkDuplicate(specText: string): Observable<any> {
    return this.http.post(`${this.BASE}/qdrant/check-duplicate`, { spec_text: specText });
  }

  getQdrantAuditLogs(limit: number = 50): Observable<any> {
    return this.http.get(`${this.BASE}/qdrant/audit-logs?limit=${limit}`);
  }

  getQdrantAuditStats(): Observable<any> {
    return this.http.get(`${this.BASE}/qdrant/audit-stats`);
  }
}