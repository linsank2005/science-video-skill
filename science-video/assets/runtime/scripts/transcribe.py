"""Local, timestamped transcription. The MP3 is decoded without modifying the source."""
import argparse
import importlib.metadata
import json
from pathlib import Path


def subtitle_cues(segments, max_chars, max_seconds=5.0):
    cues = []
    current = []

    def flush(fallback=None):
        if not current:
            return
        text = "".join(word["text"] for word in current).strip()
        start, end = current[0]["start"], current[-1]["end"]
        if end <= start:
            if fallback is None:
                return  # Keep zero-length word tokens attached to the next timed word.
            start, end = fallback
        if text and end > start:
            cues.append({"start": start, "end": end, "text": text, "words": list(current)})
        current.clear()

    for segment in segments:
        words = segment.words or []
        if not words:
            flush()
            if segment.text.strip() and segment.end > segment.start:
                cues.append({"start": segment.start, "end": segment.end, "text": segment.text.strip()})
            continue
        for word in words:
            if not word.word.strip():
                continue
            if word.end < word.start:
                raise ValueError("Speech recognizer returned a reversed word timestamp.")
            item = {"start": round(word.start, 3), "end": round(word.end, 3), "text": word.word}
            candidate = "".join(value["text"] for value in current) + item["text"]
            if current and (len(candidate.strip()) > max_chars or item["end"] - current[0]["start"] > max_seconds):
                flush()
            current.append(item)
            if item["text"].rstrip().endswith(("。", "！", "？", ".", "!", "?", ";", "；")):
                flush()
            elif item["text"].rstrip().endswith((",", "，", ":", "：")) and len("".join(value["text"] for value in current).strip()) >= max(8, max_chars // 3):
                flush()
        flush((segment.start, segment.end))
        print(f"[{segment.start:.2f}-{segment.end:.2f}] {segment.text.strip()}", flush=True)
    flush()
    return cues


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--model-dir")
    parser.add_argument("--language", default="zh", help="Use auto for language detection.")
    parser.add_argument("--device", choices=["cpu", "cuda", "auto"], default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--max-chars", type=int)
    parser.add_argument("--prompt", help="Optional scientific terms from the actual narration.")
    args = parser.parse_args()
    from faster_whisper import WhisperModel

    print(f"Loading {args.model} ({args.device}, {args.compute_type}); uncached models download on first use.", flush=True)
    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type, download_root=args.model_dir)
    segments, info = model.transcribe(args.audio, language=None if args.language == "auto" else args.language,
                                      beam_size=5, word_timestamps=True, vad_filter=True, initial_prompt=args.prompt)
    cues = subtitle_cues(segments, args.max_chars or (24 if info.language in ["zh", "ja", "ko"] else 56))
    if not cues:
        raise ValueError("No speech detected. Check the audio or language setting.")
    result = {"source": "faster-whisper", "model": args.model, "runtime_version": importlib.metadata.version("faster-whisper"),
              "language": info.language, "language_probability": info.language_probability, "segments": cues}
    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(cues)} cues to {path}", flush=True)


if __name__ == "__main__":
    main()
