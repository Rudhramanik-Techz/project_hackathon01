// The scam rules are written for English, Hindi and Tamil. A message in another language must never be
// reported as "no known scam pattern", because the rules never read it.
const OTHER_SCRIPTS = /[؀-ۿঀ-୿ఀ-ൿ]/; // Urdu, Bengali, Gurmukhi, Gujarati, Odia, Telugu, Kannada, Malayalam
// Marathi shares Devanagari with Hindi, so it is recognised by common Marathi words.
const MARATHI = /(?:^|\s)(?:आहे|आहात|तुम्ही|तुमच\S*|आणि|होईल)(?=\s|$|[।.,!?])/;

export const cannotCheck = (message: string) => OTHER_SCRIPTS.test(message) || MARATHI.test(message);
