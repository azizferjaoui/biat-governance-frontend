import { NgModule }             from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RoleGuard }            from './keycloak/role.guard';

import { ApiImportComponent }          from './pages/api-import/api-import.component';
import { ApiInventoryComponent }       from './pages/api-inventory/api-inventory.component';
import { AiSemanticAnalysisComponent } from './pages/ai-semantic-analysis/ai-semantic-analysis.component';
import { AdminComponent }              from './pages/admin/admin.component';
import { DeveloperComponent }              from './pages/developer/developer.component';


const routes: Routes = [
  {
    // Page principale — owner et user
    path      : '',
    component : ApiImportComponent,
    canActivate: [RoleGuard],
  },
  {
    // Inventory — owner seulement
    path      : 'inventory',
    component : ApiInventoryComponent,
    canActivate: [RoleGuard],
    data      : { roles: ['owner'] },
  },
  {
    // AI Semantic — owner seulement
    path      : 'ai-semantic',
    component : AiSemanticAnalysisComponent,
    canActivate: [RoleGuard],
    data      : { roles: ['owner'] },
  },
  {
  path: 'developer',
  component: DeveloperComponent,
  canActivate: [RoleGuard]
},
  {
    // Admin — owner seulement
    path      : 'admin',
    component : AdminComponent,
    canActivate: [RoleGuard],
    data      : { roles: ['owner'] },
  },
  { path: '**', redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}