import { Component, OnInit } from '@angular/core';
import { AuthService, BiatUser } from '../../keycloak/auth.service';

@Component({
  selector   : 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls  : ['./sidebar.component.css']
})
export class SidebarComponent implements OnInit {

  user: BiatUser | null = null;

  constructor(private auth: AuthService) {}

  async ngOnInit(): Promise<void> {
    this.user = await this.auth.loadUser();
  }

  isOwner(): boolean { return this.auth.isOwner(); }
}