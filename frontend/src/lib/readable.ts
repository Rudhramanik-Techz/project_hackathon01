// The scam rules are written for English, Hindi and Tamil. A message in another language must never be
// reported as "no known scam pattern", because the rules never read it.
const OTHER_SCRIPTS = /[؀-ۿঀ-୿ఀ-ൿ]/; // Urdu, Bengali, Gurmukhi, Gujarati, Odia, Telugu, Kannada, Malayalam
// Marathi shares Devanagari with Hindi, so it is recognised by common words Hindi does not use
// (verb endings, pronouns, postpositions). frontend/tests/ui.test.ts checks Hindi text is not caught.
const MARATHI_WORDS = [
  "आहे", "आहेत", "आहात", "नाही", "नाहीत", "नका",
  "तुम्ही", "तुम्हाला", "तुमच\\S*", "आपल्या", "आपले", "आपला", "आपली", "माझ\\S*", "आमच\\S*", "मला",
  "आणि", "होईल", "होणार", "जाईल", "जातील", "झाले", "झाला", "झाली", "केले", "केला", "केली",
  "मध्ये", "साठी", "करण्यासाठी", "पाठवा", "पाठव", "सांगा", "करावे", "करावा", "लगेच", "येथे", "इथे",
  "वीज", "वीजपुरवठा", "रात्री", "उद्या",
];
const MARATHI = new RegExp(`(?:^|\\s)(?:${MARATHI_WORDS.join("|")})(?=\\s|$|[।.,!?:;])`, "u");

export const cannotCheck = (message: string) => OTHER_SCRIPTS.test(message) || MARATHI.test(message);
