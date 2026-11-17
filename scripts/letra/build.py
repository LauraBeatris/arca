"""Step 2: trace the letters chosen in SRC into outlines and build the font,
app/fonts/laura-mao.woff2, plus the arrow and crossing-out for
components/desk/caneta.ts (gerado/marcas.json).

Run from the repository root with a Python that has opencv-python-headless,
numpy, scikit-image, fonttools, brotli and potracer installed (see README.md
in this folder).
"""
import os
BASE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(BASE, "gerado"), exist_ok=True)
import cv2, numpy as np, json, potrace
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString

CROPS = {"S":"sebastiao","U":"ulisses_nota","T":"ulisses_titulo"}
LINES = {"S":[(20,185),(195,358),(360,485),(495,630)],
         "U":[(35,148),(155,240),(230,312),(335,440),(430,590)],
         "T":[(0,135),(135,225)]}
XH_LETTERS = None
cc = json.load(open(BASE+"/gerado/cc.json"))

# ---- per crop: labels, and per line baseline/x-height
data = {}
for k,n in CROPS.items():
    bw = (cv2.imread(f"{BASE}/gerado/{n}_bw.png",0) < 128).astype(np.uint8)
    num, lab, stats, cent = cv2.connectedComponentsWithStats(bw,8)
    comps = cc[n]
    def lab_of(c, num=num, stats=stats):
        for i in range(1,num):
            if tuple(int(v) for v in stats[i])==tuple(c): return i
    lines=[]
    for (y0,y1) in LINES[k]:
        inl=[c for c in comps if y0 <= c[1]+c[3]/2 < y1 and c[4]>150]
        hs=np.array([c[3] for c in inl]); med=np.median(hs)
        xs=[c for c in inl if 0.55*med < c[3] < 1.35*med]
        bx=np.array([c[0]+c[2]/2 for c in xs]); by=np.array([c[1]+c[3] for c in xs]); ty=np.array([c[1] for c in xs])
        if len(xs)>=3:
            A=np.vstack([bx,np.ones_like(bx)]).T
            slope,icpt=np.linalg.lstsq(A,by,rcond=None)[0]
        else: slope,icpt=0,np.median(by)
        xh=np.median(by-ty)
        lines.append((y0,y1,slope,icpt,xh))
    data[k]=(bw,lab,lab_of,lines,comps)

def trace_source(k, ids, xr=None):
    bw,lab,lab_of,lines,comps = data[k]
    boxes=[comps[i] for i in ids]
    ls=[lab_of(c) for c in boxes]
    x0=min(b[0] for b in boxes); y0=min(b[1] for b in boxes)
    x1=max(b[0]+b[2] for b in boxes); y1=max(b[1]+b[3] for b in boxes)
    if xr: x0,x1=max(x0,xr[0]),min(x1,xr[1])
    m=np.isin(lab[y0:y1,x0:x1], ls)
    cy=(y0+y1)/2
    line=min(lines,key=lambda L: 0 if L[0]<=cy<L[1] else min(abs(cy-L[0]),abs(cy-L[1])))
    _,_,slope,icpt,xh=line
    # main line: the line holding most of the glyph's first component's center
    c0=boxes[0]; cy0=c0[1]+c0[3]/2
    line=min(lines,key=lambda L: 0 if L[0]<=cy0<L[1] else 1e9)
    _,_,slope,icpt,xh=line
    cx=(x0+x1)/2; base=slope*cx+icpt
    S=3
    f=cv2.resize(m.astype(np.float32),None,fx=S,fy=S,interpolation=cv2.INTER_CUBIC)
    f=cv2.GaussianBlur(f,(0,0),1.2)
    mm=np.pad(f>0.5,8)
    path=potrace.Bitmap(~mm).trace(turdsize=6,alphamax=1.0,opticurve=True,opttolerance=0.15)
    sc=500.0/xh
    def tr(p):  # bitmap point -> font units
        px=(p.x-8)/S + x0; py=(p.y-8)/S + y0
        # deskew: remove baseline slope
        py = py - slope*(px-cx)
        return ((px-x0)*sc, (base-py)*sc)
    rec=RecordingPen()
    for curve in path:
        rec.moveTo(tr(curve.start_point))
        for seg in curve.segments:
            if seg.is_corner:
                rec.lineTo(tr(seg.c)); rec.lineTo(tr(seg.end_point))
            else:
                rec.curveTo(tr(seg.c1),tr(seg.c2),tr(seg.end_point))
        rec.closePath()
    return rec

SRC = {
 "a":[("U",[13]),("S",[8]),("U",[16]),("T",[20]),("S",[53])],
 "b":[("T",[16])],
 "c":[("S",[46])],
 "d":[("T",[8]),("S",[14]),("S",[40])],
 "e":[("S",[17]),("U",[9]),("S",[0]),("U",[29])],
 "F":[("T",[5]),("S",[43,44])],
 "g":[("S",[3]),("U",[33])],
 "i0":[("S",[28])],
 "j0":[("S",[21])],
 "l":[("S",[30]),("U",[32]),("T",[15])],
 "m":[("U",[30]),("S",[13])],
 "n":[("S",[39]),("T",[7])],
 "o":[("U",[5]),("T",[3]),("S",[42])],
 "p":[("U",[7]),("S",[24])],
 "q":[("U",[1]),("S",[35])],
 "r":[("S",[4]),("U",[20]),("S",[45])],
 "s":[("S",[20]),("S",[26]),("U",[12]),("T",[18])],
 "t":[("T",[4],(507,543))],
 "h":[("U",[27])],
 "u":[("S",[36])],
 "v":[("S",[29],(412,462))],
 "x":[("S",[1])],
 "z":[("S",[7])],
 "question":[("S",[51,54])],
 "comma":[("S",[33])],
 "period":[("S",[54])],
 "tick":[("U",[11])],
 "bar":[("S",[44])],
}
traced={}
for name,srcs in SRC.items():
    traced[name]=[trace_source(*s) for s in srcs]

def bounds(rec):
    bp=BoundsPen(None); rec.replay(bp); return bp.bounds
def xf(rec, a=1,b=0,c=0,d=1,e=0,f=0):
    out=RecordingPen(); rec.replay(TransformPen(out,(a,b,c,d,e,f))); return out
def merge(*recs):
    out=RecordingPen()
    for r in recs: out.value.extend(r.value)
    return out
def place(rec, x=None, y=None, cx=None, top=None, bottom=None, sx=1, sy=1):
    b=bounds(rec); r=xf(rec,sx,0,0,sy,0,0); b=bounds(r)
    dx=dy=0
    if cx is not None: dx=cx-(b[0]+b[2])/2
    if x is not None: dx=x-b[0]
    if top is not None: dy=top-b[3]
    if bottom is not None: dy=bottom-b[1]
    if y is not None: dy=y-b[1]
    return xf(r,1,0,0,1,dx,dy)

tick=traced["tick"][0]
def with_dot(rec, height=760):
    b=bounds(rec)
    return merge(rec, place(tick, cx=b[2]-(b[2]-b[0])*0.25, bottom=height))
traced["i"]=[with_dot(r, 640) for r in traced["i0"]]
traced["j"]=[with_dot(r, 640) for r in traced["j0"]]

# derived letters (rare in Portuguese)
v=traced["v"][0]; jj=traced["j0"][0]; l0=traced["l"][0]; c0=traced["c"][0]
bv=bounds(v)
traced["w"]=[merge(v, place(v, x=bv[0]+(bv[2]-bv[0])*0.62, y=bv[1]))]
jb=bounds(jj)
traced["y"]=[merge(v, place(xf(jj,1,0,0,1,0,0), x=bv[2]-(jb[2]-jb[0])*0.75, top=bv[3]-120))]
lb=bounds(l0)
traced["k"]=[merge(l0, place(xf(c0,-0.8,0,0,0.9,0,0), x=lb[2]-10, y=0))]

# accents
grave=place(tick, sx=1.15, sy=1.15, cx=0, bottom=0)
acute=xf(grave,-1,0,0,1,0,0)
n0=traced["n"][1]
tilde=place(xf(n0,0.55,0,0,0.32,0,0), cx=0, bottom=0)
circ=place(xf(v,0.5,0,0,-0.45,0,0), cx=0, bottom=0)
comma=traced["comma"][0]
ced=place(xf(comma,0.8,0,0,0.8,0,0), cx=0, top=0)
def accent(base, acc, gap=40, center_shift=0):
    b=bounds(base); ab=bounds(acc)
    top=max(b[3], 520) if b[3] < 700 else 520
    return merge(base, xf(acc,1,0,0,1,(b[0]+b[2])/2+center_shift-(ab[0]+ab[2])/2, top+gap-ab[1]))
def below(base, acc):
    b=bounds(base); ab=bounds(acc)
    return merge(base, xf(acc,1,0,0,1,(b[0]+b[2])/2-(ab[0]+ab[2])/2, b[1]-10-ab[3]))

ACC = {"aacute":("a",acute),"agrave":("a",grave),"acircumflex":("a",circ),"atilde":("a",tilde),
       "eacute":("e",acute),"ecircumflex":("e",circ),"oacute":("o",acute),"ocircumflex":("o",circ),
       "otilde":("o",tilde),"uacute":("u",acute),"udieresis":("u",None)}
for name,(base,acc) in ACC.items():
    if acc is None:
        d1=place(tick,cx=-60,bottom=0); d2=place(tick,cx=60,bottom=0)
        traced[name]=[accent(r, merge(d1,d2)) for r in traced[base]]
    else:
        traced[name]=[accent(r, acc) for r in traced[base]]
traced["iacute"]=[accent(r, acute) for r in traced["i0"]]
traced["ccedilla"]=[below(r, ced) for r in traced["c"]]
# punctuation
per=traced["period"][0]; bar=traced["bar"][0]
traced["colon"]=[merge(place(per,x=0,y=0), place(per,x=0,y=330))]
traced["semicolon"]=[merge(place(comma,x=0,top=150), place(per,x=10,y=330))]
traced["exclam"]=[merge(place(l0,x=0,y=180,sy=0.8), place(per,x=10,y=0))]
traced["hyphen"]=[place(bar,x=0,cx=None,bottom=230,sx=0.7,sy=0.9)]
traced["endash"]=[place(bar,x=0,bottom=230,sx=1.1)]
traced["emdash"]=[place(bar,x=0,bottom=230,sx=1.8)]
traced["quotesingle"]=[place(tick,x=0,bottom=620,sx=1.3,sy=1.6)]
traced["quoteright"]=[place(comma,x=0,bottom=560,sx=0.8,sy=0.8)]
traced["period"]=[place(per,x=0,y=0)]
traced["comma"]=[place(comma,x=0,top=110)]

CMAP = {c:c for c in "abcdeghijklmnopqrstuvwxyz"}
CMAP.update({"F":"F","f":"F"})
for c in "ABCDEGHIJKLMNOPQRSTUVWXYZ": CMAP[c]=c.lower()
CMAP.update({"á":"aacute","à":"agrave","â":"acircumflex","ã":"atilde","é":"eacute","ê":"ecircumflex",
  "í":"iacute","ó":"oacute","ô":"ocircumflex","õ":"otilde","ú":"uacute","ü":"udieresis","ç":"ccedilla",
  "Á":"aacute","À":"agrave","Â":"acircumflex","Ã":"atilde","É":"eacute","Ê":"ecircumflex","Í":"iacute",
  "Ó":"oacute","Ô":"ocircumflex","Õ":"otilde","Ú":"uacute","Ç":"ccedilla",
  ".":"period",",":"comma","?":"question",":":"colon",";":"semicolon","!":"exclam","-":"hyphen",
  "–":"endash","—":"emdash","'":"quotesingle","’":"quoteright"," ":"space"," ":"space"})

LETTERS=[g for g in sorted(set(CMAP.values())) if g!="space"]
NSETS=3
glyphs={}   # name -> RecordingPen
for g in LETTERS:
    vs=traced[g]
    for k in range(NSETS):
        nm = g if k==0 else f"{g}.alt{k}"
        glyphs[nm]=vs[k % len(vs)]

SB=45
order=[".notdef","space"]+[n for n in glyphs]
fb=FontBuilder(1000,isTTF=False)
fb.setupGlyphOrder(order)
cmap={ord(ch):g for ch,g in CMAP.items()}
fb.setupCharacterMap(cmap)
charstrings={}; metrics={}
def cs_for(rec, adv, shift):
    pen=T2CharStringPen(adv,None)
    rec.replay(TransformPen(pen,(1,0,0,1,shift,0)))
    return pen.getCharString()
p=T2CharStringPen(500,None); p.moveTo((50,0));p.lineTo((450,0));p.lineTo((450,700));p.lineTo((50,700));p.closePath()
charstrings[".notdef"]=p.getCharString(); metrics[".notdef"]=(500,50)
p=T2CharStringPen(430,None); charstrings["space"]=p.getCharString(); metrics["space"]=(430,0)
for nm,rec in glyphs.items():
    b=bounds(rec)
    sb = 25 if nm.split(".")[0] in ("period","comma","colon","semicolon","exclam","question") else SB
    adv=int(round(b[2]-b[0]+2*sb))
    shift=sb-b[0]
    charstrings[nm]=cs_for(rec,adv,shift)
    metrics[nm]=(adv,int(round(sb)))
fb.setupCFF("LauraMao-Regular",{"FullName":"Laura Mao","FamilyName":"Laura Mao"},charstrings,{})
fb.setupHorizontalMetrics(metrics)
fb.setupHorizontalHeader(ascent=1000,descent=-420)
fb.setupNameTable({"familyName":"Laura Mao","styleName":"Regular"})
fb.setupOS2(sTypoAscender=1000,sTypoDescender=-420,sTypoLineGap=0,usWinAscent=1100,usWinDescent=520,sxHeight=500,sCapHeight=700)
fb.setupPost()
s0=" ".join(LETTERS); s1=" ".join(f"{g}.alt1" for g in LETTERS); s2=" ".join(f"{g}.alt2" for g in LETTERS)
fea=f"""
@S0 = [{s0}];
@S1 = [{s1}];
@S2 = [{s2}];
lookup ciclo {{
  sub @S0 @S0' by @S1;
  sub @S1 @S0' by @S2;
}} ciclo;
feature calt {{ lookup ciclo; }} calt;
"""
addOpenTypeFeaturesFromString(fb.font, fea)
fb.font.save(BASE+"/gerado/LauraMao.otf")
fb.font.flavor="woff2"; fb.font.save(os.path.join(BASE, "..", "..", "app", "fonts", "laura-mao.woff2"))

# The arrow and the crossed-out word, as SVG paths for components/desk/caneta.ts.
from fontTools.pens.svgPathPen import SVGPathPen
marks={}
for name,(k,ids) in {"seta":("T",[13,0]),"risco":("U",[14])}.items():
    rec=trace_source(k,ids); b=bounds(rec)
    pen=SVGPathPen(None, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
    rec.replay(TransformPen(pen,(0.1,0,0,-0.1,-b[0]*0.1,b[3]*0.1)))
    marks[name]={"width":round((b[2]-b[0])*0.1,1),"height":round((b[3]-b[1])*0.1,1),"d":pen.getCommands()}
json.dump(marks,open(BASE+"/gerado/marcas.json","w"))
print("glyphs", len(order))
