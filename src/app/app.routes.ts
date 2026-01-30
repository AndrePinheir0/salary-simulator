import { Routes } from '@angular/router';
import { SimulatorComponent } from './simulator/simulator.component';

export const routes: Routes = [
    { path: '', component: SimulatorComponent },
    { path: 'simulator', component: SimulatorComponent }
];
