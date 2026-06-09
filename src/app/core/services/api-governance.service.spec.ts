import { TestBed } from '@angular/core/testing';

import { ApiGovernanceService } from './api-governance.service';

describe('ApiGovernanceService', () => {
  let service: ApiGovernanceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApiGovernanceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
