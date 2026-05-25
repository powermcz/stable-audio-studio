"""
Generate app header banner from the cropped logo.
Creates a wide header image (1200x300) with the logo on the left and app title.
Input:  assets/logo-cropped.png
Output: assets/header.png
"""

from PIL import Image, ImageDraw, ImageFont

HEADER_W, HEADER_H = 1200, 300
BG_COLOR = (24, 16, 8, 255)  # warm near-black

header = Image.new("RGBA", (HEADER_W, HEADER_H), BG_COLOR)

# Place logo on the left
logo = Image.open("assets/logo-transparent.png")
logo_h = HEADER_H - 40  # 20px padding top and bottom
logo_w = int(logo.width * (logo_h / logo.height))
logo_resized = logo.resize((logo_w, logo_h), Image.LANCZOS)
header.paste(logo_resized, (20, 20), logo_resized)

# Draw title text
draw = ImageDraw.Draw(header)
try:
    title_font = ImageFont.truetype("arial.ttf", 48)
    sub_font = ImageFont.truetype("arial.ttf", 20)
except OSError:
    title_font = ImageFont.load_default()
    sub_font = ImageFont.load_default()

text_x = logo_w + 50
draw.text((text_x, 80), "Stable Audio Studio", fill=(255, 255, 255, 255), font=title_font)
draw.text((text_x, 145), "AI-powered audio generation", fill=(156, 163, 175, 255), font=sub_font)

header.save("assets/header.png")
print(f"Saved assets/header.png ({HEADER_W}x{HEADER_H})")
