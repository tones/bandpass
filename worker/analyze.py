"""
Long-lived audio analysis process. Reads JSON requests from stdin,
analyzes each track using native Essentia, writes JSON results to stdout.

Protocol:
  stdin  (one JSON per line): {"url": "https://..."}
  stdout (one JSON per line): {"bpm": 120.0, "key": "C", "scale": "minor"}
                          or: {"error": "message"}
"""

import sys
import json
import tempfile
import urllib.request
import os
import time

import essentia
import essentia.standard as es

essentia.log.infoActive = False
essentia.log.warningActive = False

FETCH_TIMEOUT_S = 30


def analyze(url: str) -> dict:
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        t0 = time.time()
        with urllib.request.urlopen(url, timeout=FETCH_TIMEOUT_S) as resp:
            with open(tmp_path, "wb") as f:
                f.write(resp.read())
        t_download = time.time()

        audio = es.MonoLoader(filename=tmp_path, sampleRate=44100)()
        t_load = time.time()

        bpm = float(es.PercivalBpmEstimator()(audio))
        t_bpm = time.time()

        key, scale, strength = es.KeyExtractor()(audio)
        t_key = time.time()

        duration_s = len(audio) / 44100

        timing = (
            f"audio={duration_s:.1f}s "
            f"download={1000*(t_download-t0):.0f}ms "
            f"load={1000*(t_load-t_download):.0f}ms "
            f"bpm={1000*(t_bpm-t_load):.0f}ms "
            f"key={1000*(t_key-t_bpm):.0f}ms "
            f"total={1000*(t_key-t0):.0f}ms"
        )

        return {
            "bpm": bpm,
            "key": key,
            "scale": scale,
            "timing": timing,
            "file": tmp_path,
        }
    except Exception:
        os.unlink(tmp_path)
        raise


def main():
    print("essentia-analyzer ready", file=sys.stderr, flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            req = json.loads(line)
            result = analyze(req["url"])
            print(json.dumps(result), flush=True)
        except Exception as exc:
            print(json.dumps({"error": str(exc)}), flush=True)


if __name__ == "__main__":
    main()
