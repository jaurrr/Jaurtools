import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

interface TLV {
  cls: number;
  constructed: boolean;
  tag: number;
  value: Uint8Array;
  children: TLV[];
}

interface CertExt {
  name: string;
  critical: boolean;
  detail: string;
}

interface CertInfo {
  version: number;
  serial: string;
  sigAlg: string;
  issuer: string;
  subject: string;
  notBefore: string;
  notAfter: string;
  daysLeft: number;
  expired: boolean;
  pubkeyAlg: string;
  pubkeyDetail: string;
  san: string[];
  extensions: CertExt[];
  selfSigned: boolean;
}

const SIG_ALGS: Record<string, string> = {
  '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
  '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
  '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
  '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
  '1.2.840.113549.1.1.10': 'rsassaPss',
  '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256',
  '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384',
  '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
  '1.2.840.10045.4.1': 'ecdsa-with-SHA1',
  '1.3.101.112': 'Ed25519',
  '1.3.101.113': 'Ed448',
};

const PUBKEY_ALGS: Record<string, string> = {
  '1.2.840.113549.1.1.1': 'RSA',
  '1.2.840.10045.2.1': 'EC',
  '1.2.840.10043.4.1': 'DSA',
  '1.3.101.112': 'Ed25519',
  '1.3.101.113': 'Ed448',
};

const CURVES: Record<string, string> = {
  '1.2.840.10045.3.1.7': 'P-256 (secp256r1)',
  '1.3.132.0.34': 'P-384 (secp384r1)',
  '1.3.132.0.35': 'P-521 (secp521r1)',
  '1.3.132.0.10': 'secp256k1',
};

const ATTR_NAMES: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '2.5.4.5': 'serialNumber',
  '2.5.4.4': 'SN',
  '2.5.4.42': 'GN',
  '1.2.840.113549.1.9.1': 'emailAddress',
  '0.9.2342.19200300.100.1.25': 'DC',
};

const EXT_NAMES: Record<string, string> = {
  '2.5.29.17': 'Subject Alternative Name',
  '2.5.29.19': 'Basic Constraints',
  '2.5.29.15': 'Key Usage',
  '2.5.29.37': 'Extended Key Usage',
  '2.5.29.14': 'Subject Key Identifier',
  '2.5.29.35': 'Authority Key Identifier',
  '2.5.29.31': 'CRL Distribution Points',
  '2.5.29.32': 'Certificate Policies',
  '1.3.6.1.5.5.7.1.1': 'Authority Information Access',
  '1.3.6.1.4.1.11129.2.4.2': 'CT Precertificate SCTs',
};

const EKU_NAMES: Record<string, string> = {
  '1.3.6.1.5.5.7.3.1': 'TLS Web Server Authentication',
  '1.3.6.1.5.5.7.3.2': 'TLS Web Client Authentication',
  '1.3.6.1.5.5.7.3.3': 'Code Signing',
  '1.3.6.1.5.5.7.3.4': 'Email Protection',
  '1.3.6.1.5.5.7.3.8': 'Time Stamping',
  '1.3.6.1.5.5.7.3.9': 'OCSP Signing',
};

const KEY_USAGE_BITS = [
  'Digital Signature', 'Non Repudiation', 'Key Encipherment', 'Data Encipherment',
  'Key Agreement', 'Key Cert Sign', 'CRL Sign', 'Encipher Only', 'Decipher Only',
];

@Component({
  selector: 'app-ssl-certificate-decoder',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './ssl-certificate-decoder.component.html',
  styleUrl: './ssl-certificate-decoder.component.scss',
})
export class SslCertificateDecoderComponent implements OnDestroy {
  readonly slug = 'ssl-certificate-decoder';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['sri-hash-generator', 'permissions-policy-generator', 'dmarc-record-generator'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly pemInput = signal('');
  readonly fingerprint = signal('');

  private fpSeq = 0;
  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
    effect(() => {
      const der = this.derBytes();
      this.computeFingerprint(der);
    });
  }

  private async computeFingerprint(der: Uint8Array | null) {
    const mySeq = ++this.fpSeq;
    if (!der) {
      this.fingerprint.set('');
      return;
    }
    try {
      const subtle = (crypto as Crypto & { subtle?: SubtleCrypto }).subtle;
      if (!subtle) return;
      const digest = await subtle.digest('SHA-256', der as unknown as ArrayBuffer);
      if (mySeq !== this.fpSeq) return;
      const hex = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
        .join(':');
      this.fingerprint.set(hex);
    } catch {
      /* ignore */
    }
  }

  private parseTLV(bytes: Uint8Array, offset: number): { tlv: TLV; next: number } {
    const b0 = bytes[offset];
    const cls = (b0 >> 6) & 3;
    const constructed = ((b0 >> 5) & 1) === 1;
    let tag = b0 & 31;
    let pos = offset + 1;
    if (tag === 31) {
      tag = 0;
      let b = 0;
      do {
        b = bytes[pos++];
        tag = (tag << 7) | (b & 127);
      } while (b & 128);
    }
    let len = bytes[pos++];
    if (len & 128) {
      const n = len & 127;
      len = 0;
      for (let i = 0; i < n; i++) len = (len << 8) | bytes[pos++];
    }
    const value = bytes.subarray(pos, pos + len);
    const tlv: TLV = { cls, constructed, tag, value, children: [] };
    if (constructed) {
      let p = 0;
      while (p < value.length) {
        const r = this.parseTLV(value, p);
        tlv.children.push(r.tlv);
        p = r.next;
      }
    }
    return { tlv, next: pos + len };
  }

  private oidBytesToString(bytes: Uint8Array): string {
    if (bytes.length === 0) return '';
    const parts = [Math.floor(bytes[0] / 40), bytes[0] % 40];
    let v = 0;
    for (let i = 1; i < bytes.length; i++) {
      v = (v << 7) | (bytes[i] & 127);
      if (!(bytes[i] & 128)) {
        parts.push(v);
        v = 0;
      }
    }
    return parts.join('.');
  }

  private hexColon(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join(':');
  }

  private derTime(bytes: Uint8Array, tag: number): number {
    const s = String.fromCharCode(...bytes);
    let y: number, rest: string;
    if (tag === 23) {
      const yy = Number(s.slice(0, 2));
      y = yy >= 50 ? 1900 + yy : 2000 + yy;
      rest = s.slice(2);
    } else {
      y = Number(s.slice(0, 4));
      rest = s.slice(4);
    }
    const mo = Number(rest.slice(0, 2)) - 1;
    const d = Number(rest.slice(2, 4));
    const h = Number(rest.slice(4, 6));
    const mi = Number(rest.slice(6, 8));
    const sec = Number(rest.slice(8, 10));
    return Date.UTC(y, mo, d, h, mi, sec);
  }

  private fmtDate(ms: number): string {
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  }

  private strValue(t: TLV): string {
    if (t.tag === 30) {
      const v = t.value;
      let s = '';
      for (let i = 0; i + 1 < v.length; i += 2) s += String.fromCharCode((v[i] << 8) | v[i + 1]);
      return s;
    }
    return String.fromCharCode(...t.value);
  }

  private formatName(nameTlv: TLV): string {
    const parts: string[] = [];
    for (const rdn of nameTlv.children) {
      for (const atv of rdn.children) {
        if (atv.children.length >= 2 && atv.children[0].tag === 6) {
          const oid = this.oidBytesToString(atv.children[0].value);
          const label = ATTR_NAMES[oid] ?? oid;
          parts.push(`${label}=${this.strValue(atv.children[1])}`);
        }
      }
    }
    return parts.join(', ');
  }

  readonly derBytes = computed((): Uint8Array | null => {
    const pem = this.pemInput().trim();
    if (!pem) return null;
    const m = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/.exec(pem);
    if (!m) return null;
    const b64 = m[1].replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length % 4 !== 0) return null;
    try {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return null;
    }
  });

  readonly info = computed((): { ok: true; cert: CertInfo } | { ok: false } | null => {
    const der = this.derBytes();
    if (der === null) return this.pemInput().trim() ? { ok: false } : null;
    try {
      const root = this.parseTLV(der, 0).tlv;
      if (root.tag !== 16 || root.children.length < 3) return { ok: false };
      const tbs = root.children[0];
      let idx = 0;
      let version = 1;
      if (tbs.children[idx].cls === 2 && tbs.children[idx].tag === 0) {
        version = (tbs.children[idx].children[0]?.value[0] ?? 0) + 1;
        idx++;
      }
      const serialRaw = tbs.children[idx++].value;
      const serialTrimmed = serialRaw[0] === 0 ? serialRaw.subarray(1) : serialRaw;
      const serial = this.hexColon(serialTrimmed);
      const sigOid = this.oidBytesToString(tbs.children[idx++].children[0].value);
      const issuer = this.formatName(tbs.children[idx++]);
      const validity = tbs.children[idx++];
      const notBefore = this.derTime(validity.children[0].value, validity.children[0].tag);
      const notAfter = this.derTime(validity.children[1].value, validity.children[1].tag);
      const subject = this.formatName(tbs.children[idx++]);
      const spki = tbs.children[idx++];
      const pubAlgOid = this.oidBytesToString(spki.children[0].children[0].value);
      let pubkeyDetail = '';
      const pubAlg = PUBKEY_ALGS[pubAlgOid] ?? pubAlgOid;
      if (pubAlgOid === '1.2.840.113549.1.1.1' && spki.children.length > 1) {
        const bitStr = spki.children[1].value;
        const rsaSeq = this.parseTLV(bitStr.subarray(1), 0).tlv;
        const mod = rsaSeq.children[0]?.value ?? new Uint8Array(0);
        const bits = (mod[0] === 0 ? mod.length - 1 : mod.length) * 8;
        pubkeyDetail = `${bits}-bit`;
      } else if (pubAlgOid === '1.2.840.10045.2.1' && spki.children[0].children.length > 1) {
        const curveOid = this.oidBytesToString(spki.children[0].children[1].value);
        pubkeyDetail = CURVES[curveOid] ?? curveOid;
      }

      const san: string[] = [];
      const extensions: CertExt[] = [];
      const extWrapper = tbs.children.find((c) => c.cls === 2 && c.tag === 3);
      if (extWrapper && extWrapper.children[0]) {
        for (const e of extWrapper.children[0].children) {
          const oid = this.oidBytesToString(e.children[0].value);
          let critical = false;
          let valTlv = e.children[1];
          if (valTlv.tag === 1) {
            critical = valTlv.value[0] !== 0;
            valTlv = e.children[2];
          }
          const inner = this.parseTLV(valTlv.value, 0).tlv;
          const name = EXT_NAMES[oid] ?? oid;
          let detail = '';
          if (oid === '2.5.29.17') {
            for (const g of inner.children) {
              if (g.cls === 2 && (g.tag === 1 || g.tag === 2 || g.tag === 6)) {
                san.push(String.fromCharCode(...g.value));
              } else if (g.cls === 2 && g.tag === 7 && g.value.length === 4) {
                san.push(Array.from(g.value).join('.'));
              }
            }
            detail = san.join(', ');
          } else if (oid === '2.5.29.19') {
            const ca = inner.children[0]?.tag === 1 ? inner.children[0].value[0] !== 0 : false;
            const pathLen = inner.children[1]?.tag === 2 ? inner.children[1].value[0] : null;
            detail = `CA:${ca ? 'TRUE' : 'FALSE'}` + (pathLen !== null ? `, pathlen:${pathLen}` : '');
          } else if (oid === '2.5.29.15') {
            const bits = inner.value;
            const names: string[] = [];
            for (let i = 0; i < KEY_USAGE_BITS.length; i++) {
              const byteIdx = 1 + Math.floor(i / 8);
              const bitIdx = 7 - (i % 8);
              if (byteIdx < bits.length && (bits[byteIdx] & (1 << bitIdx))) names.push(KEY_USAGE_BITS[i]);
            }
            detail = names.join(', ');
          } else if (oid === '2.5.29.37') {
            detail = inner.children
              .map((o) => EKU_NAMES[this.oidBytesToString(o.value)] ?? this.oidBytesToString(o.value))
              .join(', ');
          } else if (oid === '2.5.29.14') {
            detail = this.hexColon(inner.value);
          } else if (oid === '2.5.29.35') {
            const kid = inner.children.find((c) => c.cls === 2 && c.tag === 0);
            detail = kid ? this.hexColon(kid.value) : '';
          }
          extensions.push({ name, critical, detail });
        }
      }

      const daysLeft = Math.floor((notAfter - Date.now()) / 86400000);
      const cert: CertInfo = {
        version,
        serial,
        sigAlg: SIG_ALGS[sigOid] ?? sigOid,
        issuer,
        subject,
        notBefore: this.fmtDate(notBefore),
        notAfter: this.fmtDate(notAfter),
        daysLeft,
        expired: notAfter < Date.now(),
        pubkeyAlg: pubAlg,
        pubkeyDetail,
        san,
        extensions,
        selfSigned: issuer !== '' && issuer === subject,
      };
      return { ok: true, cert };
    } catch {
      return { ok: false };
    }
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

  setPem(v: string) { this.pemInput.set(v); }
  clearInput() { this.pemInput.set(''); }

  ngOnDestroy() {
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
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
