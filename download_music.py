import os
import subprocess

songs = {
    "waka_waka_es": "YOm6fMOoy_A",
    "gol": "RzFUy2cqQ6c",
    "wavin_flag_es": "w_Wi90rSOCw",
    "waka_waka_en": "czWcyZRAMtk",
    "wavin_flag_en": "o1zAYjyEwdY",
    "la_copa_de_la_vida": "Q8aL_msltWY",
    "we_are_one": "guwZDKE-MDM",
    "la_la_la": "2igups6VdcA",
    "colors": "ibqyu7bQ4-w",
    "curacao": "IsNSiZg9JzA",
    "magalenha": "02-4iJp61u0"
}

os.makedirs("music", exist_ok=True)

print("Starting playlist download...")
for name, video_id in songs.items():
    output = f"music/{name}.m4a"
    if os.path.exists(output) and os.path.getsize(output) > 1000000:
        print(f"Skipping {name} (already downloaded).")
        continue
        
    print(f"Downloading {name} ({video_id})...")
    url = f"https://www.youtube.com/watch?v={video_id}"
    cmd = ["yt-dlp", "-f", "bestaudio[ext=m4a]", url, "-o", output]
    subprocess.run(cmd)

print("All downloads completed successfully!")
