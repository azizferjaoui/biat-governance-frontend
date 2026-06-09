import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AgentService {
  private auditSubject  = new BehaviorSubject<any>(null);
  private statsSubject  = new BehaviorSubject<any>(null);
  private weightSubject = new BehaviorSubject<any>(null);

  audit$   = this.auditSubject.asObservable();
  stats$   = this.statsSubject.asObservable();
  weights$ = this.weightSubject.asObservable();

  setAudit  (a: any) { this.auditSubject.next(a);   }
  setStats  (s: any) { this.statsSubject.next(s);   }
  setWeights(w: any) { this.weightSubject.next(w);  }
}