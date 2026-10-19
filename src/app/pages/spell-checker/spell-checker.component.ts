import { Component, computed, effect, inject, signal, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '../../core/translate.service';
import { IconComponent } from '../../components/icon/icon.component';
import { MicroRatingComponent } from '../../components/micro-rating/micro-rating.component';

// Compact bundled dictionary of common English words. Runs fully client-side
// with no downloads. Names, technical terms and rare words may be flagged.
const DICTIONARY_WORDS = (
  'the of and to a in is that it was for on are as with his they i at be this have from or one had by word ' +
  'but not what all were we when your can said there use an each which she do how their if will up other about out ' +
  'many then them these so some her would make like him into time has look two more write go see number no way ' +
  'could people my than first water been call who oil its now find long down day did get come made may part over ' +
  'new sound take only little work know place year live me back give most very after thing our just name good ' +
  'sentence man think say great where help through much before line right too mean old any same tell boy follow ' +
  'came want show also around form three small set put end does another well large must big even such because ' +
  'turn here why ask went men read need land different home us move try kind hand picture again change off play ' +
  'spell air away animal house point page letter mother answer found study still learn should plant cover food ' +
  'sun four between state keep eye never last let thought city tree cross farm hard start might story saw left ' +
  'late run while press close night real life few north open seem together next white children begin got walk ' +
  'example ease paper group always music those both mark often under never during however must without high every ' +
  'near add food between own below country plant last school father keep tree never start city earth eye light ' +
  'thought head under story saw left few while along might close something seem next hard open example begin life ' +
  'always those both paper together got group often run important until children side feet car mile night walk ' +
  'white sea began grow took river four carry state once book hear stop without second late miss idea enough eat ' +
  'face watch far india sea dry second learn plant cover food sun four between state keep eye never last let ' +
  'thought city tree cross farm hard start might story saw left late run while press close night real life few ' +
  'north open seem together next white children begin got walk example ease paper group always music those both ' +
  'mark often under never during however also around came show form three small set put end does another well ' +
  'large must big even such because turn here why ask went men read need land different home move try kind hand ' +
  'picture again change off play spell air away animal house point page letter mother answer found study still ' +
  'learn should plant cover food sun four between state keep eye never last let thought city tree cross farm ' +
  'hard start might story saw left late run while press close night real life few north open seem together next ' +
  'white children begin got walk example ease paper group always music those both mark often under never during ' +
  'about better bring carry clean cut done draw drink eight fall far full hold hot hurt laugh light pick queen ' +
  'quick quite rain ready red room seven sing sit six sleep small snow stand table ten thank third those today ' +
  'top total touch tried voice visit wait war watch water wheel where whether which while white whole whose woman ' +
  'women wonder wood word work world worry worth would write wrong wrote yard year yellow yes yesterday yet ' +
  'young your zero able above accept across act action actor after again age ago agree ahead air allow almost ' +
  'alone along aloud already although always among amount angel anger angle angry ankle apart apple apply ' +
  'argue arise arm army around arrange arrive arrow art aside ask asleep attack attend author avoid awake ' +
  'award aware away awful baby back badge bag bake balance ball balloon bank banner bar barely basis bath ' +
  'battle beach beard beast beat beauty became become bed beef before began behave behind being belief ' +
  'believe bell belong below belt bench berry beside best better between beyond bicycle bid bike bill ' +
  'binary bird birth black blade blame blank blast blend bless blind block blood bloom board boast boat ' +
  'body boil bold bonus book boost booth border born borrow boss bottle bottom bound bowl box brake ' +
  'branch brand brave bread break breakfast brick bridge brief bright bring broad broke broken bronze ' +
  'broom brother brown brush build built bunch bundle burden burn burst bury bus bush busy buyer cabin ' +
  'cable cake calm camel came camp canal cancel candy cannon cannot canoe canvas canyon capable ' +
  'capital captain car carbon card care career cargo carry carve case cash catch cause cease ' +
  'celebrate cell center central century certain chain chair chalk chance change chant chaos ' +
  'charge charm chart chase cheap check cheek cheer cheese chest chicken chief child choice ' +
  'choose chord churn church cinema circle claim clamp class clean clear clerk clever click ' +
  'client cliff climb clock clone close cloth cloud clown club coach coast coat cocoa coffee ' +
  'coil coin cold collar collect color column comb comic comma commit common company ' +
  'compare compass complete complex comply concert condo confer confirm Congo connect ' +
  'consider consist contact contain content contest context continue contract contrast ' +
  'control convene cook cool copy coral cord core corn corner correct cost cotton ' +
  'couch could count county court cover crack craft crash crate crawl crazy cream ' +
  'create credit creek crew cricket crime crisp critic cross crowd crown crude ' +
  'cruel crush cry crystal cube culture cupboard cure curious curl current ' +
  'curtain curve cushion custom cute cycle dad daily dairy damage dance ' +
  'danger dark dash data date dawn daybreak deal death debate debt ' +
  'decade decide deck declare defeat defend define degree delay deliver ' +
  'delta demand dense dental deny depart depend depth deputy derive ' +
  'describe desert deserve design desire desk detail detect deter ' +
  'develop device devote diary digit dinner direct dirty disco ' +
  'discount discover discuss disease dish disk dismiss display ' +
  'distant ditch dive divide dizzy doctor dodge doing dollar ' +
  'domain donor done doom door double doubt dough dove down ' +
  'draft drain drama drank drape draw drawer dread dream dress ' +
  'dried drift drill drink drive drone drop drove drown drug ' +
  'drum drunk dryer dual duck due duet dumb dump dune during ' +
  'dust duty eager eagle early earn earth ease easily east ' +
  'easy echo edge edit educate effect effort eight elbow ' +
  'elder elect electric eleven elite else email embark ' +
  'empty enact endow enemy energy engage engine enjoy ' +
  'enough enter entire entry equal equip error essay ' +
  'estate event every evoke exact excel except excess ' +
  'exchange excite excuse exist exit expand expect ' +
  'expense expert expire explain explore export ' +
  'expose express extend extra fabric face fact ' +
  'factor fade fail faint fair faith falcon fall ' +
  'false fancy fatal father fault favor feast ' +
  'fence ferry fever fiber field fifty fight ' +
  'figure file fill film final finance finger ' +
  'finish fire firm first fiscal fish flame ' +
  'flash flask flat fleet flesh float ' +
  'flock flood floor flour fluid focus ' +
  'fog force forge forget fork forty ' +
  'forum found frame frank fraud ' +
  'fresh friend fringe front frost ' +
  'fruit frustrate fuel fully funny ' +
  'gadget gain galaxy game gamma ' +
  'garage garden garlic gasp gate ' +
  'gather gauge gaze gentle ghost ' +
  'giant gift ginger glad glance ' +
  'glare glass glide globe gloom ' +
  'glory glove glow glue goal ' +
  'goat going gold gone good ' +
  'goose gorge grade grain ' +
  'grand grant grape graph ' +
  'grasp grass grave great ' +
  'green greet grief grill ' +
  'grind groan groom gross ' +
  'group grove grow guard ' +
  'guess guest guide habit ' +
  'hair half handy happy ' +
  'harbor harsh haste hasty ' +
  'hatch haunt haven hazard ' +
  'health heap heart hearth ' +
  'hearty heat hedge height ' +
  'hello helm help hence ' +
  'herb herd hero hidden ' +
  'hide hinge hip hire ' +
  'hobby hoist hold holiday ' +
  'hollow holy homage honor ' +
  'hood hope horn horse ' +
  'host hotel hound house ' +
  'hover howdy human humble ' +
  'humor hundred hungry ' +
  'hunter hurry hurt ideal ' +
  'ignore ill image imply ' +
  'import inbox indeed ' +
  'index indoor infant ' +
  'inlay inlet input ' +
  'inquire insert inset ' +
  'inside insta instant ' +
  'instead intake ' +
  'intend invest invite ' +
  'invoice involve iron ' +
  'island issue ivory ' +
  'jacket jam jar ' +
  'jeans jelly jewel ' +
  'job joint joke ' +
  'jolly journal journey ' +
  'judge juice jumbo ' +
  'jungle junior junk ' +
  'keep kernel kettle ' +
  'keynote kidney kilo ' +
  'kind kitten knee ' +
  'knife knock known ' +
  'label labor laden ' +
  'ladle lady lager ' +
  'lake lamp lance ' +
  'land lapse large ' +
  'laser latch later ' +
  'laugh launch layer ' +
  'learn least leave ' +
  'ledge legal lemon ' +
  'level lever liar ' +
  'libel light limit ' +
  'linen liner liquid ' +
  'list lively liver ' +
  'llama local lodge ' +
  'logic lonely loser ' +
  'lotus lounge loved ' +
  'lover lower loyal ' +
  'lucky lunar lunch ' +
  'lunge lung magic ' +
  'magnet mail major ' +
  'maker mango march ' +
  'margin marry marsh ' +
  'mason match mate ' +
  'matrix matter mayor ' +
  'meadow meant medal ' +
  'media melon melt ' +
  'member memory mend ' +
  'mental menu merge ' +
  'merit merry metal ' +
  'meter method metro ' +
  'micro middle midst ' +
  'might migrate mild ' +
  'milk mill mimic ' +
  'mince mind miner ' +
  'minor mint minus ' +
  'minute miracle ' +
  'mirror mist mix ' +
  'mobile model modem ' +
  'modern molar money ' +
  'month moral motor ' +
  'motto mound mount ' +
  'mourn mouse mouth ' +
  'movie mower muddy ' +
  'muffin mural music ' +
  'musical mute mutual ' +
  'nadir naive nasty ' +
  'naval navel neigh ' +
  'nerve never noble ' +
  'noise nominate none ' +
  'noodle north notch ' +
  'noted novel novice ' +
  'number nurse ocean ' +
  'offer often olive ' +
  'onion opera optic ' +
  'orbit order organ ' +
  'other otter ought ' +
  'ounce outer output ' +
  'oven owner oxide ' +
  'ozone pagan paint ' +
  'palace panel panic ' +
  'pants papal paper ' +
  'parade parcel pardon ' +
  'parent paris park ' +
  'parlor party pasta ' +
  'paste patch patio ' +
  'patrol pause payer ' +
  'peace peach pearl ' +
  'pedal penal pencil ' +
  'penny people pepper ' +
  'perch perfect peril ' +
  'phone photo phrase ' +
  'piano picket piece ' +
  'pilot pinch pine ' +
  'pious pirate pitch ' +
  'pizza place plaid ' +
  'plain plane plank ' +
  'plant plate plaza ' +
  'plead plead point ' +
  'polar polish porch ' +
  'poser pound power ' +
  'praise pray preach ' +
  'prefer press price ' +
  'pride prime print ' +
  'prior prize probe ' +
  'prone proof prose ' +
  'proud prove proxy ' +
  'pulse punch pupil ' +
  'purge purse push ' +
  'quack quail quake ' +
  'qualm quark quart ' +
  'queen query quest ' +
  'queue quick quiet ' +
  'quilt quite quota ' +
  'quote rabbit radar ' +
  'radio reign raise ' +
  'rally ranch range ' +
  'rapid ratio reach ' +
  'react ready realm ' +
  'rebel rebut recall ' +
  'receipt receive recent ' +
  'recipe reckon reclaim ' +
  'recur refer refine ' +
  'reflect reform regal ' +
  'regard region reign ' +
  'relax relay relic ' +
  'rely remain remark ' +
  'remedy renew rental ' +
  'repay repeat repel ' +
  'reply report rescue ' +
  'reside resign resin ' +
  'resist resolve resort ' +
  'rest result retire ' +
  'retort return reveal ' +
  'review reward rhino ' +
  'rhyme rider ridge ' +
  'rifle right rigid ' +
  'rigor rinse risen ' +
  'risky rival river ' +
  'roach roast robin ' +
  'robot rocky rogue ' +
  'roman roster rotor ' +
  'rough round route ' +
  'royal rubber rudder ' +
  'ruin rule rumor ' +
  'rural rusty saber ' +
  'saddle safari saint ' +
  'salad salon salsa ' +
  'salty salute salvo ' +
  'samba sanction sandy ' +
  'sane satin sauce ' +
  'saute scale scalp ' +
  'scar scare scarf ' +
  'scene scent scope ' +
  'score scorn scout ' +
  'scrap screw scrub ' +
  'seal seam search ' +
  'season second secret ' +
  'sector sedan seed ' +
  'seize select seller ' +
  'senate senior sense ' +
  'serene serial serve ' +
  'settle sever shade ' +
  'shadow shake shame ' +
  'shape share shark ' +
  'sharp shave sheaf ' +
  'sheen sheep sheer ' +
  'sheet shelf shell ' +
  'shelve shift shine ' +
  'shiny shirt shock ' +
  'shoddy shoot shore ' +
  'short shout shove ' +
  'shown shred shrug ' +
  'sick siege sight ' +
  'sigma sign silky ' +
  'silly silver since ' +
  'sincere sinew sing ' +
  'siren sister sixth ' +
  'sixty skate sketch ' +
  'skill skin skirt ' +
  'sleep slice slick ' +
  'slide slime sling ' +
  'slope small smart ' +
  'smash smell smile ' +
  'smoke smooth snack ' +
  'snake sneak sneeze ' +
  'snore snorkel snout ' +
  'snowy sober social ' +
  'socket soda solar ' +
  'solid solve sonic ' +
  'soothe sorry sound ' +
  'south space spare ' +
  'spark speak spear ' +
  'special speech speed ' +
  'spell spend spice ' +
  'spider spill spine ' +
  'spiral spirit splash ' +
  'split spoke sponge ' +
  'spoon sport spray ' +
  'sprint squad stable ' +
  'stack staff stage ' +
  'stain stair stake ' +
  'stamp stand stare ' +
  'start state static ' +
  'statue steadfast ' +
  'steak steal steam ' +
  'steel steep steer ' +
  'stereo stern stick ' +
  'stiff still sting ' +
  'stock stone stood ' +
  'stool store storm ' +
  'story stove strap ' +
  'straw stray streak ' +
  'stream street stress ' +
  'stretch strict stride ' +
  'strike string stripe ' +
  'strive stroke stroll ' +
  'strong struggle ' +
  'stucco study stuff ' +
  'stump stunt style ' +
  'suave subject sugar ' +
  'suite sulky sully ' +
  'summer summon sunny ' +
  'superb supper supply ' +
  'surely surf surge ' +
  'surge swamp swan ' +
  'swarm sway swear ' +
  'sweat sweep sweet ' +
  'swell swift swim ' +
  'swine swing swirl ' +
  'switch swoop sword ' +
  'syrup table tackle ' +
  'taint taken tally ' +
  'tango tapestry taper ' +
  'tardy target tariff ' +
  'taste taught tawny ' +
  'teach tease tempo ' +
  'tenet tense tenor ' +
  'tension tenth tenure ' +
  'tepid term terra ' +
  'testy thank their ' +
  'theme there thick ' +
  'thief thigh thing ' +
  'think third thirst ' +
  'thorn those three ' +
  'threw throb throw ' +
  'thumb thump thunder ' +
  'thursday ticket tidal ' +
  'tiger tight timer ' +
  'timid tipple title ' +
  'toast today token ' +
  'tonal tongue tonic ' +
  'tooth topic torch ' +
  'torso total touch ' +
  'tough towel tower ' +
  'trace track trade ' +
  'trail train trait ' +
  'tramp trash travel ' +
  'tread treat treaty ' +
  'tremor trench trend ' +
  'triad trial tribe ' +
  'trice trick trigger ' +
  'trill trim trio ' +
  'triple troop trout ' +
  'truce truck truly ' +
  'trump trunk truss ' +
  'trust truth trying ' +
  'tulip tumor tunic ' +
  'turbo tutor twist ' +
  'udder ultra uncut ' +
  'under undone union ' +
  'unison unite unity ' +
  'until upper urban ' +
  'urge urgent usage ' +
  'usher usual utter ' +
  'vague valid valor ' +
  'value valve vanish ' +
  'vapor vault vegan ' +
  'venom venue verb ' +
  'verge verse verso ' +
  'vessel vest video ' +
  'vigil vigor villa ' +
  'violin viral virus ' +
  'visa visit visor ' +
  'vista vital vivid ' +
  'vocal voice void ' +
  'volcano voter vouch ' +
  'voyage vulgar wagon ' +
  'waist waiter wake ' +
  'waltz wager wagon ' +
  'waist walnut waltz ' +
  'wander want warm ' +
  'warn wasp waste ' +
  'watch water waver ' +
  'weary weave wedge ' +
  'weedy week weigh ' +
  'weight weird welcome ' +
  'weld whale wheat ' +
  'wheel where which ' +
  'whiff while whine ' +
  'whirl whisk whole ' +
  'whoop whose widen ' +
  'widow width wife ' +
  'wight willing winch ' +
  'wind windy wine ' +
  'wing wink winner ' +
  'wisp witch with ' +
  'wither witty wizard ' +
  'woken woman women ' +
  'wood wool wordy ' +
  'world worry worth ' +
  'wound woven wrist ' +
  'xenon yearn yeast ' +
  'yield yodel yoga ' +
  'yoke young youth ' +
  'zany zebra zephyr ' +
  'zero zest zigzag ' +
  'zinc zippy zone ' +
  'package parcel post deliver delivery sent sender shipped hi ok okay app internet number address job city town street road ' +
  'beautiful he you ' +
  'separate necessary writing written occurred appreciate tomorrow definitely government ' +
  'please thanks thank sorry welcome goodbye morning'
);

const DICT: Set<string> = new Set(DICTIONARY_WORDS.split(' '));

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function suggestionsFor(word: string): string[] {
  const scored: Array<[number, string]> = [];
  for (const candidate of DICT) {
    if (Math.abs(candidate.length - word.length) > 2) continue;
    const d = levenshtein(word, candidate, 2);
    if (d > 0 && d <= 2) scored.push([d, candidate]);
  }
  scored.sort((x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : 1));
  return scored.slice(0, 5).map((s) => s[1]);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface Segment {
  text: string;
  bad: boolean;
}

@Component({
  selector: 'app-spell-checker',
  standalone: true,
  imports: [FormsModule, IconComponent, RouterLink, MicroRatingComponent],
  templateUrl: './spell-checker.component.html',
  styleUrl: './spell-checker.component.scss',
})
export class SpellCheckerComponent implements OnDestroy {
  readonly slug = 'spell-checker';
  readonly lastReviewed = '2026-10-18';
  readonly relatedSlugs = ['online-text-editor', 'token-counter', 'strip-html-tags'];

  readonly translate = inject(TranslateService);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly text = signal('');
  readonly rawText = signal('');
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  private jsonLdEl: HTMLScriptElement | null = null;

  constructor() {
    effect(() => {
      this.translate.lang();
      this.updateSeo();
      this.refreshJsonLd();
    });
  }

  readonly segments = computed((): Segment[] => {
    const t = this.text();
    const out: Segment[] = [];
    const re = /[A-Za-z]+(?:'[a-z]+)?|[^A-Za-z]+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      const token = m[0];
      const isWord = /^[A-Za-z]/.test(token);
      out.push({
        text: token,
        bad: isWord && token.length > 1 && !DICT.has(token.toLowerCase()),
      });
    }
    return out;
  });

  readonly misspelled = computed(() => {
    const seen = new Map<string, string>();
    for (const seg of this.segments()) {
      if (seg.bad) {
        const lower = seg.text.toLowerCase();
        if (!seen.has(lower)) seen.set(lower, seg.text);
      }
    }
    return [...seen.entries()].slice(0, 25).map(([lower, original]) => ({
      word: original,
      lower,
      suggestions: suggestionsFor(lower),
    }));
  });

  readonly wordCount = computed(() => this.segments().filter((s) => /^[A-Za-z]/.test(s.text)).length);
  readonly errorCount = computed(() => this.segments().filter((s) => s.bad).length);

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

  setText(v: string) {
    const val = (v.slice(0, 100000));
    this.rawText.set(val);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.text.set(val), 250);
  }
  clear() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.rawText.set('');
    this.text.set('');
  }

  applySuggestion(lower: string, suggestion: string) {
    const re = new RegExp(`\\b${escapeRegExp(lower)}\\b`, 'gi');
    this.text.update((t) => t.replace(re, (match) => {
      if (match[0] === match[0].toUpperCase()) {
        return suggestion.charAt(0).toUpperCase() + suggestion.slice(1);
      }
      return suggestion;
    }));
  }

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
