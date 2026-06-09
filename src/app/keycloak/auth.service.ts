import { Injectable } from '@angular/core';
import { KeycloakService } from 'keycloak-angular';
import { BiatRole, PERMISSIONS } from './keycloak.config';

export interface BiatUser {
  id      : string;
  username: string;
  email   : string;
  role    : BiatRole;
  token   : string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {

  private _user: BiatUser | null = null;

  constructor(private kc: KeycloakService) {}

  async loadUser(): Promise<BiatUser> {
    if (this._user) { return this._user; }
    const profile = await this.kc.loadUserProfile();
    const roles   = this.kc.getUserRoles(true);
    const token   = await this.kc.getToken();
    const role: BiatRole = roles.includes('owner') ? 'owner' : 'user';
    this._user = {
      id      : profile.id       ?? '',
      username: profile.username ?? 'inconnu',
      email   : profile.email    ?? '',
      role,
      token,
    };
    console.log(`[Auth] ${this._user.username} connecté — rôle : ${role}`);
    return this._user;
  }

  getUser():  BiatUser | null { return this._user; }
  isOwner():  boolean { return this._user?.role === 'owner'; }
  isUser():   boolean { return this._user?.role === 'user'; }

  can(permission: string): boolean {
    const role = this._user?.role ?? 'user';
    return PERMISSIONS[role]?.includes(permission) ?? false;
  }

  async getToken(): Promise<string> {
    await this.kc.updateToken(30);
    return this.kc.getToken();
  }

  logout(): void {
    this._user = null;
    this.kc.logout('http://localhost:4200');
  }
}
