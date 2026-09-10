# -*- coding: utf-8 -*-
"""Rebuild kf_subject.png: RGB from sunset final + alpha from silhouette."""
from PIL import Image, ImageFilter
import os

SRC = r"D:/ZHT/生产实习/.workbuddy/gen-images"
DST = r"D:/ZHT/生产实习/frontend/public/assets/demo"
CROP = 90

def load(name):
    return Image.open(os.path.join(SRC, name)).convert("RGB")

def crop_bottom(img, px=CROP):
    w, h = img.size
    return img.crop((0, 0, w, max(1, h - px)))

ref = load("v_gray.png"); ref = crop_bottom(ref)
final = crop_bottom(load("v_final.png"), 60)
sil = crop_bottom(load("v_sil.png"))
if final.size != ref.size: final = final.resize(ref.size, Image.LANCZOS)
if sil.size != ref.size: sil = sil.resize(ref.size, Image.LANCZOS)

alpha = sil.convert("L").point(lambda v: 255 if v > 110 else 0).filter(ImageFilter.GaussianBlur(1.6))
subject = final.convert("RGBA")
subject.putalpha(alpha)
p = os.path.join(DST, "kf_subject.png")
subject.save(p)
print("rebuilt", subject.size, os.path.getsize(p)//1024, "KB")
