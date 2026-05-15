import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const AUTH_USERNAME = 'hr-admin';
const AUTH_PASSWORD = 'hr-df-2026!';
const STORAGE_KEY = 'auth_token';
const TOKEN_VALUE = 'authenticated';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly isAuthenticated = signal<boolean>(this.readToken());

  login(username: string, password: string): boolean {
    if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
      if (this.isBrowser) {
        localStorage.setItem(STORAGE_KEY, TOKEN_VALUE);
      }
      this.isAuthenticated.set(true);
      return true;
    }
    return false;
  }

  logout(): void {
    if (this.isBrowser) {
      localStorage.removeItem(STORAGE_KEY);
    }
    this.isAuthenticated.set(false);
  }

  private readToken(): boolean {
    if (!this.isBrowser) return false;
    return localStorage.getItem(STORAGE_KEY) === TOKEN_VALUE;
  }
}
