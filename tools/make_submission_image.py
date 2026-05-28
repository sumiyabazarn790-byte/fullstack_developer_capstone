import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def load_font(size, bold=False):
    candidates = [
        "C:/Windows/Fonts/consolab.ttf" if bold else "C:/Windows/Fonts/consola.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


payload = json.loads(sys.argv[1])
output = payload["output"]
title = payload["title"]
lines = payload["lines"]
theme = payload.get("theme", "terminal")

width = 1280
height = 780
if theme == "github":
    bg = "#ffffff"
    fg = "#24292f"
    muted = "#57606a"
    accent = "#1a7f37"
    top = "#f6f8fa"
else:
    bg = "#111111"
    fg = "#f1f5f9"
    muted = "#eab308"
    accent = "#22c55e"
    top = "#1f2937"

img = Image.new("RGB", (width, height), bg)
draw = ImageDraw.Draw(img)
title_font = load_font(26, True)
body_font = load_font(20)
small_font = load_font(16)

if theme == "github":
    draw.rectangle([0, 0, width, 72], fill=top)
    draw.text((34, 22), title, fill=fg, font=title_font)
    draw.rounded_rectangle([1040, 20, 1190, 52], radius=16, fill="#dafbe1", outline="#2da44e")
    draw.text((1080, 26), "Success", fill=accent, font=small_font)
    y = 104
    for line in lines:
        color = accent if "success" in line.lower() or "Conclusion: success" in line else fg
        if line.startswith("http"):
            color = "#0969da"
        if line.startswith("Job:") or line.startswith("Workflow:") or line.startswith("Repository:"):
            color = fg
        draw.text((54, y), line, fill=color, font=body_font)
        y += 30
else:
    draw.rectangle([0, 0, width, 54], fill=top)
    draw.ellipse([18, 18, 34, 34], fill="#ef4444")
    draw.ellipse([44, 18, 60, 34], fill="#f59e0b")
    draw.ellipse([70, 18, 86, 34], fill="#22c55e")
    draw.text((108, 16), title, fill=fg, font=small_font)
    y = 88
    for line in lines:
        color = muted if line.startswith("WARNING") or line.startswith("For more") else fg
        if "Starting development server" in line or "no issues" in line:
            color = accent
        draw.text((34, y), line, fill=color, font=body_font)
        y += 30

img.save(output)
