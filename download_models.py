import os
import time
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor

MODELS_DIR = "models"
os.makedirs(MODELS_DIR, exist_ok=True)

with open("models/atlas.json", "r", encoding="utf-8") as f:
    atlas = json.load(f)

chunks = atlas.get("chunks", [])
print(f"Total chunks to download: {len(chunks)}")

def download_chunk(chunk_info):
    url_path = chunk_info["url"].lstrip("/")
    filename = os.path.basename(url_path)
    target_path = os.path.join(MODELS_DIR, filename)

    expected_bytes = chunk_info.get("bytes", 0)
    if os.path.exists(target_path) and os.path.getsize(target_path) == expected_bytes:
        print(f"Already exists: {filename}")
        return True

    sources = [
        f"https://human-atlas-seven.vercel.app/{url_path}",
        f"https://raw.githubusercontent.com/ashemag/human-atlas/main/public/{url_path}"
    ]

    for src in sources:
        try:
            req = urllib.request.Request(src, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                with open(target_path, "wb") as out:
                    out.write(data)
                print(f"Downloaded {filename} ({len(data)} bytes) from {src.split('/')[2]}")
                return True
        except Exception as e:
            print(f"Failed {src}: {e}")

    return False

start_time = time.time()
with ThreadPoolExecutor(max_workers=5) as executor:
    results = list(executor.map(download_chunk, chunks))

print(f"Downloaded {sum(results)}/{len(chunks)} chunks in {time.time() - start_time:.2f}s")
