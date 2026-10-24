/**
 * Matching the country names our data uses to the ones on the map.
 *
 * SAP writes 'Utd.Arab Emir.' and the atlas writes 'United Arab Emirates'.
 * Neither is going to change, so the translation lives here, built from the
 * actual distinct values in track.po_line.country and
 * track.po_line.supplier_country rather than from guesses.
 *
 * A country that cannot be matched is never silently dropped: the map says so
 * underneath it. A map that quietly omits a country reads as "nothing there",
 * which is the same failure as an agent reporting a zero it did not prove.
 */

/** Our spelling (lower-cased, punctuation stripped) → the atlas spelling. */
const ALIASES: Record<string, string> = {
    // SAP's abbreviated operating-country spellings
    'utd arab emir': 'United Arab Emirates',
    'utdarab emir': 'United Arab Emirates',
    'uae': 'United Arab Emirates',
    'repof congo': 'Congo',
    'rep of congo': 'Congo',
    'republic of the congo': 'Congo',
    'ksa': 'Saudi Arabia',

    // Longer-form names the atlas shortens
    'usa': 'United States of America',
    'us': 'United States of America',
    'united states': 'United States of America',
    'uk': 'United Kingdom',
    'great britain': 'United Kingdom',
    'russian federation': 'Russia',
    'czech republic': 'Czechia',
    'south korea': 'South Korea',
    'korea republic of': 'South Korea',
    'turkiye': 'Turkey',
    'ivory coast': "Côte d'Ivoire",
    'drc': 'Dem. Rep. Congo',
    'democratic republic of the congo': 'Dem. Rep. Congo',
    'bosnia and herzegovina': 'Bosnia and Herz.',
    'dominican republic': 'Dominican Rep.',
    'central african republic': 'Central African Rep.',
    'south sudan': 'S. Sudan',
    'equatorial guinea': 'Eq. Guinea',
    'solomon islands': 'Solomon Is.',
};

/**
 * Countries too small to exist as a polygon at this map resolution.
 *
 * Bahrain is an operating country, so leaving it off the map was not an
 * option; it and the others are drawn as a marker at these coordinates
 * instead. Longitude first, the order d3-geo expects.
 */
export const SMALL_STATES: Record<string, [number, number]> = {
    'Bahrain': [50.55, 26.07],
    'Singapore': [103.82, 1.35],
    'Hong Kong': [114.17, 22.32],
    'Malta': [14.42, 35.92],
    'Antigua and Barbuda': [-61.80, 17.08],
    'Cyprus': [33.43, 35.13],
    'Luxembourg': [6.13, 49.81],
    'Mauritius': [57.55, -20.35],
};

const normalise = (raw: string) =>
    raw
        .toLowerCase()
        .replace(/[.'’,]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

/** The atlas name for one of our country labels, or null if we cannot tell. */
export function toAtlasName(label: string, atlasNames: Set<string>): string | null {
    const raw = label.trim();
    if (!raw) return null;
    if (atlasNames.has(raw)) return raw;

    const key = normalise(raw);
    const alias = ALIASES[key];
    if (alias) return alias;

    // Case and punctuation differences only.
    for (const name of atlasNames) {
        if (normalise(name) === key) return name;
    }
    return null;
}

/**
 * The country names we know about, for deciding whether a column IS a country
 * column before any map code is loaded.
 *
 * Deliberately a fixed list rather than the atlas: this runs in the classifier,
 * which must stay cheap and must not pull 108 KB of geography in to answer a
 * yes or no question about a table.
 */
const KNOWN = new Set(
    [
        // Where NESR operates
        'algeria', 'bahrain', 'chad', 'egypt', 'india', 'indonesia', 'iraq', 'jordan',
        'kuwait', 'libya', 'oman', 'qatar', 'saudi arabia', 'yemen',
        'utd arab emir', 'utdarab emir', 'united arab emirates', 'uae',
        'repof congo', 'rep of congo', 'republic of the congo', 'congo',
        // Where suppliers are
        'antigua and barbuda', 'australia', 'austria', 'brazil', 'canada', 'china',
        'cyprus', 'czech republic', 'czechia', 'denmark', 'france', 'georgia',
        'germany', 'hong kong', 'iceland', 'ireland', 'italy', 'malaysia', 'malta',
        'mexico', 'netherlands', 'norway', 'portugal', 'romania', 'russia',
        'russian federation', 'singapore', 'slovenia', 'south korea', 'spain',
        'thailand', 'tunisia', 'turkey', 'turkiye', 'ukraine', 'united kingdom',
        'uk', 'uruguay', 'usa', 'united states', 'united states of america',
        'uzbekistan', 'belgium', 'sweden', 'finland', 'poland', 'greece', 'japan',
        'switzerland', 'south africa', 'nigeria', 'kenya', 'morocco', 'pakistan',
        'bangladesh', 'vietnam', 'philippines', 'new zealand', 'argentina', 'chile',
        'colombia', 'peru', 'kazakhstan', 'azerbaijan', 'lebanon', 'syria', 'israel',
        'sudan', 'ethiopia', 'ghana', 'angola', 'gabon', 'cameroon', 'tanzania',
    ].map(normalise),
);

/** Is this one of the country names we recognise? */
export function isCountryName(label: string): boolean {
    return KNOWN.has(normalise(label));
}

/** Header wording that means the column holds countries. */
const COUNTRY_HEADER = /\b(country|countries|nation|origin|destination)\b/i;

/**
 * Does this column hold countries?
 *
 * Both tests have to agree, which is the point. The header alone lets
 * "Country Code" through with values like 'SA'; the values alone would call a
 * list of supplier names a country column the moment one of them was "Georgia".
 */
export function looksLikeCountryColumn(header: string, values: string[]): boolean {
    const recognised = values.filter(v => isCountryName(v)).length;
    if (values.length < 3) return false;
    const ratio = recognised / values.length;

    if (COUNTRY_HEADER.test(header)) return ratio >= 0.6;
    return ratio >= 0.9;
}
