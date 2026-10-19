import { APP_INITIALIZER } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { loadInitialDict } from './app/core/translate.service';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: APP_INITIALIZER, useFactory: loadInitialDict, multi: true },
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),
  ],
}).catch((err) => console.error(err));
