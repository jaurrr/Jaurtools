import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface RunSpec {
  name: string;
  image: string;
  command: string;
  ports: string[];
  env: string[];
  volumes: string[];
  restart: string;
  network: string;
  user: string;
  workdir: string;
  entrypoint: string;
  envFiles: string[];
}

const VALUE_FLAGS: Record<string, string> = {
  '--name': 'name',
  '-p': 'port', '--publish': 'port',
  '-e': 'env', '--env': 'env',
  '-v': 'volume', '--volume': 'volume',
  '--env-file': 'envFile',
  '-w': 'workdir', '--workdir': 'workdir',
  '-u': 'user', '--user': 'user',
  '--restart': 'restart',
  '--network': 'network',
  '--entrypoint': 'entrypoint',
  '--hostname': 'hostname', '--ip': 'ip', '--mac-address': 'mac',
};

const BOOL_FLAGS = new Set([
  '-d', '--detach', '-i', '--interactive', '-t', '--tty', '--rm',
  '--privileged', '--read-only', '-P', '--publish-all',
]);

const DEFAULT_INPUT = 'docker run -d --name web -p 8080:80 -e NODE_ENV=production -v /data:/data --restart unless-stopped nginx:1.25';

@Component({
  selector: 'app-docker-run-compose-converter',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './docker-run-compose-converter.component.html',
  styleUrl: './docker-run-compose-converter.component.scss',
})
export class DockerRunComposeConverterComponent implements OnDestroy {
  readonly slug = 'docker-run-compose-converter';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['docker-compose-generator', 'docker-compose-k8s-converter', 'curl-fetch-axios-converter'];

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

  readonly spec = computed<RunSpec | null>(() => this.parseRun(this.input()));

  readonly yaml = computed(() => {
    const s = this.spec();
    if (!s) return '';
    const lines = ['services:', `  ${s.name}:`, `    image: ${this.yamlScalar(s.image)}`];
    if (s.command) lines.push(`    command: ${this.yamlScalar(s.command)}`);
    if (s.entrypoint) lines.push(`    entrypoint: ${this.yamlScalar(s.entrypoint)}`);
    if (s.ports.length > 0) {
      lines.push('    ports:');
      for (const p of s.ports) lines.push(`      - "${p.replace(/"/g, '\\"')}"`);
    }
    if (s.env.length > 0) {
      lines.push('    environment:');
      for (const e of s.env) lines.push(`      - ${this.yamlScalar(e)}`);
    }
    if (s.envFiles.length > 0) {
      lines.push('    env_file:');
      for (const f of s.envFiles) lines.push(`      - ${this.yamlScalar(f)}`);
    }
    if (s.volumes.length > 0) {
      lines.push('    volumes:');
      for (const v of s.volumes) lines.push(`      - ${this.yamlScalar(v)}`);
    }
    if (s.workdir) lines.push(`    working_dir: ${this.yamlScalar(s.workdir)}`);
    if (s.user) lines.push(`    user: ${this.yamlScalar(s.user)}`);
    if (s.network) lines.push(`    networks:\n      - ${this.yamlScalar(s.network)}`);
    if (s.restart) lines.push(`    restart: ${s.restart}`);
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

  private tokenize(raw: string): string[] {
    const src = raw.replace(/\\\r?\n/g, ' ');
    const tokens: string[] = [];
    let cur = '';
    let quote: string | null = null;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quote) {
        if (ch === '\\' && i + 1 < src.length) { cur += src[i + 1]; i++; }
        else if (ch === quote) { quote = null; }
        else { cur += ch; }
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '\\' && i + 1 < src.length) {
        cur += src[i + 1]; i++;
      } else if (/\s/.test(ch)) {
        if (cur.length > 0) { tokens.push(cur); cur = ''; }
      } else {
        cur += ch;
      }
    }
    if (cur.length > 0) tokens.push(cur);
    return tokens;
  }

  private parseRun(raw: string): RunSpec | null {
    const tokens = this.tokenize(raw);
    if (tokens.length === 0) return null;
    let i = tokens[0] === 'docker' ? 1 : 0;
    if (tokens[i] === 'run') i++;

    const s: RunSpec = {
      name: '', image: '', command: '', ports: [], env: [], volumes: [],
      restart: '', network: '', user: '', workdir: '', entrypoint: '', envFiles: [],
    };
    const cmdParts: string[] = [];
    let imageFound = false;

    const takeValue = (): string => {
      i++;
      return i < tokens.length ? tokens[i] : '';
    };

    while (i < tokens.length) {
      const tok = tokens[i];
      if (tok === '--') { i++; continue; }
      if (!imageFound && tok.startsWith('-') && tok.length > 1) {
        let kind = '';
        let value = '';
        if (tok.startsWith('--')) {
          const eq = tok.indexOf('=');
          const flag = eq >= 0 ? tok.slice(0, eq) : tok;
          kind = VALUE_FLAGS[flag] ?? '';
          value = eq >= 0 ? tok.slice(eq + 1) : '';
          if (kind === '' && !BOOL_FLAGS.has(flag)) { i++; continue; }
          if (kind !== '' && value === '') value = takeValue();
        } else if (VALUE_FLAGS[tok]) {
          kind = VALUE_FLAGS[tok];
          value = takeValue();
        } else {
          const second = '-' + tok[1];
          if (VALUE_FLAGS[second]) {
            kind = VALUE_FLAGS[second];
            value = tok.length > 2 ? tok.slice(2) : takeValue();
          } else {
            i++;
            continue;
          }
        }
        switch (kind) {
          case 'name': s.name = value; break;
          case 'port': if (value) s.ports.push(value); break;
          case 'env': if (value) s.env.push(value); break;
          case 'volume': if (value) s.volumes.push(value); break;
          case 'envFile': if (value) s.envFiles.push(value); break;
          case 'workdir': s.workdir = value; break;
          case 'user': s.user = value; break;
          case 'restart': s.restart = value; break;
          case 'network': s.network = value; break;
          case 'entrypoint': s.entrypoint = value; break;
        }
      } else if (!imageFound) {
        s.image = tok;
        imageFound = true;
      } else {
        cmdParts.push(tok);
      }
      i++;
    }

    if (!imageFound) return null;
    s.command = cmdParts.join(' ');
    if (!s.name) s.name = this.nameFromImage(s.image);
    return s;
  }

  private nameFromImage(image: string): string {
    const noTag = image.split(':')[0];
    const last = noTag.split('/').pop() ?? 'app';
    const slug = last.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || 'app';
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
