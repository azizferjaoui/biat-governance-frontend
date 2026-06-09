import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AiSemanticAnalysisComponent } from './ai-semantic-analysis.component';

describe('AiSemanticAnalysisComponent', () => {
  let component: AiSemanticAnalysisComponent;
  let fixture: ComponentFixture<AiSemanticAnalysisComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AiSemanticAnalysisComponent]
    });
    fixture = TestBed.createComponent(AiSemanticAnalysisComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
