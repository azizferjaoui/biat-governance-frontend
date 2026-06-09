import { Component, OnInit } from '@angular/core';
import { AuthService, BiatUser } from '../../keycloak/auth.service';

@Component({
  selector   : 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls  : ['./navbar.component.css']
})
export class NavbarComponent implements OnInit {

  user: BiatUser | null = null;

  constructor(private auth: AuthService) {}

  async ngOnInit(): Promise<void> {
    this.user = await this.auth.loadUser();
  }

  isOwner(): boolean { return this.auth.isOwner(); }

  logout(): void { this.auth.logout(); }
}