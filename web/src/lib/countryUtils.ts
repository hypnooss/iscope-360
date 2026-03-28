// Country name to ISO 2-letter code mapping (FortiGate names)
const COUNTRY_CODES: Record<string, string> = {
  'afghanistan': 'af', 'albania': 'al', 'algeria': 'dz', 'argentina': 'ar',
  'australia': 'au', 'austria': 'at', 'azerbaijan': 'az', 'bangladesh': 'bd',
  'belarus': 'by', 'belgium': 'be', 'bolivia': 'bo', 'bosnia and herzegovina': 'ba',
  'brazil': 'br', 'bulgaria': 'bg', 'cambodia': 'kh', 'cameroon': 'cm',
  'canada': 'ca', 'chile': 'cl', 'china': 'cn', 'colombia': 'co',
  'costa rica': 'cr', 'croatia': 'hr', 'cuba': 'cu', 'czech republic': 'cz',
  'czechia': 'cz', 'denmark': 'dk', 'dominican republic': 'do', 'ecuador': 'ec',
  'egypt': 'eg', 'estonia': 'ee', 'ethiopia': 'et', 'finland': 'fi',
  'france': 'fr', 'georgia': 'ge', 'germany': 'de', 'ghana': 'gh',
  'greece': 'gr', 'guatemala': 'gt', 'hong kong': 'hk', 'hungary': 'hu',
  'india': 'in', 'indonesia': 'id', 'iran': 'ir', 'iran, islamic republic of': 'ir',
  'iraq': 'iq', 'ireland': 'ie', 'israel': 'il', 'italy': 'it',
  'japan': 'jp', 'jordan': 'jo', 'kazakhstan': 'kz', 'kenya': 'ke',
  'korea, republic of': 'kr', 'south korea': 'kr', 'korea': 'kr',
  'kuwait': 'kw', 'latvia': 'lv', 'lebanon': 'lb', 'libya': 'ly',
  'lithuania': 'lt', 'luxembourg': 'lu', 'malaysia': 'my', 'mexico': 'mx',
  'moldova': 'md', 'mongolia': 'mn', 'morocco': 'ma', 'mozambique': 'mz',
  'myanmar': 'mm', 'nepal': 'np', 'netherlands': 'nl', 'new zealand': 'nz',
  'nigeria': 'ng', 'north korea': 'kp', 'north macedonia': 'mk', 'norway': 'no',
  'pakistan': 'pk', 'panama': 'pa', 'paraguay': 'py', 'peru': 'pe',
  'philippines': 'ph', 'poland': 'pl', 'portugal': 'pt', 'qatar': 'qa',
  'romania': 'ro', 'russian federation': 'ru', 'russia': 'ru',
  'saudi arabia': 'sa', 'senegal': 'sn', 'serbia': 'rs', 'singapore': 'sg',
  'slovakia': 'sk', 'slovenia': 'si', 'south africa': 'za', 'spain': 'es',
  'sri lanka': 'lk', 'sweden': 'se', 'switzerland': 'ch', 'syria': 'sy',
  'syrian arab republic': 'sy', 'taiwan': 'tw', 'tanzania': 'tz',
  'thailand': 'th', 'tunisia': 'tn', 'turkey': 'tr', 'turkiye': 'tr',
  'ukraine': 'ua', 'united arab emirates': 'ae', 'united kingdom': 'gb',
  'united states': 'us', 'united states of america': 'us', 'uruguay': 'uy',
  'uzbekistan': 'uz', 'venezuela': 've', 'vietnam': 'vn', 'viet nam': 'vn',
  'reserved': '', 'unknown': '',
};

// Approximate lat/lng coordinates per ISO code (for attack map)
export const COUNTRY_COORDS: Record<string, [number, number]> = {
  'af': [33, 65], 'al': [41, 20], 'dz': [28, 3], 'ar': [-34, -64],
  'au': [-25, 134], 'at': [47, 14], 'az': [40, 50], 'bd': [24, 90],
  'by': [53, 28], 'be': [51, 4], 'bo': [-17, -65], 'ba': [44, 18],
  'br': [-14, -51], 'bg': [43, 25], 'kh': [13, 105], 'cm': [6, 12],
  'ca': [56, -106], 'cl': [-35, -71], 'cn': [35, 104], 'co': [4, -72],
  'cr': [10, -84], 'hr': [45, 16], 'cu': [22, -80], 'cz': [50, 15],
  'dk': [56, 10], 'do': [19, -70], 'ec': [-2, -78], 'eg': [27, 30],
  'ee': [59, 26], 'et': [9, 38], 'fi': [64, 26], 'fr': [46, 2],
  'ge': [42, 44], 'de': [51, 9], 'gh': [8, -2], 'gr': [39, 22],
  'gt': [15, -90], 'hk': [22, 114], 'hu': [47, 20], 'in': [21, 78],
  'id': [-5, 120], 'ir': [32, 53], 'iq': [33, 44], 'ie': [53, -8],
  'il': [31, 35], 'it': [43, 12], 'jp': [36, 138], 'jo': [31, 37],
  'kz': [48, 68], 'ke': [0, 38], 'kr': [36, 128], 'kw': [29, 48],
  'lv': [57, 25], 'lb': [34, 36], 'ly': [27, 17], 'lt': [56, 24],
  'lu': [50, 6], 'my': [4, 102], 'mx': [23, -102], 'md': [47, 29],
  'mn': [46, 105], 'ma': [32, -5], 'mz': [-18, 35], 'mm': [22, 96],
  'np': [28, 84], 'nl': [52, 5], 'nz': [-41, 174], 'ng': [10, 8],
  'kp': [40, 127], 'mk': [41, 22], 'no': [60, 8], 'pk': [30, 70],
  'pa': [9, -80], 'py': [-23, -58], 'pe': [-10, -76], 'ph': [13, 122],
  'pl': [52, 20], 'pt': [39, -8], 'qa': [25, 51], 'ro': [46, 25],
  'ru': [61, 105], 'sa': [24, 45], 'sn': [14, -14], 'rs': [44, 21],
  'sg': [1, 104], 'sk': [49, 19], 'si': [46, 15], 'za': [-29, 24],
  'es': [40, -4], 'lk': [7, 81], 'se': [62, 15], 'ch': [47, 8],
  'sy': [35, 38], 'tw': [24, 121], 'tz': [-6, 35], 'th': [15, 101],
  'tn': [34, 9], 'tr': [39, 35], 'ua': [49, 32], 'ae': [24, 54],
  'gb': [54, -2], 'us': [39, -98], 'uy': [-33, -56], 'uz': [41, 64],
  've': [7, -66], 'vn': [16, 108],
};

/**
 * Get the ISO 2-letter country code from a country name (as returned by FortiGate).
 * Returns null if not found.
 */
export function getCountryCode(countryName: string): string | null {
  if (!countryName) return null;
  const code = COUNTRY_CODES[countryName.toLowerCase().trim()];
  return code || null;
}

/**
 * Get the approximate lat/lng for a country (by name or code).
 */
export function getCountryCoords(countryNameOrCode: string): [number, number] | null {
  const code = countryNameOrCode.length === 2
    ? countryNameOrCode.toLowerCase()
    : getCountryCode(countryNameOrCode);
  if (!code) return null;
  return COUNTRY_COORDS[code] || null;
}
