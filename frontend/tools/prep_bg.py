# -*- coding: utf-8 -*-
from PIL import Image
import os, glob
BG = r"D:/ZHT/生产实习/frontend/public/assets/bg"
CROP = 90
keymap = [("07-38-55", "bg_cafe.png"), ("07-38-56", "bg_lake.png"), ("07-38-49", "bg_city.png"), ("07-38-48", "bg_forest.png")]
for key, dst in keymap:
    src = next(f for f in glob.glob(os.path.join(BG, "*.png")) if key in os.path.basename(f))
    img = Image.open(src).convert("RGB")
    w, h = img.size
    img = img.crop((0, 0, w, h - CROP))
    img.save(os.path.join(BG, dst))
    os.remove(src)
    print(dst, img.size)
print("BG DONE")
