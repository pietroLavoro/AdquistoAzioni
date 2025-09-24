import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { Chart, registerables } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import zoomPlugin from 'chartjs-plugin-zoom';

Chart.register(...registerables, annotationPlugin, zoomPlugin);
bootstrapApplication(App, appConfig)
  .catch(err => console.error(err));
