import { Injectable }                             from '@angular/core';
import { ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { KeycloakAuthGuard, KeycloakService }     from 'keycloak-angular';

@Injectable({ providedIn: 'root' })
export class RoleGuard extends KeycloakAuthGuard {

  constructor(
    protected override router: Router,
    protected keycloak: KeycloakService
  ) {
    super(router, keycloak);
  }

  async isAccessAllowed(route: ActivatedRouteSnapshot): Promise<boolean | UrlTree> {

    // Pas connecté → login Keycloak
    if (!this.authenticated) {
      await this.keycloak.login({ redirectUri: window.location.href });
      return false;
    }

    const required: string[] = route.data['roles'] ?? [];
    const isOwner = this.roles.includes('owner');
    const path    = route.routeConfig?.path ?? '';

    // Redirection automatique après login selon le rôle
    if (path === '' && isOwner) {
      // Owner atterrit sur '/' → rediriger vers /admin
      return this.router.parseUrl('/admin');
    }

    if (path === 'admin' && !isOwner) {
      // User essaie d'accéder à /admin → rediriger vers /
      return this.router.parseUrl('/');
    }

    // Vérification rôle requis par la route
    if (required.length > 0 && !required.some(r => this.roles.includes(r))) {
      return this.router.parseUrl('/');
    }

    return true;
  }
}