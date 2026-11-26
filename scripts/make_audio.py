"""Generate Saathi drill audio offline with Amazon Polly (voice Kajal, neural, en-IN and hi-IN).

Polly is never on the request path: run this once, commit the MP3s, and the service worker caches them.
Polly has no Tamil voice, so record frontend/public/audio/ta/mock_call.mp3 and rules.mp3 yourself.

    AWS_PROFILE=asli .venv/Scripts/python scripts/make_audio.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import boto3

ROOT = Path(__file__).resolve().parent.parent
I18N = ROOT / "frontend" / "src" / "i18n"
OUT = ROOT / "frontend" / "public" / "audio"

# Polly language code per app language. Kajal is bilingual (Indian English and Hindi).
LANGS = {"en": "en-IN", "hi": "hi-IN"}


def ssml(text: str, slow: bool = False) -> str:
    safe = text.replace("&", "and").replace("<", "").replace(">", "")
    rate = "90%" if slow else "100%"
    return f'<speak><prosody rate="{rate}">{safe}</prosody></speak>'


def main() -> int:
    polly = boto3.client("polly", region_name="ap-south-1")
    for lang, code in LANGS.items():
        strings = json.loads((I18N / f"{lang}.json").read_text(encoding="utf-8"))
        clips = {
            "mock_call.mp3": ssml(strings["saathiTranscript"]),
            "rules.mp3": ssml(
                " <break time='600ms'/> ".join(
                    [strings["saathiRulesTitle"], strings["saathiRule1"], strings["saathiRule2"], strings["saathiRule3"]]
                ),
                slow=True,
            ),
        }
        (OUT / lang).mkdir(parents=True, exist_ok=True)
        for name, text in clips.items():
            audio = polly.synthesize_speech(
                Engine="neural", VoiceId="Kajal", LanguageCode=code, TextType="ssml", Text=text, OutputFormat="mp3"
            )["AudioStream"].read()
            (OUT / lang / name).write_bytes(audio)
            print(f"{lang}/{name}: {len(audio) // 1024} KB")
    (OUT / "ta").mkdir(parents=True, exist_ok=True)
    print("Tamil: record audio/ta/mock_call.mp3 and audio/ta/rules.mp3 yourself (Polly has no Tamil voice).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
