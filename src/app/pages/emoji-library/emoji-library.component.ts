import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';

type EmojiCat = 'smileys' | 'hands' | 'hearts' | 'nature' | 'food' | 'objects' | 'symbols';

interface EmojiItem {
  e: string;
  en: string;
  hi: string;
  ar: string;
  cat: EmojiCat;
}

const CATS: EmojiCat[] = ['smileys', 'hands', 'hearts', 'nature', 'food', 'objects', 'symbols'];

const EMOJIS: EmojiItem[] = [
  { e: '😀', en: 'grinning face', hi: 'मुस्कुराता चेहरा', ar: 'وجه مبتسم', cat: 'smileys' },
  { e: '😁', en: 'beaming face', hi: 'खिलखिलाता चेहरा', ar: 'وجه متوهج', cat: 'smileys' },
  { e: '😂', en: 'laughing with tears', hi: 'हँसता चेहरा', ar: 'وجه يضحك بدموع', cat: 'smileys' },
  { e: '🤣', en: 'rolling on the floor laughing', hi: 'ठहाके मारता चेहरा', ar: 'وجه يضحك بشدة', cat: 'smileys' },
  { e: '😊', en: 'smiling face', hi: 'मुस्कान भरा चेहरा', ar: 'وجه مبتسم بلطف', cat: 'smileys' },
  { e: '😍', en: 'heart eyes', hi: 'दिल वाली आँखें', ar: 'وجه بعيون قلوب', cat: 'smileys' },
  { e: '😎', en: 'cool face', hi: 'कूल चेहरा', ar: 'وجه رائع', cat: 'smileys' },
  { e: '🥳', en: 'party face', hi: 'पार्टी चेहरा', ar: 'وجه الاحتفال', cat: 'smileys' },
  { e: '😴', en: 'sleeping face', hi: 'सोता चेहरा', ar: 'وجه نائم', cat: 'smileys' },
  { e: '😢', en: 'crying face', hi: 'रोता चेहरा', ar: 'وجه يبكي', cat: 'smileys' },
  { e: '😡', en: 'angry face', hi: 'गुस्सैल चेहरा', ar: 'وجه غاضب', cat: 'smileys' },
  { e: '🤔', en: 'thinking face', hi: 'सोचता चेहरा', ar: 'وجه يفكر', cat: 'smileys' },
  { e: '👍', en: 'thumbs up', hi: 'अंगूठा ऊपर', ar: 'إبهام لأعلى', cat: 'hands' },
  { e: '👎', en: 'thumbs down', hi: 'अंगूठा नीचे', ar: 'إبهام لأسفل', cat: 'hands' },
  { e: '👏', en: 'clapping hands', hi: 'ताली बजाते हाथ', ar: 'يدان تصفقان', cat: 'hands' },
  { e: '🙏', en: 'folded hands', hi: 'जुड़े हाथ', ar: 'يدان مضمومتان', cat: 'hands' },
  { e: '💪', en: 'flexed biceps', hi: 'ताकतवर बाजू', ar: 'عضلة قوية', cat: 'hands' },
  { e: '🤝', en: 'handshake', hi: 'हाथ मिलाना', ar: 'مصافحة', cat: 'hands' },
  { e: '✌️', en: 'victory hand', hi: 'जीत का निशान', ar: 'علامة النصر', cat: 'hands' },
  { e: '🤞', en: 'crossed fingers', hi: 'क्रॉस उंगलियाँ', ar: 'أصابع متقاطعة', cat: 'hands' },
  { e: '👌', en: 'OK hand', hi: 'ओके हाथ', ar: 'يد موافق', cat: 'hands' },
  { e: '🖐️', en: 'raised hand', hi: 'उठा हुआ हाथ', ar: 'يد مرفوعة', cat: 'hands' },
  { e: '👋', en: 'waving hand', hi: 'हिलता हाथ', ar: 'يد تلوح', cat: 'hands' },
  { e: '👊', en: 'fist bump', hi: 'मुक्का', ar: 'قبضة', cat: 'hands' },
  { e: '❤️', en: 'red heart', hi: 'लाल दिल', ar: 'قلب أحمر', cat: 'hearts' },
  { e: '🧡', en: 'orange heart', hi: 'नारंगी दिल', ar: 'قلب برتقالي', cat: 'hearts' },
  { e: '💛', en: 'yellow heart', hi: 'पीला दिल', ar: 'قلب أصفر', cat: 'hearts' },
  { e: '💚', en: 'green heart', hi: 'हरा दिल', ar: 'قلب أخضر', cat: 'hearts' },
  { e: '💙', en: 'blue heart', hi: 'नीला दिल', ar: 'قلب أزرق', cat: 'hearts' },
  { e: '💜', en: 'purple heart', hi: 'बैंगनी दिल', ar: 'قلب بنفسجي', cat: 'hearts' },
  { e: '🖤', en: 'black heart', hi: 'काला दिल', ar: 'قلب أسود', cat: 'hearts' },
  { e: '🤍', en: 'white heart', hi: 'सफेद दिल', ar: 'قلب أبيض', cat: 'hearts' },
  { e: '💔', en: 'broken heart', hi: 'टूटा दिल', ar: 'قلب مكسور', cat: 'hearts' },
  { e: '💕', en: 'two hearts', hi: 'दो दिल', ar: 'قلبان', cat: 'hearts' },
  { e: '💖', en: 'sparkling heart', hi: 'चमकता दिल', ar: 'قلب متلألئ', cat: 'hearts' },
  { e: '💘', en: 'heart with arrow', hi: 'तीर वाला दिल', ar: 'قلب بسهم', cat: 'hearts' },
  { e: '🌞', en: 'sun', hi: 'सूरज', ar: 'شمس', cat: 'nature' },
  { e: '🌙', en: 'moon', hi: 'चाँद', ar: 'قمر', cat: 'nature' },
  { e: '⭐', en: 'star', hi: 'तारा', ar: 'نجمة', cat: 'nature' },
  { e: '🌈', en: 'rainbow', hi: 'इंद्रधनुष', ar: 'قوس قزح', cat: 'nature' },
  { e: '🔥', en: 'fire', hi: 'आग', ar: 'نار', cat: 'nature' },
  { e: '💧', en: 'water drop', hi: 'पानी की बूंद', ar: 'قطرة ماء', cat: 'nature' },
  { e: '🌸', en: 'cherry blossom', hi: 'चेरी ब्लॉसम', ar: 'زهرة الكرز', cat: 'nature' },
  { e: '🌹', en: 'rose', hi: 'गुलाब', ar: 'وردة', cat: 'nature' },
  { e: '🍀', en: 'four-leaf clover', hi: 'चार पत्ती तिपतिया', ar: 'نبتة الحظ', cat: 'nature' },
  { e: '🌊', en: 'wave', hi: 'लहर', ar: 'موجة', cat: 'nature' },
  { e: '❄️', en: 'snowflake', hi: 'बर्फ का फूल', ar: 'ندفة ثلج', cat: 'nature' },
  { e: '⚡', en: 'lightning', hi: 'बिजली', ar: 'برق', cat: 'nature' },
  { e: '🍎', en: 'apple', hi: 'सेब', ar: 'تفاحة', cat: 'food' },
  { e: '🍕', en: 'pizza', hi: 'पिज़्ज़ा', ar: 'بيتزا', cat: 'food' },
  { e: '🍔', en: 'burger', hi: 'बर्गर', ar: 'برجر', cat: 'food' },
  { e: '🍩', en: 'donut', hi: 'डोनट', ar: 'دونات', cat: 'food' },
  { e: '☕', en: 'coffee', hi: 'कॉफ़ी', ar: 'قهوة', cat: 'food' },
  { e: '🍵', en: 'tea', hi: 'चाय', ar: 'شاي', cat: 'food' },
  { e: '🥛', en: 'milk', hi: 'दूध', ar: 'حليب', cat: 'food' },
  { e: '🍪', en: 'cookie', hi: 'कुकी', ar: 'بسكويت', cat: 'food' },
  { e: '🍉', en: 'watermelon', hi: 'तरबूज', ar: 'بطيخ', cat: 'food' },
  { e: '🍇', en: 'grapes', hi: 'अंगूर', ar: 'عنب', cat: 'food' },
  { e: '🥗', en: 'salad', hi: 'सलाद', ar: 'سلطة', cat: 'food' },
  { e: '🍰', en: 'cake slice', hi: 'केक का टुकड़ा', ar: 'قطعة كيك', cat: 'food' },
  { e: '⚽', en: 'football', hi: 'फुटबॉल', ar: 'كرة قدم', cat: 'objects' },
  { e: '🏏', en: 'cricket bat and ball', hi: 'क्रिकेट बैट-बॉल', ar: 'مضرب وكرة الكريكيت', cat: 'objects' },
  { e: '🎮', en: 'game controller', hi: 'गेम कंट्रोलर', ar: 'يد تحكم', cat: 'objects' },
  { e: '🎧', en: 'headphones', hi: 'हेडफ़ोन', ar: 'سماعات', cat: 'objects' },
  { e: '📚', en: 'books', hi: 'किताबें', ar: 'كتب', cat: 'objects' },
  { e: '✈️', en: 'airplane', hi: 'हवाई जहाज़', ar: 'طائرة', cat: 'objects' },
  { e: '🚗', en: 'car', hi: 'कार', ar: 'سيارة', cat: 'objects' },
  { e: '💡', en: 'light bulb', hi: 'बल्ब', ar: 'مصباح', cat: 'objects' },
  { e: '🔑', en: 'key', hi: 'चाबी', ar: 'مفتاح', cat: 'objects' },
  { e: '🎁', en: 'gift', hi: 'उपहार', ar: 'هدية', cat: 'objects' },
  { e: '📷', en: 'camera', hi: 'कैमरा', ar: 'كاميرا', cat: 'objects' },
  { e: '🎵', en: 'music note', hi: 'संगीत नोट', ar: 'نوتة موسيقية', cat: 'objects' },
  { e: '✅', en: 'check mark', hi: 'सही का निशान', ar: 'علامة صح', cat: 'symbols' },
  { e: '❌', en: 'cross mark', hi: 'गलत का निशान', ar: 'علامة خطأ', cat: 'symbols' },
  { e: '⚠️', en: 'warning', hi: 'चेतावनी', ar: 'تحذير', cat: 'symbols' },
  { e: '💯', en: 'hundred points', hi: 'सौ अंक', ar: 'مائة نقطة', cat: 'symbols' },
  { e: '♻️', en: 'recycling', hi: 'रीसाइक्लिंग', ar: 'إعادة تدوير', cat: 'symbols' },
  { e: '🆕', en: 'NEW button', hi: 'नया बटन', ar: 'زر جديد', cat: 'symbols' },
  { e: '🆓', en: 'FREE button', hi: 'मुफ्त बटन', ar: 'زر مجاني', cat: 'symbols' },
  { e: '⏰', en: 'alarm clock', hi: 'अलार्म घड़ी', ar: 'منبه', cat: 'symbols' },
  { e: '📌', en: 'pushpin', hi: 'पिन', ar: 'دبوس', cat: 'symbols' },
  { e: '🔔', en: 'bell', hi: 'घंटी', ar: 'جرس', cat: 'symbols' },
  { e: '💬', en: 'speech bubble', hi: 'बातचीत बुलबुला', ar: 'فقاعة كلام', cat: 'symbols' },
  { e: '❓', en: 'question mark', hi: 'प्रश्न चिह्न', ar: 'علامة استفهام', cat: 'symbols' },
];

@Component({
  selector: 'app-emoji-library',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink],
  templateUrl: './emoji-library.component.html',
  styleUrl: './emoji-library.component.scss',
})
export class EmojiLibraryComponent implements OnDestroy {
  readonly slug = 'emoji-library';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['poster-maker', 'invitation-maker', 'online-notepad'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly query = signal('');
  readonly activeCat = signal<'all' | EmojiCat>('all');
  readonly copied = signal<string | null>(null);

  readonly cats = CATS;

  private jsonLdEl: HTMLScriptElement | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const cat = this.activeCat();
    return EMOJIS.filter((item) => {
      if (cat !== 'all' && item.cat !== cat) return false;
      if (!q) return true;
      return (
        item.en.toLowerCase().includes(q) ||
        item.hi.includes(this.query().trim()) ||
        item.ar.includes(this.query().trim())
      );
    });
  });

  readonly total = EMOJIS.length;

  setQuery(v: string): void {
    this.query.set(v.slice(0, 60));
  }

  setCat(c: 'all' | EmojiCat): void {
    this.activeCat.set(c);
  }

  emojiName(item: EmojiItem): string {
    const lang = this.translate.lang();
    return lang === 'hi' ? item.hi : lang === 'ar' ? item.ar : item.en;
  }

  catName(c: EmojiCat): string {
    return this.t('categories.' + c);
  }

  copy(item: EmojiItem): void {
    const done = (): void => {
      this.copied.set(item.e);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(null), 1500);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(item.e).then(done).catch(() => this.fallbackCopy(item.e, done));
    } else {
      this.fallbackCopy(item.e, done);
    }
  }

  private fallbackCopy(text: string, done: () => void): void {
    const ta = this.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    this.document.body.appendChild(ta);
    ta.select();
    try {
      this.document.execCommand('copy');
    } catch {
      // clipboard unavailable; nothing more we can do
    }
    this.document.body.removeChild(ta);
    done();
  }

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

  ngOnDestroy(): void {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.jsonLdEl?.remove();
    this.document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((el) => el.remove());
  }

  private lookup(key: string): unknown {
    return (this.translate.t as unknown as (k: string) => unknown)(`${this.slug}.${key}`);
  }


  private updateSeo(): void {
    const lang = this.translate.lang();
    this.pageTitle.setTitle(this.t('metaTitle'));
    this.meta.updateTag({ name: 'description', content: this.t('metaDescription') });
    this.meta.updateTag({ name: 'keywords', content: this.t('keywords') });
    this.setLink('canonical', `https://jaurtools.com/${lang}/${this.slug}`);
    for (const l of ['en', 'hi', 'ar']) {
      this.setLink('alternate', `https://jaurtools.com/${l}/${this.slug}`, l);
    }
  }

  private setLink(rel: string, href: string, hreflang?: string): void {
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

  private refreshJsonLd(): void {
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
