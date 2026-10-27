"""India NHO NAVAREA VIII: hourly public-page download and current in-force PDF.
Read the normal rendered download link; no private API calls, extracted credentials,
proxy, CAPTCHA solving, or retry loop. Failures keep the last successful snapshot.
"""
import io,json,math,re,sys
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urljoin,urlsplit,parse_qs
from urllib.request import Request,build_opener
from update_airspace import ROOT,NoRedirect,write_json,utcnow,date,position
from hazard_rules import classify
from maritime_time import times,MONTHS
from notam_text import extract,reference_points,combine_polygons,angle,refresh_shapes
URL='https://hydrobharat.gov.in/navarea-warnings/'
SOURCE='India National Hydrographic Office — NAVAREA VIII'
VERSION='navarea8-v1'
HOSTS={'hydrobharat.gov.in','www.hydrobharat.gov.in'}
PATH=ROOT/'web/maritime/in_navarea8.json'
HEADER=re.compile(r'(?m)^\s*(\d{6}Z\s*/\s*[A-Z]{3}\s+\d{2,4})\s*\n\s*NAVAREA\s+VIII\s*-\s*(\d+)/(\d{2,4})\s*\n')

def official_url(value):
    url=urljoin(URL,value);p=urlsplit(url)
    if p.scheme!='https' or p.hostname not in HOSTS or p.username or p.password or p.port not in (None,443):raise ValueError('untrusted_nho_url')
    if not p.path.startswith('/documents/') or set(parse_qs(p.query))-{'version','t','download'}:raise ValueError('untrusted_pdf_link')
    return url

def due(old,stamp):
    return not old or not old.get('metadata',{}).get('lastAttempt') or (date(stamp)-date(old['metadata']['lastAttempt'])).total_seconds()>=3600

def discover():
    # The official page updates this public link with JavaScript; the static HTML
    # also contains a historical July-2025 link which MUST NOT be used as current.
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        try:
            page=browser.new_page();response=page.goto(URL,wait_until='domcontentloaded',timeout=45000)
            if not response or response.status>=400:raise ValueError('official_page_unavailable')
            link=page.locator('#downloadBtn');link.wait_for(state='visible',timeout=30000)
            page.wait_for_function("() => {const a=document.getElementById('downloadBtn');return a && a.getAttribute('href') && a.getAttribute('href').includes('/documents/');}",timeout=45000)
            visible=page.locator('body').inner_text()
            if re.search(r'verify you are human|checking your browser|automated traffic|access denied',visible,re.I):raise ValueError('official_page_requires_review')
            return official_url(urljoin(page.url,link.get_attribute('href')))
        finally:browser.close()

def fetch_pdf(url):
    req=Request(official_url(url),headers={'User-Agent':'ALTA-SYSTEM-Research/5.0','Accept':'application/pdf'})
    with build_opener(NoRedirect()).open(req,timeout=30) as r:raw=r.read(8_000_001)
    if len(raw)>8_000_000 or not raw.startswith(b'%PDF'):raise ValueError('invalid_nho_pdf')
    return raw

def pdf_text(raw):
    from pypdf import PdfReader
    reader=PdfReader(io.BytesIO(raw))
    if reader.is_encrypted or not 1<=len(reader.pages)<=60:raise ValueError('unsupported_nho_pdf')
    text='\n'.join(p.extract_text() or '' for p in reader.pages)
    if not 100<=len(text)<=1_000_000:raise ValueError('invalid_nho_pdf_text')
    return text

def parse_document(text,stamp):
    report=re.search(r'NAVAREA\s+VIII\s*-\s*WARNINGS\s+IN\s+FORCE\s+AS\s+ON\s+(\d{1,2})\s+([A-Z]{3})\s+(20\d{2})',text,re.I)
    if not report:raise ValueError('missing_inforce_date')
    issued=datetime(int(report[3]),MONTHS[report[2].upper()],int(report[1]),tzinfo=timezone.utc)
    age=(date(stamp).date()-issued.date()).days
    if not -1<=age<=3:raise ValueError('stale_inforce_document')
    headers=list(HEADER.finditer(text));rows=[];seen=set()
    if not headers:raise ValueError('missing_navarea_messages')
    for i,m in enumerate(headers):
        number=f'{int(m[2])}/{int(m[3])%100:02d}'
        if number in seen:raise ValueError('duplicate_navarea_message')
        seen.add(number)
        original=text[m.start():headers[i+1].start() if i+1<len(headers) else len(text)].strip()
        body=text[m.end():headers[i+1].start() if i+1<len(headers) else len(text)]
        # Drop only PDF separator rules from parser input; keep the original intact.
        body=re.sub(r'(?m)^\s*-{5,}\s*$', '',body).strip()
        rows.append(dict(number=number,issued=m[1].strip(),body=body,original=original))
    return rows,issued.date().isoformat()

def normalized(body):
    # PDF line breaks can split a degree-minute coordinate after its hyphen.
    return re.sub(r'\s+',' ',re.sub(r'(?<=\d)-\s+(?=\d)','-',body)).upper()

def geometry(body):
    text=normalized(body)
    # Explicit latitude/longitude limits define a rectangle, not a guessed circle.
    rect=re.search(r'BOUNDED WITHIN\s+(\d{2})-(\d{2}(?:\.\d+)?)N\s+TO\s+(\d{2})-(\d{2}(?:\.\d+)?)N\s+AND\s+(\d{3})-(\d{2}(?:\.\d+)?)E\s+TO\s+(\d{3})-(\d{2}(?:\.\d+)?)E',text)
    if rect:
        a=angle(rect[1]+rect[2],'N',2);b=angle(rect[3]+rect[4],'N',2);c=angle(rect[5]+rect[6],'E',3);d=angle(rect[7]+rect[8],'E',3)
        if a==b or c==d:raise ValueError('degenerate_nho_rectangle')
        return {'geometry':{'type':'Polygon','coordinates':[[position([c,a]),position([d,a]),position([d,b]),position([c,b]),position([c,a])]]}},None
    # (A)/(B) each introduce their own complete polygon in the plural-area form.
    if re.search(r'DANGER AREAS\s+BOUNDED BY',text):
        blocks=re.split(r'\([A-Z]\)\s*(?=\d{2}-)',text)
        if len(blocks)>2:return combine_polygons([extract('AREA BOUNDED BY '+b) for b in blocks[1:]])
    # A single centre/radius and two explicit bearings define one circular sector.
    sector=re.search(r'SECTOR EXTENDING\s+(\d+(?:\.\d+)?)\s*NM\s+BETWEEN BEARING(?:S)?\s+(\d{1,3})\s+AND\s+(\d{1,3})\s+FROM\s+(\d{2})-(\d{2}(?:\.\d+)?)N\s+(\d{3})-(\d{2}(?:\.\d+)?)E',text)
    if sector:
        radius=float(sector[1])*1852;start=int(sector[2]);end=int(sector[3]);span=(end-start)%360
        if not 0<radius<=2_000_000 or not 0<span<=180:return None,'扇形の半径・方位範囲を確定できません'
        lat=angle(sector[4]+sector[5],'N',2);lon=angle(sector[6]+sector[7],'E',3);a=math.radians(lat);l=math.radians(lon);distance=radius/6371008.8
        ring=[[lon,lat]]
        for k in range(span+1):
            bearing=math.radians(start+k)
            phi=math.asin(math.sin(a)*math.cos(distance)+math.cos(a)*math.sin(distance)*math.cos(bearing))
            lam=l+math.atan2(math.sin(bearing)*math.sin(distance)*math.cos(a),math.cos(distance)-math.sin(a)*math.sin(phi))
            ring.append(position([math.degrees(lam),math.degrees(phi)]))
        ring.append([lon,lat]);return {'geometry':{'type':'Polygon','coordinates':[ring]}},'原文の中心・半径・方位から球面計算。円弧を1度間隔の頂点で近似'
    return extract(text)

def build(text,source_url,stamp):
    rows,asof=parse_document(text,stamp);revoked=set();features=[];unplotted=[]
    for row in rows:
        revoked.update(f'{int(m[1])}/{int(m[2])%100:02d}' for m in re.finditer(r'CANCEL\s+NAVAREA\s+VIII\s*(?:MSG\s*)?-?\s*(\d+)/(\d{2,4})',row['body'],re.I))
    for row in rows:
        if row['number'] in revoked:continue
        body=row['body'];reasons=classify(body)
        if not reasons:continue
        p=dict(id='IN-NAVAREA8:'+row['number'],name='NAVAREA VIII '+row['number'],country='IN',countryBasis='発行国：インド（NAVAREA VIII調整機関）。海域の領有・実施国とは区別',layer='NAVWARN',type='Danger',authority='Indian Naval Hydrographic Office',source=SOURCE,sourceURL=source_url,issued=row['issued'],text=row['original'],originalText=row['original'],validFrom=None,validTo=None,timeStatus='source-inforce-schedule-unparsed',schedule='公式有効一覧掲載。日別の実施時間は原文のUTC表記を確認',criticalReasons=reasons,fetchedAt=stamp)
        p.update(times(body,row['issued']))
        if p.get('validTo') and date(p['validTo'])<=date(stamp):continue
        shape,warning=geometry(body);g=None
        if shape and shape.get('geometry'):g=shape['geometry'];p['accuracy']='text-trace' if g['type']=='MultiPoint' else 'text-boundary'
        elif shape and shape.get('circle'):
            c=shape['circle'];g={'type':'Point','coordinates':c['center']};p.update(accuracy='text-circle',radius_m=c['radius']*{'NM':1852,'KM':1000,'M':1}[c['unit']])
        if shape:
            for key in ('additionalCircles','referenceLines'):
                if shape.get(key):p[key]=shape[key]
        if warning:p['textGeometryWarning']=warning
        if not g:
            points=reference_points(normalized(body))
            if points:g={'type':'MultiPoint','coordinates':points};p.update(accuracy='reference-point',geometryNote='原文の参照座標のみ。円弧・区域境界は未確定')
        if g:features.append(dict(type='Feature',id=p['id'],geometry=g,properties=p))
        else:unplotted.append(dict(p,featureId=p['id'],unplottedReason=warning or '原文の境界を確定できません'))
    return dict(type='FeatureCollection',features=features,unplotted=unplotted,metadata=dict(status='ok',parserVersion=VERSION,source=SOURCE,sourceURL=URL,documentURL=source_url,reportDate=asof,lastAttempt=stamp,lastSuccess=stamp,received=len(rows),retained=len(features)+len(unplotted),plotted=len(features),unplotted=len(unplotted),cancelledReferences=len(revoked),coverage='インドNHOのNAVAREA VIII公式有効警報PDF（ベンガル湾・アンダマン海・インド洋等）の取得分。軍事・安全保障関連を抽出'))

def sync(path=PATH,discover_link=None,download=None,stamp=None):
    path=Path(path);stamp=stamp or utcnow();old=json.loads(path.read_text()) if path.exists() else None
    if old and refresh_shapes(old,geometry):write_json(path,old)
    if not due(old,stamp):return int(old['metadata'].get('status')!='ok')
    try:
        link=(discover_link or discover)();result=build(pdf_text((download or fetch_pdf)(link)),official_url(link),stamp)
        write_json(path,result);print('IN_NAVAREA8_PUBLISHED='+json.dumps({k:result['metadata'][k] for k in ('reportDate','received','plotted','unplotted')}));return 0
    except Exception as exc:
        old=old or dict(type='FeatureCollection',features=[],unplotted=[],metadata={})
        old['metadata'].update(status='error',parserVersion=VERSION,source=SOURCE,sourceURL=URL,lastAttempt=stamp,error='インドNHOの現行PDF取得・鮮度検証に失敗。前回の成功分を保持',errorCode='http_'+str(exc.code) if hasattr(exc,'code') else type(exc).__name__+':'+str(exc)[:100])
        write_json(path,old);print('IN_NAVAREA8_FAILED='+old['metadata']['errorCode']);return 1

if __name__=='__main__':
    if '--needs-browser' in sys.argv:
        old=json.loads(PATH.read_text()) if PATH.exists() else None
        print('true' if due(old,utcnow()) else 'false')
    else:sync()
