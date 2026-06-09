import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'evTypeLabel' })
export class EvTypeLabelPipe implements PipeTransform {
  transform(type: string): string {
    const map: Record<string, string> = {
      audit_update    : 'AUDIT',
      qdrant_result   : 'QDRANT',
      moe_result      : 'MoE',
      analysis_complete: 'COMPLET',
      hitl_action     : 'HITL',
      feedback_recorded: 'FEEDBACK',
      weights_update  : 'POIDS RL',
    };
    return map[type] || type.toUpperCase();
  }
}

@Pipe({ name: 'findById' })
export class FindByIdPipe implements PipeTransform {
  transform(list: any[], id: number): any {
    return list?.find(a => a.id === id) || null;
  }
}

@Pipe({ name: 'anyPending' })
export class AnyPendingPipe implements PipeTransform {
  transform(list: any[]): boolean {
    return list?.some(a => a.status === 'FAILED' &&
      !['HUMAN_APPROVED','HUMAN_REJECTED'].includes(a.status)) ?? false;
  }
}

@Pipe({ name: 'countPending' })
export class CountPendingPipe implements PipeTransform {
  transform(list: any[]): number {
    return list?.filter(a => a.status === 'FAILED').length ?? 0;
  }
}
