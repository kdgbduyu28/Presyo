// Filipino names for market items. DA and PSA write most items in English but
// often carry the local name too ("Fish, Round Scad, Galunggong, Medium",
// "Bitter Gourd (ampalaya)"); we lead with that name, and use the everyday
// Filipino word for common produce and cuts. Anything unknown stays English.
// Pure (no RN imports) so it runs under node --test.

import { getLang } from './index.ts';

/** Whole names (lower-cased) as DA lists them, plus the Basket's own labels. */
const NAMES: Record<string, string> = {
  // rice
  'premium rice': 'Premium na bigas',
  'regular milled rice': 'Regular-milled na bigas',
  'well-milled rice': 'Well-milled na bigas',
  'well milled rice': 'Well-milled na bigas',
  'glutinous rice': 'Malagkit na bigas',
  'special rice': 'Espesyal na bigas',
  // meat & eggs
  'whole chicken': 'Buong manok',
  'egg (medium)': 'Itlog (medium)',
  'eggs (medium)': 'Itlog (medium)',
  'chicken egg (white, medium)': 'Itlog ng manok (puti, medium)',
  'pork (kasim)': 'Kasim ng baboy',
  'pork kasim': 'Kasim ng baboy',
  'pork picnic shoulder (kasim)': 'Kasim ng baboy',
  'pork liempo': 'Liempo ng baboy',
  'pork belly (liempo)': 'Liempo ng baboy',
  'pork hind leg (pigue)': 'Pigue ng baboy',
  'pork head': 'Ulo ng baboy',
  'pork offals': 'Lamang-loob ng baboy',
  'pork rind/skin': 'Balat ng baboy',
  'chicken breast': 'Pitso ng manok',
  'chicken drumstick': 'Hita ng manok (drumstick)',
  'chicken thigh': 'Hita ng manok',
  'chicken wing': 'Pakpak ng manok',
  'chicken feet': 'Paa ng manok',
  'chicken liver': 'Atay ng manok',
  'chicken neck': 'Leeg ng manok',
  'chicken rind/skin': 'Balat ng manok',
  'beef brisket': 'Punta y pecho ng baka (brisket)',
  'duck meat': 'Karne ng pato',
  // seafood
  'squid': 'Pusit',
  'squid (pusit bisaya)': 'Pusit Bisaya',
  'sardines (tamban)': 'Tamban',
  'alumahan (indian mackerel)': 'Alumahan',
  'bonito (frigate tuna)': 'Tulingan',
  'tambakol (yellow-fin tuna)': 'Tambakol',
  // vegetables
  'cabbage': 'Repolyo',
  'tomato': 'Kamatis',
  'eggplant': 'Talong',
  'red onion': 'Pulang sibuyas',
  'white onion': 'Puting sibuyas',
  'garlic': 'Bawang',
  'garlic, native/local': 'Bawang (native)',
  'potato': 'Patatas',
  'white potato': 'Patatas',
  'carrot': 'Karot',
  'carrots': 'Karot',
  'chayote': 'Sayote',
  'chayote leaves': 'Talbos ng sayote',
  'squash': 'Kalabasa',
  'string beans': 'Sitaw',
  'pole sitao': 'Sitaw',
  'baguio beans': 'Habitsuwelas (Baguio beans)',
  'habichuelas/baguio beans': 'Habitsuwelas (Baguio beans)',
  'ginger': 'Luya',
  'red chili': 'Siling labuyo',
  'chilli (red)': 'Siling labuyo',
  'chili (green)': 'Siling haba',
  'chilli (green)': 'Siling haba',
  'native pechay': 'Pechay (native)',
  'lettuce': 'Litsugas',
  'camote tops': 'Talbos ng kamote',
  'onion leaves': 'Dahon ng sibuyas',
  'gabi leaves': 'Dahon ng gabi',
  // fruits
  'calamansi': 'Kalamansi',
  'banana (lakatan)': 'Saging na lakatan',
  'banana (latundan)': 'Saging na latundan',
  'banana (saba)': 'Saging na saba',
  'mango (carabao)': 'Manggang kalabaw',
  'watermelon': 'Pakwan',
  'pomelo': 'Suha',
  'avocado': 'Abukado',
  // pantry
  'sugar (refined)': 'Asukal (refined)',
  'sugar (washed)': 'Asukal (washed)',
  'sugar (brown)': 'Asukal na pula',
  'salt (iodized)': 'Asin (iodized)',
  'salt (rock)': 'Asin (rock salt)',
  'mungbean': 'Munggo',
  'peanut': 'Mani',
  'white beans': 'Puting bitsuwelas',
  'cooking oil (palm)': 'Mantika (palm)',
  'cooking oil (coconut)': 'Mantika (niyog)',
  'corn (white)': 'Mais (puti)',
  'corn (yellow)': 'Mais (dilaw)',
};

/** First part of PSA's "Head, Detail, …" names. '' = drop it (a local name follows). */
const HEADS: Record<string, string> = {
  rice: 'Bigas', pork: 'Baboy', beef: 'Baka', carabeef: 'Karne ng kalabaw', chicken: 'Manok', egg: 'Itlog',
  banana: 'Saging', mango: 'Mangga', papaya: 'Papaya', grapes: 'Ubas', apple: 'Mansanas', pomelo: 'Suha',
  garlic: 'Bawang', onion: 'Sibuyas', potato: 'Patatas', ginger: 'Luya', eggplant: 'Talong', calamansi: 'Kalamansi',
  shrimp: 'Hipon', squid: 'Pusit', sugar: 'Asukal', 'raw peanut': 'Mani', 'corn grits': 'Mais (grits)',
  'whole corn on the cob': 'Mais', 'whole corn grain': 'Butil ng mais', 'matured coconut': 'Niyog',
  'young coconut': 'Buko', monggo: 'Munggo', 'gabi tubers': 'Gabi', 'edible offal': '',
  fish: '', crabs: '', shells: '', seaweeds: '', pineapple: '', guava: '', jackfruit: '', watermelon: '',
  mandarin: '', orange: '', cantaloupe: '',
};

/** Detail words PSA uses after the head. */
const WORDS: Record<string, string> = {
  chicken: 'manok', pork: 'baboy', beef: 'baka', duck: 'pato', quail: 'pugo', liver: 'atay', gizzard: 'balunbalunan',
  feet: 'paa', breast: 'pitso', legs: 'hita', wings: 'pakpak', 'meat with bones': 'may buto', 'pure meat': 'laman',
  'brisket with bones': 'punta y pecho, may buto', 'fully dressed': 'linis', dressed: 'linis', whole: 'buo',
  ripe: 'hinog', loose: 'tingi', white: 'puti', yellow: 'dilaw', green: 'berde', red: 'pula', shelled: 'walang balat',
  unshelled: 'may balat', fruit: '', 'pork chop': 'pork chop', 'spare ribs': 'spare ribs', 'without shell': 'walang balat',
};

/** Fish names: "Fish, Round Scad, Galunggong, Medium" drops the English species. */
const SIZES = new Set(['medium', 'small', 'large']);

/** Local names DA/PSA put in parentheses after an English vegetable name. */
const IN_PARENS = /\((ampalaya|camote|upo|pipino|labanos|singkamas|kamoteng kahoy|puso ng saging|tuwalya)\)/i;

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const SPELLING: Record<string, string> = { camote: 'Kamote', 'kamoteng kahoy': 'Kamoteng kahoy' };
const ANIMALS = new Set(['manok', 'baboy', 'baka', 'pato', 'pugo']);

/** The Filipino name of a market item, or the name itself if we don't know one. */
export function filipinoName(name: string): string {
  const low = name.trim().toLowerCase();
  if (NAMES[low]) return NAMES[low];
  // "Cabbage (Rare Ball)" -> "Repolyo (Rare Ball)": a variety after a name we know
  const variety = /^(.+?) (\(.+\))$/.exec(low);
  if (variety && NAMES[variety[1]] && !IN_PARENS.test(name)) return `${NAMES[variety[1]]} ${name.slice(variety[1].length + 1)}`;
  const paren = IN_PARENS.exec(name);
  if (paren) {
    const rest = name.slice(paren.index + paren[0].length).replace(/^,\s*/, '');
    const local = SPELLING[paren[1].toLowerCase()] ?? cap(paren[1].toLowerCase());
    // "Edible Offal, Tripe (tuwalya), Beef" -> "Tuwalya ng baka"
    if (/^beef$/i.test(rest)) return `${local} ng baka`;
    const words = rest.split(', ').map(detail).filter(Boolean);
    return words.length ? `${local}, ${words.join(', ')}` : local;
  }
  const parts = name.split(', ');
  if (parts.length < 2) return name;
  const head = parts[0].toLowerCase();
  if (!(head in HEADS)) return name;
  let rest = parts.slice(1);
  // Fish, <English species>, <local name>[, size]
  if (head === 'fish' && rest.length >= 2 && !SIZES.has(rest[1].toLowerCase())) rest = rest.slice(1);
  const words = rest.map(detail).filter(Boolean);
  // "Egg, Chicken, Medium" -> "Itlog ng manok, medium"; "Edible Offal, Liver, Pork" -> "Atay ng baboy"
  const animal = words.findIndex((w) => ANIMALS.has(w));
  if ((head === 'egg' || head === 'edible offal') && animal >= 0) {
    const thing = head === 'egg' ? 'Itlog' : cap(words[0]);
    const others = words.filter((_, i) => i !== animal && (head === 'egg' || i !== 0));
    return [`${thing} ng ${words[animal]}`, ...others].join(', ');
  }
  return cap([HEADS[head], ...words].filter(Boolean).join(', '));
}

function detail(w: string): string {
  return WORDS[w.toLowerCase()] ?? w.toLowerCase();
}

/** Item name in the current language. */
export function itemName(name: string): string {
  return getLang() === 'fil' ? filipinoName(name) : name;
}
