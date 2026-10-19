import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface ComposeService {
  id: number;
  name: string;
  image: string;
  ports: string;
  env: string;
  volumes: string;
  restart: string;
}

const RESTARTS = ['no', 'always', 'unless-stopped', 'on-failure'];

@Component({
  selector: 'app-docker-compose-generator',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './docker-compose-generator.component.html',
  styleUrl: './docker-compose-generator.component.scss',
})
export class DockerComposeGeneratorComponent implements OnDestroy {
  readonly slug = 'docker-compose-generator';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['docker-run-compose-converter', 'docker-compose-k8s-converter', 'curl-fetch-axios-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly services = signal<ComposeService[]>([
    { id: 1, name: 'web', image: 'nginx:1.25', ports: '8080:80', env: 'NODE_ENV=production', volumes: '', restart: 'unless-stopped' },
  ]);
  readonly restarts = RESTARTS;
  readonly copied = signal(false);

  private nextId = 2;
  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly yaml = computed(() => {
    const lines = ['services:'];
    for (const s of this.services()) {
      const name = this.slugify(s.name.trim()) || `service-${s.id}`;
      lines.push(`  ${name}:`);
      if (s.image.trim()) lines.push(`    image: ${this.yamlScalar(s.image.trim())}`);
      const ports = s.ports.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
      if (ports.length > 0) {
        lines.push('    ports:');
        for (const p of ports) lines.push(`      - "${p.replace(/"/g, '\\"')}"`);
      }
      const env = s.env.split('\n').map((e) => e.trim()).filter((e) => e.length > 0);
      if (env.length > 0) {
        lines.push('    environment:');
        for (const e of env) lines.push(`      - ${this.yamlScalar(e)}`);
      }
      const vols = s.volumes.split('\n').map((v) => v.trim()).filter((v) => v.length > 0);
      if (vols.length > 0) {
        lines.push('    volumes:');
        for (const v of vols) lines.push(`      - ${this.yamlScalar(v)}`);
      }
      if (s.restart && s.restart !== 'no') lines.push(`    restart: ${s.restart}`);
    }
    return lines.join('\n');
  });

  readonly faqs = computed(() => {
    this.translate.lang();
    const raw = this.lookup('faqs');
    return Array.isArray(raw) ? (raw as { q: string; a: string }[]) : [];
  });

  t(key: string): string {
    this.translate.lang();
    const raw = this.lookup(key);
    return typeof raw === 'string' ? raw : '';
  }

  tc(key: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`common.${key}`);
    return typeof raw === 'string' ? raw : '';
  }

  list(key: string): string[] {
    this.translate.lang();
    const raw = this.lookup(key);
    return Array.isArray(raw) ? (raw as string[]) : [];
  }

  relatedName(slug: string): string {
    this.translate.lang();
    const raw = (this.translate.t as unknown as (k: string) => unknown)(`${slug}.name`);
    return typeof raw === 'string' ? raw : slug;
  }

  addService() {
    const id = this.nextId++;
    this.services.update((ss) => [...ss, { id, name: `app${id}`, image: '', ports: '', env: '', volumes: '', restart: 'unless-stopped' }]);
  }

  removeService(id: number) {
    this.services.update((ss) => ss.filter((s) => s.id !== id));
  }

  updateService(id: number, patch: Partial<ComposeService>) {
    this.services.update((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  restartLabel(r: string): string {
    const camel = r.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    return this.t('labels.restart' + camel[0].toUpperCase() + camel.slice(1));
  }

  copyText(text: string) {
    const done = () => {
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.legacyCopy(text, done));
    } else {
      this.legacyCopy(text, done);
    }
  }

  download() {
    const blob = new Blob([this.yaml()], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'docker-compose.yml';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  ngOnDestroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private legacyCopy(text: string, done: () => void) {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    this.document.body.appendChild(ta);
    ta.select();
    try { this.document.execCommand('copy'); } catch { /* clipboard unavailable */ }
    ta.remove();
    done();
  }

  private slugify(v: string): string {
    return v.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
  }

  private yamlScalar(v: string): string {
    if (/[:\s#{}[\],&*?|<>=!%@`'"]/.test(v) || v === '' || /^(true|false|null|~|\d+(\.\d+)?)$/i.test(v)) {
      return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return v;
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }

  private updateSeo() {
    const lang = this.translate.lang();
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.meta.updateTag({ name: 'keywords', content: this.t('keywords') });
    this.setLink('canonical', `https://jaurtools.com/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
    }
  }

  private setLink(rel: string, href: string, hreflang?: string) {
    const head = this.document.head;
    const selector = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]:not([hreflang])`;
    let el = head.querySelector<HTMLLinkElement>(selector);
    if (!el) {
      el = this.document.createElement('link');
      el.rel = rel;
      if (hreflang) el.hreflang = hreflang;
      head.appendChild(el);
    }
    el.href = href;
  }

  private refreshJsonLd() {
    this.jsonLdEl?.remove();
    const mainEntity = this.faqs().map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    }));
    const json = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity,
    }).replace(/</g, '\\u003c');
    const el = this.document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = json;
    this.document.head.appendChild(el);
    this.jsonLdEl = el;
  }
}
