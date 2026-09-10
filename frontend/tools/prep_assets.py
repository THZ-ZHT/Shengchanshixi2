# -*- coding: utf-8 -*-
"""Prepare ImageCompose demo assets: crop watermarks, build RGBA subject, ASCII rename."""
from PIL import Image, ImageFilter
import os

SRC = r"D:\ZHT\生产实习\.workbuddy\gen-images"
BG = r"D:\ZHT\生产实习\frontend\public\assets\bg"
DST = r"D:\ZHT\生产实习\frontend\public\assets\demo"
os.makedirs(BG, exist_ok=True)
os.makedirs(DST, exist_ok=True)

CROP = 90  # watermark strip at bottom


def load(name):
    return Image.open(os.path.join(SRC, name)).convert("RGB")


def crop_bottom(img, px=CROP):
    w, h = img.size
    return img.crop((0, 0, w, max(1, h - px)))


def save(img, folder, name):
    p = os.path.join(folder, name)
    img.save(p)
    print(name, img.size, os.path.getsize(p) // 1024, "KB")


# ---- demo keyframes (side-pose family, must stay aligned) ----
gray = crop_bottom(load("v_gray.png"))
black = crop_bottom(load("纯黑色背景_画面中央是这个人物_侧面_黑色长发_米白毛衣_双_2026-09-09T04-56-17.png"))
sil = crop_bottom(load("v_sil.png"))
matte = crop_bottom(load("v_mask2.png"))
final = crop_bottom(load("v_final.png"), 60)

print("sizes:", gray.size, black.size, sil.size, matte.size, final.size)

# normalize all to gray's size if they differ slightly
ref = gray.size
if black.size != ref:
    black = black.resize(ref, Image.LANCZOS)
if sil.size != ref:
    sil = sil.resize(ref, Image.LANCZOS)
if matte.size != ref:
    matte = matte.resize(ref, Image.LANCZOS)
if final.size != ref:
    final = final.resize(ref, Image.LANCZOS)

save(gray, DST, "kf_gray_city.png")
save(final, DST, "kf_final.png")
save(matte, DST, "kf_matte.png")
save(sil, DST, "kf_silhouette.png")

# ---- RGBA subject: alpha from silhouette, color from black-bg image ----
alpha = sil.convert("L").point(lambda v: 255 if v > 110 else 0)
alpha = alpha.filter(ImageFilter.GaussianBlur(1.6))
subject = black.convert("RGBA")
subject.putalpha(alpha)
save(subject, DST, "kf_subject.png")

# ---- indoor portrait (upload thumbnail / research sample) ----
indoor = Image.open(os.path.join(SRC, "真实摄影照片_横构图_一位年轻亚洲女性半身坐姿肖像_黑色长发_2026-09-09T04-39-56_cropped.png")).convert("RGB")
save(indoor, DST, "kf_indoor.png")

# ---- workspace background presets (freshly AI-generated) ----
mapping = {
    "真实摄影照片_横构图_傍晚的咖啡馆内景_温暖的琥珀色灯光_木_2026-09-09T07-38-55.png": "bg_cafe.png",
    "真实摄影照片_横构图_夕阳时分的湖边_金色阳光洒在水面_远山_2026-09-09T07-38-56.png": "bg_lake.png",
    "真实摄影照片_横构图_现代城市街道黄昏_玻璃幕墙建筑与霓虹初_2026-09-09T07-38-49.png": "bg_city.png",
    "真实摄影照片_横构图_清晨森林_薄雾与丁达尔光束穿过树梢_青_2026-09-09T07-38-48.png": "bg_forest.png",
}
for src, dst in mapping.items():
    img = crop_bottom(load(src))
    if img.size[0] > 1536:
        img = img.resize((1536, int(img.size[1] * 1536 / img.size[0])), Image.LANCZOS)
    save(img, BG, dst)

print("DONE")
