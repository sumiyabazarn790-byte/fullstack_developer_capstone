import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def load_font(size):
    candidates = [
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


raw_path, output_path, url = sys.argv[1], sys.argv[2], sys.argv[3]
page = Image.open(raw_path).convert("RGB")
bar_height = 76
out = Image.new("RGB", (page.width, page.height + bar_height), "#f5f5f5")
draw = ImageDraw.Draw(out)

draw.rectangle([0, 0, page.width, bar_height], fill="#f6f6f6")
draw.rectangle([0, bar_height - 1, page.width, bar_height], fill="#dddddd")

font = load_font(18)
icon_font = load_font(24)

draw.text((24, 24), "<", fill="#333333", font=icon_font)
draw.text((58, 24), ">", fill="#333333", font=icon_font)
draw.text((94, 25), "↻", fill="#333333", font=icon_font)

address_x = 126
address_y = 16
address_h = 44
draw.rounded_rectangle(
    [address_x, address_y, page.width - 32, address_y + address_h],
    radius=22,
    fill="#ffffff",
    outline="#d0d0d0",
)
draw.text((address_x + 22, address_y + 11), url, fill="#1f2937", font=font)

out.paste(page, (0, bar_height))
out.save(output_path)
