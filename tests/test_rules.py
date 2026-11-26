"""Unit tests for the rules engine. These messages are written for testing only; the reported
accuracy comes from eval/holdout (written by someone else), never from these."""
import re

import pytest

from common.rules import FAMILIES, GENERIC, LANGS, Engine, engine, rules_version


def verdict(text: str):
    e = engine()
    return e.evaluate(e.normalise(text))


# --- normalisation -------------------------------------------------------------------------

def test_normalise_basics():
    e = engine()
    assert e.normalise("URGENTTTT!!! Don't 🙏 cut the call…") == "urgent dont cut the call"
    assert e.normalise("₹48,000 at 9:30 PM") == "₹48 000 at 9 30 pm"
    assert e.normalise("50% daily") == "50% daily"


def test_normalise_drops_zero_width_and_maps_synonyms():
    e = engine()
    assert e.normalise("giraftari warrant") == "arrest warrant"
    assert e.normalise("आपकी गिरफ्तारी होगी") == "आपकी arrest होगी"
    assert e.normalise("கைது வாரண்ட்") == "arrest வாரண்ட்"
    assert e.normalise("वीडियो‍ कॉल") == "video call"


def test_synonyms_match_whole_words_only():
    # "eb" maps to electricity, but not inside other words
    assert engine().normalise("webinar") == "webinar"


# --- rule files ------------------------------------------------------------------------------

def test_rule_files_are_valid():
    e = Engine.load()
    families = {r.family for r in e.rules}
    assert families == set(FAMILIES) | {GENERIC}
    for family in FAMILIES:
        assert sum(r.family == family for r in e.rules) >= 3, family
    for item in [*e.rules, *e.combos]:
        assert all(item.reason[lang] for lang in LANGS), item.id
        assert item.source, item.id
    assert re.fullmatch(r"[0-9a-f]{12}", rules_version())


# --- scam messages (one per family, several languages) ----------------------------------------

@pytest.mark.parametrize(
    ("text", "family"),
    [
        ("This is Inspector Sharma from Mumbai Police Crime Branch. An arrest warrant is issued in a money "
         "laundering case. Stay on the video call and transfer your savings to the RBI verification account "
         "immediately.", "digital_arrest"),
        ("Main CBI se bol raha hoon, aapke naam pe giraftari warrant hai, video call pe rahiye, kisi ko mat batana",
         "digital_arrest"),
        ("मैं सीबीआई से बोल रहा हूँ। आपकी गिरफ्तारी होगी। वीडियो कॉल पर रहिए।", "digital_arrest"),
        ("நான் போலீஸ் அதிகாரி. உங்கள் மீது கைது வாரண்ட் உள்ளது. வீடியோ அழைப்பில் இருங்கள்.", "digital_arrest"),
        ("FedEx: your parcel to Taiwan has been seized by customs, it contains 5 fake passports and MDMA. "
         "Press 1 to talk to an officer.", "customs_courier"),
        ("Dear customer your SBI account will be blocked today. Update KYC by clicking the link bit.ly/x",
         "kyc_sim"),
        ("Dear consumer your electricity power will be disconnected tonight at 9.30 pm because your previous "
         "month bill was not updated. Please contact electricity officer 9876543210", "electricity"),
        ("Part time job! Earn Rs 3000 daily by liking YouTube videos. Join our Telegram group. Prepaid task bonus.",
         "task_job"),
        ("Sir I am army officer, I will pay advance. Scan this QR code to receive 5000 rupees and enter UPI PIN.",
         "collect_qr"),
        ("Papa I met with an accident, this is my new number, send 20000 urgently, don't tell mummy",
         "relative_trouble"),
    ],
)
def test_classic_scams_are_likely(text, family):
    v = verdict(text)
    assert v.tier == "likely_scam", (v.score, [m.id for m in v.matched])
    assert v.family == family


def test_investment_group_is_at_least_suspicious():
    v = verdict("Join our VIP WhatsApp group for stock market tips. Guaranteed 30% monthly returns.")
    assert v.tier in {"suspicious", "likely_scam"} and v.family == "investment"


def test_combo_rule_fires_for_authority_urgency_payment():
    v = verdict("Customs department: pay the clearance fee of Rs 2500 immediately or the parcel goes to police.")
    assert "CB-01" in {m.id for m in v.matched}


# --- genuine messages must not be flagged -----------------------------------------------------

@pytest.mark.parametrize(
    "text",
    [
        "123456 is your OTP for txn of INR 500.00 at Amazon. Valid for 10 mins. Do not share it with anyone. -HDFC Bank",
        "Your Amazon order has been shipped via Blue Dart. Track your package: amzn.in/x",
        "Beta, please send ₹500 for groceries when you get time.",
        "Your electricity bill of Rs 1,240 for Oct is due on 30-11-2026. Pay at bescom.co.in. Ignore if paid.",
        "Never share your OTP, PIN or CVV with anyone. SBI never asks for these.",
    ],
)
def test_genuine_messages_are_not_flagged(text):
    v = verdict(text)
    assert v.tier == "no_known_pattern", (v.score, [m.id for m in v.matched])
    assert v.family is None and v.matched == []


# --- warnings are not scams; scams that sound like warnings still are --------------------------------

@pytest.mark.parametrize(
    "text",
    [
        "RBI warns: police never arrest anyone on a video call. Do not transfer money to any safe account. Call 1930.",
        "CBI and police will never ask you to transfer money on a video call.",
        "Please do not share your OTP or click unknown links. Your bank never calls for your PIN.",
        "पुलिस कभी वीडियो कॉल पर गिरफ्तार नहीं करती।",
        "காவல்துறை ஒருபோதும் வீடியோ அழைப்பில் கைது செய்ய மாட்டார்கள்.",
    ],
)
def test_protective_warnings_are_not_flagged(text):
    assert verdict(text).tier == "no_known_pattern", verdict(text)


@pytest.mark.parametrize(
    "text",
    [
        # a warning placed in front of a real threat does not hide it
        "Police never ask for money. This is Inspector Sharma, an arrest warrant is issued. Stay on the video call "
        "and transfer your savings to the RBI verification account.",
        # a threat phrased as a warning is kept whole
        "Police will never arrest you if you stay on the video call and transfer money to the RBI verification "
        "account, an arrest warrant is issued",
        "Police never ask twice, an arrest warrant is issued, stay on the video call and transfer money to the "
        "RBI verification account",
        "Do not transfer money anywhere else, only to the RBI verification account. Arrest warrant issued, stay on "
        "the video call.",
    ],
)
def test_warning_wording_cannot_hide_a_scam(text):
    assert verdict(text).tier == "likely_scam", verdict(text)


@pytest.mark.parametrize(
    "text",
    [
        "प्रिय ग्राहक आपकी बिजली आज रात 9.30 बजे काट दी जाएगी। तुरंत इस नंबर पर कॉल करें।",
        "உங்கள் மின் இணைப்பு இன்றிரவு 9.30 மணிக்கு துண்டிக்கப்படும். உடனே மின் அதிகாரியை அழைக்கவும்.",
    ],
)
def test_indian_language_electricity_threats_are_flagged(text):
    v = verdict(text)
    assert v.tier != "no_known_pattern" and v.family == "electricity", v


def test_power_cut_notice_is_not_flagged():
    assert verdict("रखरखाव के लिए कल बिजली कटौती रहेगी।").tier == "no_known_pattern"


@pytest.mark.parametrize("text", [
    "CBI officers do not arrest people over video calls. Never transfer money to a safe account.",
    "I4C advisory: There is no such thing as digital arrest. Police never arrest anyone on video call.",
    "Police never arrest anyone on a video call. Report such calls to 1930 immediately.",
    "Digital arrest is a scam. Call 1930 or visit www.cybercrime.gov.in.",
])
def test_standard_advisories_are_not_flagged(text):
    assert verdict(text).tier == "no_known_pattern", verdict(text)


@pytest.mark.parametrize("text", [
    "Police do not arrest on video call if you pay the fine.",
    "Police do not arrest on video call. Stay on the call and transfer money to the RBI verification account, arrest warrant issued.",
    "Your arrest warrant is issued, police do not arrest on video calls",
    "There is no such thing as digital arrest, but you are under arrest, transfer money to the RBI verification account",
    "Call 1930 immediately and transfer money to the RBI verification account, arrest warrant issued.",
    "Digital arrest is a scam. CBI arrest warrant issued. Stay on the video call and transfer your savings.",
])
def test_advisory_wording_never_lowers_a_threat(text):
    from common import rules

    after = verdict(text).score
    keep = rules._drop_warnings
    rules._drop_warnings = lambda t: t
    try:
        before = verdict(text).score
    finally:
        rules._drop_warnings = keep
    assert after == before, (before, after)


def test_there_is_no_safe_tier():
    assert verdict("hello").tier == "no_known_pattern"
    assert verdict("hello").score == 0


@pytest.mark.parametrize(
    "text",
    [
        "CBI never calls on video call keep the video call on and do not tell anyone transfer to RBI verification account",
        "Do not share your PIN with anyone: pay the fine to the RBI verification account or face an arrest warrant on video call",
        "पुलिस कभी वीडियो कॉल पर गिरफ्तार नहीं करती आप वीडियो कॉल पर बने रहें और RBI सुरक्षित खाते में पैसे ट्रांसफर करें गिरफ्तारी वारंट जारी",
        "காவல்துறை ஒருபோதும் வீடியோ அழைப்பில் கைது செய்ய மாட்டார்கள் நீங்கள் வீடியோ அழைப்பில் இருங்கள் RBI கணக்கிற்கு பணம் அனுப்புங்கள் கைது வாரண்ட்",
        "Never share your OTP. Never click links. Ignore this and your account will be blocked tonight, call 9876543210",
        "Police never arrest anyone on a video call. Transfer money to RBI safe account",
    ],
)
def test_a_warning_never_lowers_the_score_of_a_threat(text):
    from common import rules

    e = engine()
    keep = rules._drop_warnings
    rules._drop_warnings = lambda t: t
    try:
        unfiltered = e.evaluate(e.normalise(text))
    finally:
        rules._drop_warnings = keep
    filtered = e.evaluate(e.normalise(text))
    assert filtered.score >= unfiltered.score and filtered.tier == unfiltered.tier, (filtered, unfiltered)


def test_hindi_masculine_electricity_threat_is_flagged():
    v = verdict("बिजली कनेक्शन आज रात कट जाएगा, अधिकारी से संपर्क करें")
    assert v.family == "electricity" and v.score > 15, v
