import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./kafka/kafka-workspace').then((module) => module.KafkaWorkspace),
  },
];
