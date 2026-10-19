import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface K8sPort { host: number | null; container: number; }
interface K8sSvc {
  name: string;
  image: string;
  ports: K8sPort[];
  env: Array<{ k: string; v: string }>;
  restartPolicy: string;
}

const DEFAULT_INPUT = `services:
  web:
    image: nginx:1.25
    ports:
      - "8080:80"
    environment:
      - NODE_ENV=production
    restart: unless-stopped`;

@Component({
  selector: 'app-docker-compose-k8s-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './docker-compose-k8s-converter.component.html',
  styleUrl: './docker-compose-k8s-converter.component.scss',
})
export class DockerComposeK8sConverterComponent implements OnDestroy {
  readonly slug = 'docker-compose-k8s-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['docker-compose-generator', 'docker-run-compose-converter', 'curl-fetch-axios-converter'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly input = signal(DEFAULT_INPUT);
  readonly copied = signal(false);

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly services = computed<K8sSvc[] | null>(() => {
    try {
      const doc = this.parseYaml(this.input());
      const raw = (doc['services'] ?? doc) as Record<string, unknown>;
      if (!raw || typeof raw !== 'object') return null;
      const out: K8sSvc[] = [];
      for (const [name, cfg] of Object.entries(raw)) {
        if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) continue;
        const c = cfg as Record<string, unknown>;
        const image = typeof c['image'] === 'string' ? c['image'] : '';
        if (!image) continue;
        out.push({
          name: this.slugify(name),
          image,
          ports: this.parsePorts(c['ports']),
          env: this.parseEnv(c['environment']),
          restartPolicy: this.restartPolicy(typeof c['restart'] === 'string' ? c['restart'] : 'unless-stopped'),
        });
      }
      return out.length > 0 ? out : null;
    } catch {
      return null;
    }
  });

  readonly manifests = computed(() => {
    const svcs = this.services();
    if (!svcs) return '';
    return svcs.map((s) => this.deploymentYaml(s) + '\n---\n' + this.serviceYaml(s)).join('\n');
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

  setInput(v: string) { this.input.set(v); }

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
    const blob = new Blob([this.manifests()], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'k8s-manifests.yaml';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  loadSample(): void {
    this.input.set(DEFAULT_INPUT);
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

  private parseYaml(text: string): Record<string, unknown> {
    const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
    const root: Record<string, unknown> = {};
    const stack: Array<{ indent: number; node: Record<string, unknown> | unknown[] }> = [{ indent: -1, node: root }];
    const isListItemMap = (item: string) => /^[\w.-]+\s*:\s+.+/.test(item) && !/^['"]/.test(item);

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      if (line.trim() === '' || line.trim().startsWith('#')) continue;
      const indent = line.match(/^ */)?.[0].length ?? 0;
      const content = line.trim();
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack[stack.length - 1].node;

      if (content.startsWith('- ')) {
        const item = content.slice(2).trim();
        if (!Array.isArray(parent)) continue;
        parent.push(isListItemMap(item) ? item : this.unquote(item));
        continue;
      }
      const cut = content.indexOf(':');
      if (cut <= 0 || Array.isArray(parent)) continue;
      const key = content.slice(0, cut).trim();
      const rest = content.slice(cut + 1).trim();
      const obj = parent as Record<string, unknown>;
      if (rest === '') {
        const next = this.nextContentLine(lines, li);
        const child: Record<string, unknown> | unknown[] = next !== null && next.trim().startsWith('- ') ? [] : {};
        obj[key] = child;
        stack.push({ indent, node: child });
      } else {
        obj[key] = this.unquote(rest);
      }
    }
    return root;
  }

  private nextContentLine(lines: string[], from: number): string | null {
    for (let j = from + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      if (t !== '' && !t.startsWith('#')) return lines[j];
    }
    return null;
  }

  private unquote(v: string): string {
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1);
    }
    return v;
  }

  private parsePorts(raw: unknown): K8sPort[] {
    if (!Array.isArray(raw)) return [];
    const out: K8sPort[] = [];
    for (const item of raw) {
      if (typeof item !== 'string') continue;
      const parts = item.split(':').map((p) => p.trim());
      const nums = parts.map((p) => parseInt(p, 10)).filter((n) => Number.isFinite(n));
      if (nums.length === 0) continue;
      if (nums.length === 1) out.push({ host: null, container: nums[0] });
      else out.push({ host: nums[nums.length - 2], container: nums[nums.length - 1] });
    }
    return out;
  }

  private parseEnv(raw: unknown): Array<{ k: string; v: string }> {
    const out: Array<{ k: string; v: string }> = [];
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item !== 'string') continue;
        const eq = item.indexOf('=');
        if (eq > 0) out.push({ k: item.slice(0, eq).trim(), v: item.slice(eq + 1) });
      }
    } else if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        out.push({ k, v: String(v ?? '') });
      }
    }
    return out;
  }

  private restartPolicy(v: string): string {
    if (v === 'on-failure' || v === 'on_failure') return 'OnFailure';
    if (v === 'no' || v === 'false') return 'Never';
    return 'Always';
  }

  private slugify(v: string): string {
    return v.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
  }

  private q(v: string): string {
    return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  private deploymentYaml(s: K8sSvc): string {
    const lines = [
      'apiVersion: apps/v1',
      'kind: Deployment',
      'metadata:',
      `  name: ${s.name}`,
      'spec:',
      '  replicas: 1',
      '  selector:',
      '    matchLabels:',
      `      app: ${s.name}`,
      '  template:',
      '    metadata:',
      '      labels:',
      `        app: ${s.name}`,
      '    spec:',
      `      restartPolicy: ${s.restartPolicy}`,
      '      containers:',
      `        - name: ${s.name}`,
      `          image: ${s.image}`,
    ];
    if (s.ports.length > 0) {
      lines.push('          ports:');
      for (const p of s.ports) lines.push(`            - containerPort: ${p.container}`);
    }
    if (s.env.length > 0) {
      lines.push('          env:');
      for (const e of s.env) lines.push(`            - name: ${e.k}\n              value: ${this.q(e.v)}`);
    }
    return lines.join('\n');
  }

  private serviceYaml(s: K8sSvc): string {
    const lines = [
      'apiVersion: v1',
      'kind: Service',
      'metadata:',
      `  name: ${s.name}`,
      'spec:',
      '  selector:',
      `    app: ${s.name}`,
      '  type: ClusterIP',
    ];
    if (s.ports.length > 0) {
      lines.push('  ports:');
      for (const p of s.ports) {
        const svcPort = p.host ?? p.container;
        lines.push(`    - protocol: TCP\n      port: ${svcPort}\n      targetPort: ${p.container}`);
      }
    }
    return lines.join('\n');
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
