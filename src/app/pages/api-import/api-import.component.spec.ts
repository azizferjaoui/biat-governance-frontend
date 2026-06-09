import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ApiImportComponent } from './api-import.component';

describe('ApiImportComponent', () => {
  let component: ApiImportComponent;
  let fixture: ComponentFixture<ApiImportComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ApiImportComponent]
    });
    fixture = TestBed.createComponent(ApiImportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
