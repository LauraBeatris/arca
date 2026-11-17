"""Step 1: separate Laura's ink from the paper in each photo crop and number
the pieces of ink (gerado/*_cc.png shows the numbers).

Run from the repository root with a Python that has opencv-python-headless,
numpy, scikit-image, fonttools, brotli and potracer installed (see README.md
in this folder).
"""
import os
BASE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(BASE, "gerado"), exist_ok=True)
import cv2, numpy as np, json, sys
names = ["sebastiao","ulisses_nota","ulisses_titulo","sino_dolente","sino_tanjas","sino_distante"]
out = {}
for n in names:
    g = cv2.imread(f"{BASE}/fotos/{n}.png", cv2.IMREAD_GRAYSCALE)
    g = cv2.GaussianBlur(g,(3,3),0)
    # background estimate: large median, then ratio
    bg = cv2.medianBlur(g, 61)
    norm = cv2.divide(g, bg, scale=255)
    _, bw = cv2.threshold(norm, 0, 255, cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)
    bw = cv2.morphologyEx(bw, cv2.MORPH_OPEN, np.ones((2,2),np.uint8))
    cv2.imwrite(f"{BASE}/gerado/{n}_bw.png", 255-bw)
    num, lab, stats, cent = cv2.connectedComponentsWithStats(bw, 8)
    vis = cv2.cvtColor(255-bw, cv2.COLOR_GRAY2BGR)
    comps=[]
    for i in range(1,num):
        x,y,w,h,a = stats[i]
        if a < 40: continue
        comps.append((int(x),int(y),int(w),int(h),int(a)))
    comps.sort(key=lambda c:(c[1]//80, c[0]))
    for k,(x,y,w,h,a) in enumerate(comps):
        cv2.rectangle(vis,(x,y),(x+w,y+h),(0,0,255),1)
        cv2.putText(vis,str(k),(x,max(12,y-3)),cv2.FONT_HERSHEY_SIMPLEX,0.6,(255,0,0),2)
    cv2.imwrite(f"{BASE}/gerado/{n}_cc.png", vis)
    out[n]=comps
json.dump(out, open(BASE+"/gerado/cc.json","w"))
print({k:len(v) for k,v in out.items()})
