"""
Convert the cropped logo to a Windows .ico file with multiple sizes.
Input:  assets/logo-cropped.png
Output: resources/icon.ico
        resources/icon.png (256x256 for Linux/general use)
"""

from PIL import Image

logo = Image.open("assets/logo-transparent.png")

# Generate ICO with standard Windows icon sizes
sizes = [16, 24, 32, 48, 64, 128, 256]
icons = []
for size in sizes:
    resized = logo.resize((size, size), Image.LANCZOS)
    icons.append(resized)

# Save .ico — start from 256x256 (the largest), append the rest
# Pillow ICO requires the first image to be the largest
icons[-1].save(
    "resources/icon.ico",
    format="ICO",
    append_images=icons[:-1]  # append 16–128
)
print(f"Saved resources/icon.ico ({len(sizes)} sizes: {sizes})")

# Also save a 256x256 PNG for Linux and electron-builder
png_256 = logo.resize((256, 256), Image.LANCZOS)
png_256.save("resources/icon.png")
print("Saved resources/icon.png (256x256)")

# Save 512x512 for macOS
png_512 = logo.resize((512, 512), Image.LANCZOS)
png_512.save("resources/icon-512.png")
print("Saved resources/icon-512.png (512x512)")
