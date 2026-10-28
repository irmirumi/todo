# 앱 문구 목록 뽑기: dev/src/ui.js 등에서 한글이 든 문자열을 줄 단위로 모아 사람이 읽을 수 있는 목록(마크다운)으로.
# 쓰는 곳: 다른 AI(Gemini 등)에게 문구 다듬기를 맡길 때. 번호 = "파일:줄". 돌려받은 수정안은 Claude가 그 줄을 보고 손으로 반영한다(자동 치환 안 함).
# 표기: {…} = 앱이 넣는 값(개수·날짜·이름 등), ｜ = 조건에 따라 둘 중 하나 / 따로 쓰이는 조각
import re, sys, os, html, collections
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SCREEN = {  # 함수 이름 → 화면
 "renderLogin":"로그인 화면","renderConfig":"설정 안 된 상태 화면","renderCal":"캘린더 탭 · 달력","renderDay":"캘린더 탭 · 그날 목록","renderAll":"전체 탭","addAllRow":"전체 탭 · 추가 줄",
 "renderWeek":"시간표 탭","ttTitle":"시간표 탭 · 제목","placeTT3":"시간표 탭(폰 3일 보기)","drawSlot":"시간표 빈칸을 눌렀을 때","drawGroup":"시간표 · 겹친 일정 목록",
 "drawEdit":"할 일 · 반복 할 일 편집 창","timeInput":"편집 창 · 시간 입력","oneTime":"편집 창 · 시간 입력","durRow":"편집 창 · 길이","dateChip":"할 일 줄 · 날짜 표시",
 "infoBody":"정보 창(시간표에서 누를 때)","drawInfo":"정보 창(시간표에서 누를 때)","drawEv":"고정 일정 편집 창","slotCard":"고정 일정 편집 창 · 요일·시간 줄","commitEv":"고정 일정 저장 알림",
 "drawEvs":"설정 › 고정 일정 목록","drawEvDay":"고정 일정 · 이 날만 바꾸기","commitEvDay":"고정 일정 · 이 날만 바꾸기 알림","drawTpls":"설정 › 반복 할 일 목록","commitTpl":"반복 할 일 저장 알림",
 "drawMenu":"설정 메뉴(⋯)","drawCats":"설정 › 카테고리 관리","drawNotify":"설정 › 알림","drawExport":"설정 › 내보내기","drawImport":"설정 › 가져오기","parseImport":"가져오기 오류",
 "drawLater":"'안 함' · 언제 할까요 창","doLater":"'안 함' 알림","onError":"오류 알림","removeWithUndo":"삭제 알림","reopenDraft":"편집 창 닫힘 알림","closeDlg":"편집 창 닫힘 알림",
 "quickHint":"한 줄 입력 힌트","parseQuick":"한 줄 입력","dsecHead":"캘린더 탭 · 카테고리 머리","ghostRow":"반복 할 일(흐린 줄)","navCal":"캘린더 이동",
 "chk":"할 일 줄 · 체크","row":"할 일 줄","group":"캘린더 탭 · 카테고리 묶음","render":"화면 공통","commitCats":"카테고리 저장 알림","handleEnter":"입력칸에서 엔터",
 "(이벤트)":"화면 공통 동작","(맨 위)":"공통 단어(요일·기본 카테고리·알림 시점)",
 "daysLabel":"요일 표기","relWord":"날짜 말(오늘·내일)","holName":"공휴일 이름","fmtTime":"시간 표기","fmtRange":"시간 표기","durText":"길이 표기","parseDur":"길이 입력","parseTime":"시간 입력",
}
def strip_comments(s):
    # 이 코드는 주석이 줄 맨 앞 /* */ 또는 // 꼴이라 정규식으로 충분하다(줄 수는 지킨다)
    s=re.sub(r"/\*.*?\*/",lambda m:"\n"*m.group(0).count("\n"),s,flags=re.S)
    return re.sub(r"(?m)^\s*//.*$","",s)
SKIP={"qHour","qTime","qEnd","qDate","qDays","parseTime","parseDur","holName","ghostsFor","eventsOn","occKey","clean","cleanSlots","parseImport_"}
LIT=re.compile(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"|`((?:[^`\\]|\\.)*)`")
def template(line):
    parts=[];pos=0
    for m in LIT.finditer(line):
        gap=line[pos:m.start()];pos=m.end()
        txt=next(g for g in m.groups() if g is not None)
        if parts:parts.append(("gap",gap))
        parts.append(("lit",txt))
    out="";hangul=False
    for kind,v in parts:
        if kind=="gap":
            g=v.strip()
            if g in("+",""):continue
            if re.search(r"[?:]|\|\||&&|[;,)]\s*$|^[;,(]",g):out+=" ｜ "
            elif re.fullmatch(r"\+.*\+",g,re.S):out+="{…}"
            else:out+=" ｜ "
        else:
            t=v.replace("\\n"," ")
            t=re.sub(r'placeholder="([^"]*)"',lambda m:' ｜ [입력칸 안내] '+m.group(1)+' ｜ ' if re.search("[가-힣]",m.group(1)) else ' ',t)
            t=re.sub(r'(?:aria-label|title)="([^"]*)"',lambda m:' ｜ [화면 읽기용] '+m.group(1)+' ｜ ' if re.search("[가-힣]",m.group(1)) else ' ',t)
            t=re.sub(r'[\w-]+="[^"]*"?',' ',t)
            t=re.sub(r"</?(?:b|i|em|strong|br)\b[^>]*>","",t);t=re.sub(r"<[^>]*>?"," ｜ ",t);t=re.sub(r'^[^<]*?>'," ",t) if '>' in t and '<' not in t.split('>')[0] and not re.search("[가-힣]",t.split('>')[0]) else t
            t=t.replace('"',' ').replace('>',' ');t=html.unescape(t).replace("\\'","'").replace('\\"','"')
            if re.search("[가-힣]",t):hangul=True;out+=t
            elif re.fullmatch(r"[\s·.,:()~–\-/!?%]+",t) and t.strip():out+=t
            else:out+=" ｜ "
    out=" ｜ ".join(re.sub(r"\s+"," ",x).strip() for x in out.split("｜") if re.search("[가-힣]",x) or re.search(r"[~·]",x) and len(x.strip())<=3)
    out=re.sub(r"^[\s｜]+|[\s｜]+$","",out)
    return out if hangul else None
def scan(path,rel):
    s=strip_comments(open(path,encoding="utf-8").read()).split("\n")
    cur="(맨 위)";case=None;rows=[]
    for i,ln in enumerate(s,1):
        m=re.match(r"\s*(?:async\s+)?function\s+(\w+)",ln)
        if m:cur=m.group(1);case=None
        if re.match(r"document\.addEventListener|window\.addEventListener|dlg\.addEventListener",ln):cur="(이벤트)";case=None
        c=re.search(r'case\s*"(\w+)"',ln)
        if c:case=c.group(1)
        if re.search(r"\bRegExp\b|new RegExp|\.match\(|\.test\(|replace\(/",ln) and not re.search(r"toast\(|drawSheet|h\+=|return\s*'",ln):continue
        if cur in SKIP:continue
        t=template(ln)
        if not t:continue
        scr="버튼을 누른 뒤 뜨는 알림·동작" if cur in("(이벤트)","commitCats") and case else SCREEN.get(cur) or "기타(%s)"%cur
        rows.append((scr,"%s:%d"%(rel,i),t))
    return rows
rows=scan(os.path.join(ROOT,"src","ui.js"),"ui")+scan(os.path.join(ROOT,"src","markup.html"),"markup")+scan(os.path.join(ROOT,"src","pwa","push.js"),"push")+scan(os.path.join(ROOT,"src","pwa","app.js"),"app")
order=collections.OrderedDict()
for scr,id_,t in rows:order.setdefault(scr,[]).append((id_,t))
out=["# 또박 앱 문구 목록","","코드에서 자동으로 뽑은 목록이에요. 화면별로 묶었고, 앞의 번호(파일:줄)로 원문을 찾아요.","`{…}` = 앱이 값을 넣는 자리, ` ｜ ` = 따로 쓰이는 조각의 경계, [입력칸 안내]·[화면 읽기용] = 입력칸 흐린 글·낭독기용 글.",""]
for scr,items in order.items():
    out.append("## "+scr);out.append("")
    for id_,t in items:out.append("- **%s** %s"%(id_,t))
    out.append("")
dst=sys.argv[1] if len(sys.argv)>1 else os.path.join(ROOT,"..","handoff","문구목록.md")
os.makedirs(os.path.dirname(dst),exist_ok=True)
open(dst,"w",encoding="utf-8").write("\n".join(out))
print(len(rows),"줄 →",dst)
