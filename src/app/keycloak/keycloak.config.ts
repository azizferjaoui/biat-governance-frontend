import { KeycloakConfig } from 'keycloak-js';   // ← keycloak-js pas keycloak-angular

export const keycloakConfig: KeycloakConfig = {
  url     : 'http://localhost:8080',
  realm   : 'BIAT_IT',
  clientId: 'biat-ui'
};

export type BiatRole = 'owner' | 'user';

export const PERMISSIONS: Record<BiatRole, string[]> = {
  owner: ['view', 'approve', 'reject', 'feedback', 'manage_rl'],
  user : ['view', 'submit'],
};