"""
Remove ALL white from logo — key out every white/near-white pixel.
Input:  assets/logo.png
Output: assets/logo-transparent.png
"""

from PIL import Image
import numpy as np

img = Image.open("assets/logo.png").convert("RGBA")
data = np.array(img)

r, g, b = data[:, :, 0].astype(float), data[:, :, 1].astype(float), data[:, :, 2].astype(float)

# Brightness of each pixel
brightness = (r + g + b) / 3

# Saturation (difference between max and min channel)
max_c = np.maximum(r, np.maximum(g, b))
min_c = np.minimum(r, np.minimum(g, b))
saturation = max_c - min_c

# Key out: anything white/near-white (low saturation + high brightness)
# Hard cutoff: fully transparent
white_mask = (brightness > 200) & (saturation < 50)
data[white_mask, 3] = 0

# Soft edge: partially transparent for semi-white pixels
semi_white = (brightness > 150) & (saturation < 80) & ~white_mask
# Fade: whiter = more transparent
whiteness = np.clip((brightness[semi_white] - 150) / 50, 0, 1)
data[semi_white, 3] = (255 * (1 - whiteness * 0.9)).astype(np.uint8)

result = Image.fromarray(data)
result.save("assets/logo-transparent.png")
print(f"Saved assets/logo-transparent.png ({result.size[0]}x{result.size[1]})")
