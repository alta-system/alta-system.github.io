"""Official Pakistan NAVAREA IX in-force list and linked warning documents.
Hourly, bounded requests; public same-origin HTTPS only. No credentials/retries.
"""
import io,json,re,time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin,urlsplit,urlunsplit,quote
from urllib.request import Request,build_opener
from update_airspace import ROOT,NoRedirect,write_json,utcnow,date
from hazard_rules import classify
from notam_text import extract,reference_points
from maritime_time import times

URL='https://hydrography.paknavy.gov.pk/navarea-ix-warnings/'
HOST=urlsplit(URL).hostname
SOURCE='Pakistan Navy NHO — NAVAREA IX'
class Table(HTMLParser):
    def __init__(self):
        super().__init__();self.rows=[];self.cells=None;self.cell=None;self.links=[]
    def handle_starttag(self,tag,attrs):
        if tag=='tr':self.cells=[];self.links=[]
        if tag in ('td','th') and self.cells is not None:self.cell=[]
        if tag=='a' and self.cells is not None:
            href=dict(attrs).get('href','')
            if href:self.links.append(href)
    def handle_data(self,data):
        if self.cell is not None:self.cell.append(data)
    def handle_endtag(self,tag):
        if tag in ('td','th') and self.cell is not None:
            self.cells.append(' '.join(''.join(self.cell).split()));self.cell=None
        if tag=='tr' and self.cells is not None:
            self.rows.append((self.cells,self.links));self.cells=None;self.cell=None

def official_url(href):
    u=urljoin(URL,href);p=urlsplit(u)
    if p.scheme!='https' or p.hostname!=HOST or p.username or p.password or p.port not in (None,443):
        raise ValueError('untrusted_document_url')
    return urlunsplit((p.scheme,p.netloc,quote(p.path,safe='/%:@'),quote(p.query,safe='=&%+/:@'),''))

def listing(html):
    if 'enforced Navigational Warnings' not in html and 'inforce' not in html.lower():
        raise ValueError('missing_inforce_marker')
    parser=Table();parser.feed(html);result={}
    for cells,links in parser.rows:
        if len(cells)<5 or not re.fullmatch(r'\d+/\d{2}',cells[3]):continue
        if not links:raise ValueError('missing_document_link')
        candidates=[h for h in links if not h.startswith(('#','javascript:'))]
        if not candidates:raise ValueError('unsupported_document_link')
        result[cells[3]]=dict(number=cells[3],region=cells[1],issued=cells[2],title=cells[4],url=official_url(candidates[-1]))
    if not result:raise ValueError('empty_or_changed_listing')
    return list(result.values())

def fetch(url):
    official_url(url)
    req=Request(url,headers={'User-Agent':'ALTA-SYSTEM-Research/4.0','Accept':'text/html,application/pdf,text/plain'})
    with build_opener(NoRedirect()).open(req,timeout=30) as response:
        raw=response.read(8_000_001)
    if len(raw)>8_000_000:raise ValueError('document_size')
    return raw

def document_text(raw):
    if raw.startswith(b'%PDF'):
        from pypdf import PdfReader
        reader=PdfReader(io.BytesIO(raw))
        if reader.is_encrypted or len(reader.pages)>20:raise ValueError('unsupported_pdf')
        text='\n'.join(p.extract_text() or '' for p in reader.pages)
    else:
        text=raw.decode('utf-8-sig')
        if '<html' in text.lower():
            # Do not mistake access challenges or document-viewer pages for a warning.
            raise ValueError('html_document_requires_review')
    if len(text)<30 or len(text)>200000:raise ValueError('document_text')
    return text

def build(rows,texts,stamp):
    features=[];unplotted=[]
    for row in rows:
        body=texts[row['number']]
        reasons=classify(row['title']+' '+body)
        if not reasons:continue
        ident='PK-NAVAREA9:'+row['number']
        props=dict(id=ident,featureId=ident,name=row['title']+' / '+row['number'],
            country='ZZ',countryBasis='NAVAREA IX海域。発行国と海域の帰属を区別',
            layer='NAVWARN',type='Danger',authority='Pakistan Navy National Hydrographic Office',
            source=SOURCE,sourceURL=row['url'],issued=row['issued'],text=body,originalText=body,
            validFrom=None,validTo=None,timeStatus='source-listed-schedule-unparsed',
            schedule='公式現行一覧掲載。個別の実施時刻は原文参照',criticalReasons=reasons,fetchedAt=stamp)
        props.update(times(body,row['issued']))
        if props.get('validTo') and date(props['validTo'])<=date(stamp):continue
        shape,warning=extract(body);g=None
        if shape and 'geometry' in shape:g=shape['geometry'];props['accuracy']='text-boundary'
        elif shape and 'circle' in shape:
            c=shape['circle'];g=dict(type='Point',coordinates=c['center'])
            props.update(accuracy='text-circle',radius_m=c['radius']*{'NM':1852,'KM':1000,'M':1}[c['unit']])
        else:
            points=reference_points(body)
            if points:g=dict(type='MultiPoint',coordinates=points);props.update(accuracy='reference-point',geometryNote='参照座標のみ。危険区域の境界ではありません。')
        if warning:props['textGeometryWarning']=warning
        if g:features.append(dict(type='Feature',id=ident,geometry=g,properties=props))
        else:unplotted.append(dict(props,unplottedReason=warning or '原文に確定できる座標なし'))
    return dict(type='FeatureCollection',features=features,unplotted=unplotted,metadata=dict(
        status='ok',parserVersion='navarea9-v2',source=SOURCE,sourceURL=URL,lastAttempt=stamp,lastSuccess=stamp,
        retained=len(features)+len(unplotted),plotted=len(features),unplotted=len(unplotted),
        coverage='パキスタン海軍のNAVAREA IX現行一覧（紅海・湾岸・アラビア海）の配信分'))

def sync(path):
    path=Path(path);stamp=utcnow();old=json.loads(path.read_text()) if path.exists() else None
    if old and old['metadata'].get('parserVersion')=='navarea9-v2' and old['metadata'].get('lastAttempt') and (date(stamp)-date(old['metadata']['lastAttempt'])).total_seconds()<3600:
        return int(old['metadata'].get('status')!='ok')
    try:
        rows=listing(fetch(URL).decode('utf-8-sig'))
        chosen=[r for r in rows if classify(r['title']) or re.search(r'MILITARY|EXERCISE|WEAPON|MISSILE|FIRING|MINE|RESTRICTED|EXPLOSION|GNSS|SECURITY',r['title'],re.I)]
        if len(chosen)>80:raise ValueError('request_budget_exceeded')
        texts={}
        # Reuse already downloaded documents while they remain on the in-force list.
        cache={p.get('sourceURL'):p for p in ([f['properties'] for f in old.get('features',[])]+old.get('unplotted',[]))} if old else {}
        for row in chosen:
            previous=cache.get(row['url'])
            # Revalidate documents daily; removal from the list takes effect immediately.
            if previous and previous.get('fetchedAt') and (date(stamp)-date(previous['fetchedAt'])).total_seconds()<86400:
                texts[row['number']]=previous['originalText']
            else:
                time.sleep(1)
                texts[row['number']]=document_text(fetch(row['url']))
        result=build(chosen,texts,stamp)
        # Preserve document fetch age when using cached bodies.
        for p in [f['properties'] for f in result['features']]+result['unplotted']:
            prev=cache.get(p['sourceURL'])
            if prev and (date(stamp)-date(prev.get('fetchedAt',stamp))).total_seconds()<86400:p['fetchedAt']=prev['fetchedAt']
        result['metadata']['received']=len(rows)
        write_json(path,result);print('PK_NAVAREA9_PUBLISHED='+str(result['metadata']['retained']));return 0
    except Exception as exc:
        old=old or dict(type='FeatureCollection',features=[],unplotted=[],metadata={})
        old['metadata'].update(status='error',parserVersion='navarea9-v2',source=SOURCE,sourceURL=URL,lastAttempt=stamp,
            error='NAVAREA IX公式一覧・本文の取得検証に失敗。前回成功分を保持。',
            errorCode='http_'+str(exc.code) if hasattr(exc,'code') else type(exc).__name__)
        write_json(path,old);print('PK_NAVAREA9_FAILED='+old['metadata']['errorCode']);return 1

if __name__=='__main__':sync(ROOT/'web/maritime/pk_navarea9.json')
