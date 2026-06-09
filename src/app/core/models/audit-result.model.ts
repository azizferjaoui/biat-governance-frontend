export interface SpectralIssue {
  code: string;
  message: string;
  severity: number;
  path: string[];
  source?: string;
  range: {
    start: { line: number; character: number };
    end:   { line: number; character: number };
  };
}

export interface AuditResult {
  id: number;
  spec_id: string;
  source: string;
  status: string;        // 'PENDING' | 'PASSED' | 'FAILED'
  score: number;
  issues_count: number;
  issues_detail: SpectralIssue[] | string | null;  // ✅ ajouté
  timestamp: string;
}