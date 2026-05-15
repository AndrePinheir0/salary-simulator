import { Routes } from '@angular/router';
import { SimulatorComponent } from './simulator/simulator.component';
import { LoginComponent } from './login/login.component';
import { authGuard } from './services/auth.guard';

export const routes: Routes = [
    { path: 'login', component: LoginComponent },
    { path: '', component: SimulatorComponent, canActivate: [authGuard] },
    { path: 'simulator', component: SimulatorComponent, canActivate: [authGuard] }
];
