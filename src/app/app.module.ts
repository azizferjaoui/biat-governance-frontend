import { APP_INITIALIZER, NgModule }             from '@angular/core';
import { BrowserModule }                          from '@angular/platform-browser';
import { FormsModule }                            from '@angular/forms';
import { HTTP_INTERCEPTORS, HttpClientModule }    from '@angular/common/http';
import { RouterModule }                           from '@angular/router';
import { CommonModule }                           from '@angular/common';
import { KeycloakAngularModule, KeycloakService } from 'keycloak-angular';

import { keycloakConfig }      from './keycloak/keycloak.config';
import { KeycloakInterceptor } from './keycloak/keycloak.interceptor';
import { AuthService }         from './keycloak/auth.service';
import { AgentService }        from './core/services/agent.service';
import { AiAgentComponent }    from './components/ai-agent/ai-agent.component';

import { AppRoutingModule }            from './app-routing.module';
import { AppComponent }                from './app.component';
import { SidebarComponent }            from './components/sidebar/sidebar.component';
import { NavbarComponent }             from './components/navbar/navbar.component';
import { ApiImportComponent }          from './pages/api-import/api-import.component';
import { ApiInventoryComponent }       from './pages/api-inventory/api-inventory.component';
import { AiSemanticAnalysisComponent } from './pages/ai-semantic-analysis/ai-semantic-analysis.component';
import { QdrantPanelComponent }        from './pages/api-inventory/qdrant-panel/qdrant-panel.component';
import { AdminComponent }              from './pages/admin/admin.component';
import { DeveloperComponent }          from './pages/developer/developer.component';
import {
  EvTypeLabelPipe, FindByIdPipe,
  AnyPendingPipe, CountPendingPipe
} from './pages/admin/admin.pipes';

function initKeycloak(kc: KeycloakService) {
  return () => kc.init({
    config     : keycloakConfig,
    initOptions: {
      onLoad              : 'check-sso',
      silentCheckSsoRedirectUri:
        window.location.origin + '/assets/silent-check-sso.html',
      checkLoginIframe    : false,
    },
    enableBearerInterceptor: false,
  });
}

@NgModule({
  declarations: [
    AppComponent, SidebarComponent, NavbarComponent,
    ApiImportComponent, ApiInventoryComponent,
    AiSemanticAnalysisComponent, QdrantPanelComponent,
    AdminComponent, AiAgentComponent,
    DeveloperComponent,
    EvTypeLabelPipe, FindByIdPipe, AnyPendingPipe, CountPendingPipe,
  ],
  imports: [
    BrowserModule, AppRoutingModule, RouterModule,
    HttpClientModule, FormsModule, CommonModule,
    KeycloakAngularModule,
  ],
  providers: [
    {
      provide   : APP_INITIALIZER,
      useFactory: initKeycloak,
      multi     : true,
      deps      : [KeycloakService],
    },
    {
      provide : HTTP_INTERCEPTORS,
      useClass: KeycloakInterceptor,
      multi   : true,
    },
    AuthService,
    AgentService,
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}