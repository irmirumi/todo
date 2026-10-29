"""WCAG sRGB contrast of current CSS tokens, not screenshot pixel sampling."""
import json, re
from pathlib import Path
root=Path(__file__).resolve().parents[3]
s=(root/'dev/src/style.css').read_text()
blocks=[s[s.index(':root{'):s.index('@media')],s[s.index(':root[data-theme="dark"]'):s.index('*,*::before')]]
def rgb(h):return [int(h[i:i+2],16)/255 for i in (0,2,4)]
def lum(c):return sum((v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4)*w for v,w in zip(c,[.2126,.7152,.0722]))
def ratio(a,b):
 x,y=sorted([lum(a),lum(b)]);return round((y+.05)/(x+.05),2)
out={}
for theme,block in zip(['light','dark'],blocks):
 t={k:rgb(v) for k,v in re.findall(r'--([\w-]+):#([0-9a-fA-F]{6})',block)}
 out[theme]={'muted_on_bg':ratio(t['muted'],t['bg']),'muted_on_sunk':ratio(t['muted'],t['sunk']),'primary_button':ratio(t['accent-ink'],t['accent']),
 'event_white_title_on_78_percent_category':{f'c{i}':ratio([1,1,1],[.78*a+.22*b for a,b in zip(t[f'c{i}'],t['surface'])]) for i in range(1,9)}}
print(json.dumps(out,ensure_ascii=False,indent=2))
