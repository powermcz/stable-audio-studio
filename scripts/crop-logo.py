"""
Crop the center 75% of the transparent logo (removes 12.5% from each edge).
Input:  assets/logo-transparent.png
Output: assets/logo-cropped.png
"""

from PIL import Image

img = Image.open("assets/logo-transparent.png")
w, h = img.size

# Crop 25% total — remove 12.5% from each side
margin_x = int(w * 0.125)
margin_y = int(h * 0.125)
cropped = img.crop((margin_x, margin_y, w - margin_x, h - margin_y))

cropped.save("assets/logo-cropped.png")
print(f"Saved assets/logo-cropped.png ({cropped.size[0]}x{cropped.size[1]})")
