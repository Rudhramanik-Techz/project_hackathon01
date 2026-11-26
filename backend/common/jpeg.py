"""Reads JPEG dimensions from the frame header without decoding pixels (no image library in Lambda)."""
from __future__ import annotations

SOF_MARKERS = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}


def jpeg_size(data: bytes) -> tuple[int, int] | None:
    """(width, height) of a single-frame JPEG, or None if the structure is not a valid JPEG."""
    if len(data) < 4 or data[:3] != b"\xff\xd8\xff":
        return None
    i = 2
    while i + 4 <= len(data):
        if data[i] != 0xFF:
            return None
        marker = data[i + 1]
        if marker == 0xFF:  # fill byte
            i += 1
            continue
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:  # markers without a length
            i += 2
            continue
        if marker == 0xD9:  # end of image before a frame header
            return None
        length = int.from_bytes(data[i + 2:i + 4], "big")
        if length < 2 or i + 2 + length > len(data):
            return None
        if marker in SOF_MARKERS:
            if length < 7:
                return None
            height = int.from_bytes(data[i + 5:i + 7], "big")
            width = int.from_bytes(data[i + 7:i + 9], "big")
            return (width, height) if width and height else None
        if marker == 0xDA:  # start of scan before any frame header
            return None
        i += 2 + length
    return None
