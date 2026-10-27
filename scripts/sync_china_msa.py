"""Hourly public China MSA national warning channels, bounded and cached.
No authentication, proxy, challenge bypass, or private API. Listings are publication
history, not an in-force inventory: unknown validity is never asserted as active.
"""
import json,re,time
from datetime import datetime,timedelta,timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin,urlsplit
from urllib.request import Request,build_opener
from update_airspace import ROOT,NoRedirect,write_json,utcnow,date
from notam_text import extract,combine_polygons
from hazard_rules import classify
BASE='https://www.msa.gov.cn/'
SOURCE='China MSA — 全国航行警告'
VERSION='china-msa-v2'
CHANNELS=dict(zip('上海 天津 辽宁 河北 山东 浙江 福建 广东 广西 海南 长江 江苏 深圳 连云港 江苏省地方 江西省地方'.split(),[
'94df14ce1110415da44e67593e76619f','bdba5fad6e5d48679f970fcf8efb8636','c8896863b1014c438705536a03eb46ff','93b73989d22045f9bc3270a6eba35180','36ea3354c8f84953aba082d6d989c750','8e10ea74eb9e4c9690f8f891968add80','7b08405760384570a0fb44e9204c4b1d','1e478d409e854918bf12478b8a19f4a8','86de2fffff2c47f98359fd1f20d6508f','d3340711057b494b8fa09eedc4c5ead9','9340423406cc4507b2fb8af2492d2a3d','b5b0f3c7630d4967b1e6b06208575d15','325fdc0892b44313a63ee5c165be98ec','fa4501f3dbe44f70bc726f27132d4e04','d14ed012960b4064971270459a4a0d4d','html/cnmsa/hxaq/aqxx/hxjg/jxsdfhsju']))
RISK=re.compile(r'军事|军演|实弹|射击|导弹|火箭|武器|布雷|扫雷|爆破|残骸|反恐')
CANCEL=re.compile(r'撤销|取消|解除')
NUMBER=re.compile(r'([\u4e00-\u9fff]{1,8}航警)\s*(\d+)\s*/\s*(\d{2,4})')
CST=timezone(timedelta(hours=8))

class Page(HTMLParser):
    def __init__(self):
        super().__init__();self.meta={};self.links=[];self.link=None;self.text=[];self.depth=0;self.skip=0
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='meta':self.meta[a.get('name','')]=a.get('content','')
        if tag=='a':self.link=[a.get('href',''),[]]
        if a.get('id')=='ch_p':self.depth=1;return
        if self.depth:
            if tag not in ('br','img','hr','input','meta','link','source'):self.depth+=1
            if 'foot_but' in a.get('class','') or tag in ('script','style'):self.skip=self.depth
            if tag in ('p','br','div'):self.text.append('\n')
    def handle_data(self,data):
        if self.link:self.link[1].append(data)
        if self.depth and not self.skip:self.text.append(data)
    def handle_endtag(self,tag):
        if tag=='a' and self.link:
            self.links.append((self.link[0],' '.join(''.join(self.link[1]).split())));self.link=None
        if self.depth:
            if self.skip==self.depth:self.skip=0
            if tag not in ('br','img','hr','input','meta','link','source'):self.depth-=1
            if tag=='p':self.text.append('\n')

def official_url(value):
    url=urljoin(BASE,value);p=urlsplit(url)
    if p.scheme!='https' or p.hostname!='www.msa.gov.cn' or p.username or p.password or p.port not in (None,443) or p.query:
        raise ValueError('untrusted_msa_url')
    return url

def listing(html):
    p=Page();p.feed(html)
    rows=[dict(url=official_url(u),title=t) for u,t in p.links if re.fullmatch(r'/html/cnmsa/hxaq/article/\d{4}/[a-zA-Z0-9]+\.html',u)]
    if not rows and not ('航行警告' in html and re.search(r'pageParam\.count\s*=\s*0\s*;',html)):raise ValueError('missing_warning_listing')
    return list({r['url']:r for r in rows}.values())

def article(html,url,region,stamp):
    p=Page();p.feed(html);body='\n'.join(x.strip() for x in ''.join(p.text).splitlines() if x.strip())
    if not p.meta.get('ArticleTitle') or not p.meta.get('PubDate') or len(body)<10:raise ValueError('missing_warning_body')
    issued=datetime.fromisoformat(p.meta['PubDate']).replace(tzinfo=CST).astimezone(timezone.utc).isoformat()
    return dict(url=official_url(url),title=p.meta['ArticleTitle'],issued=issued,authority=p.meta.get('ContentSource','中国海事局'),body=body,region=region,fetchedAt=stamp)

def identifiers(body):
    return {f'{m[1]}{int(m[2])}/{int(m[3])%100:02d}' for m in NUMBER.finditer(body)}

def cancellations(body):
    if not CANCEL.search(body):return set()
    text=CANCEL.split(body,maxsplit=1)[-1];out=identifiers(text)
    pat=r'([\u4e00-\u9fff]{1,8}航警)\s*(\d+)/(\d{2,4})\s*(?:至|到|—|–|-)\s*(?:\1)?\s*(\d+)/(\d{2,4})'
    for m in re.finditer(pat,text):
        if int(m[3])%100==int(m[5])%100 and 0<=int(m[4])-int(m[2])<=2000:
            out.update(f'{m[1]}{n}/{int(m[3])%100:02d}' for n in range(int(m[2]),int(m[4])+1))
    return out

def geometry(body):
    if re.search(r'圆弧|沿岸|岸线|扇形|除外',body):return None,'円弧・岸線・除外区域は境界未確定'
    # Normalize degree-minute pairs without needing whitespace between N and longitude.
    body=re.sub(r'(\d{2})-(\d{2}(?:\.\d+)?)N\s*[/,]?\s*(\d{3})-(\d{2}(?:\.\d+)?)E',lambda m:m[1]+m[2]+'N '+m[3]+m[4]+'E ',body)
    body=body.translate(str.maketrans({'，':',','；':';'}))
    results=[];rest=body
    for m in re.finditer(r'(.*?)(?:诸点连线|各点连线|[三四五六七八九十]+点连线|依次连线|以上各点连线|上述各点连线)',body,re.S):
        if re.search(r'\d[EW]',m[1]):results.append(extract('AREA BOUNDED BY '+m[1].replace('、',' TO ').replace('和',' TO ').replace('及',' TO '),bounded_chain=True))
        rest=body[m.end():]
    if '半径' in body:
        normalized=re.sub(r'(\d+(?:\.\d+)?)\s*海里',r'\1 NM',rest)
        normalized=re.sub(r'(\d+(?:\.\d+)?)\s*公里',r'\1 KM',normalized)
        radius=re.search(r'(\d+(?:\.\d+)?)\s*(NM|KM|米)\s*为?半径',normalized)
        if radius:results.append(extract(f'WITHIN {radius[1]} '+('M' if radius[2]=='米' else radius[2])+' RADIUS OF '+normalized))
    if results:return combine_polygons(results)
    if re.search(r'以下[三四五六七八九十]+点连线',body):return extract('AREA BOUNDED BY '+rest,bounded_chain=True)
    return extract(body)

def time_fields(body,issued):
    year=date(issued).astimezone(CST).year
    years=set(re.findall(r'(20\d{2})年',body))
    if len(years)>1:return {}
    if years:year=int(next(iter(years)))
    def iso(month,day,hhmm):
        h,m=divmod(int(hhmm),100)
        if m>59 or h>24 or (h==24 and m):raise ValueError('invalid_msa_time')
        dt=datetime(year,int(month),int(day),h%24,m,tzinfo=CST)+timedelta(days=h//24)
        return dt.astimezone(timezone.utc).isoformat().replace('+00:00','Z')
    m=re.search(r'(\d{1,2})月(\d{1,2})日\s*(\d{4})时?\s*至\s*(?:(\d{1,2})月)?(?:(\d{1,2})日)?\s*(\d{4})时',body)
    daily=re.search(r'(\d{1,2})月(\d{1,2})日\s*至\s*(?:(\d{1,2})月)?(\d{1,2})日[，,\s]*每[日天]\s*(\d{4})时?\s*至\s*(\d{4})时',body)
    if daily:
        a=iso(daily[1],daily[2],daily[5]);b=iso(daily[3] or daily[1],daily[4],daily[6]);status='daily-schedule-unparsed'
    elif m:
        a=iso(m[1],m[2],m[3]);b=iso(m[4] or m[1],m[5] or m[2],m[6]);status='explicit-period'
    else:
        calendar=re.search(r'(\d{1,2})月(\d{1,2})日\s*至\s*(?:(\d{1,2})月)?(\d{1,2})日',body)
        if not calendar:return {}
        a=iso(calendar[1],calendar[2],'0000');b=iso(calendar[3] or calendar[1],calendar[4],'2400');status='date-only-period-unparsed'
    if date(b)<=date(a):return {}
    return dict(validFrom=a,validTo=b,timeStatus=status,schedule='時刻未記載。北京時間の日付範囲' if status=='date-only-period-unparsed' else ('毎日の実施時間は原文参照（北京時間 UTC+8）' if daily else 'H24'),timeWarning='時刻未記載のため、開始日00時から終了日の翌日00時までの日付範囲として表示' if status=='date-only-period-unparsed' else '原文の北京時間をUTCへ変換')

def build(records,stamp):
    revoked=set()
    for r in records:
        if CANCEL.search(r['title']):revoked.update(cancellations(r['body']))
    features=[];unplotted=[];expired=0
    for r in records:
        if CANCEL.search(r['title']) or not RISK.search(r['title']+' '+r['body']) or identifiers(r['title'])&revoked:continue
        ident='CN-MSA:'+r['url'].rsplit('/',1)[-1].replace('.html','')
        p=dict(id=ident,featureId=ident,name=r['title'],country='CN',countryBasis='発行国：中国。海域の領有・実施国を示すものではありません',layer='NAVWARN',type='Danger',authority=r['authority'],source=SOURCE,sourceURL=r['url'],issued=r['issued'],issuedISO=r['issued'],text=r['body'],originalText=r['body'],fetchedAt=r['fetchedAt'],validFrom=None,validTo=None,timeStatus='publication-schedule-unparsed',criticalReasons=classify(r['body']) or ['cn-critical'],schedule='実施日時・取消は原文を確認')
        try:p.update(time_fields(r['body'],r['issued']))
        except ValueError:p['timeWarning']='原文の時刻を確定できません'
        if p['validTo'] and date(p['validTo'])<=date(stamp):expired+=1;continue
        shape,note=geometry(r['body']);g=None
        if shape and 'geometry' in shape:
            g=shape['geometry'];p['accuracy']='text-trace' if g['type']=='MultiPoint' else 'text-boundary'
        elif shape and 'circle' in shape:
            c=shape['circle'];g=dict(type='Point',coordinates=c['center']);p.update(accuracy='text-circle',radius_m=c['radius']*{'NM':1852,'KM':1000,'M':1}[c['unit']])
        if shape:
            for key in ('additionalCircles','referenceLines'):
                if shape.get(key):p[key]=shape[key]
        if note:p['textGeometryWarning']=note
        if not p['validTo']:unplotted.append(dict(p,unplottedReason='公式一覧は発表履歴です。有効期間を確定できないため地図への自動追加を保留'));continue
        if g:features.append(dict(type='Feature',id=ident,geometry=g,properties=p))
        else:unplotted.append(dict(p,unplottedReason=note or '本文の境界未確定'))
    return dict(type='FeatureCollection',features=features,unplotted=unplotted,metadata=dict(source=SOURCE,sourceURL=BASE+'html/cnmsa/hxaq/aqxx/index.html',parserVersion=VERSION,retained=len(features)+len(unplotted),plotted=len(features),unplotted=len(unplotted),expired=expired,cancelledReferences=len(revoked)))

class Fetcher:
    def __init__(self):self.count=0;self.last=0;self.started=time.monotonic()
    def __call__(self,url):
        url=official_url(url)
        if self.count>=120 or time.monotonic()-self.started>480:raise ValueError('hourly_request_budget')
        time.sleep(max(0,1.5-(time.monotonic()-self.last)));self.last=time.monotonic();self.count+=1
        with build_opener(NoRedirect()).open(Request(url,headers={'User-Agent':'ALTA-SYSTEM-Research/4.0','Accept':'text/html'}),timeout=20) as r:raw=r.read(2_000_001)
        if len(raw)>2_000_000:raise ValueError('msa_page_size')
        return raw.decode('utf-8-sig')

def sync(path,cache_path=None,fetch=None,stamp=None):
    path=Path(path);cache_path=Path(cache_path or ROOT/'state/china_msa.json');stamp=stamp or utcnow()
    cache=json.loads(cache_path.read_text()) if cache_path.exists() else {'records':{},'regions':{}}
    old=json.loads(path.read_text()) if path.exists() else None
    if old and cache.get('lastAttempt') and (date(stamp)-date(cache['lastAttempt'])).total_seconds()<3600:
        refreshed=build(list(cache['records'].values()),stamp)
        refreshed['metadata']={**old['metadata'],**refreshed['metadata']}
        write_json(path,refreshed)
        return int(refreshed['metadata']['status']!='ok')
    fetch=fetch or Fetcher();cache['lastAttempt']=stamp;errors=[];blocked=False;blocked_code='run_stopped_after_access_error';received=0
    for region,channel in sorted(CHANNELS.items(),key=lambda item:cache['regions'].get(item[0],{}).get('lastAttempt',cache['regions'].get(item[0],{}).get('lastSuccess',''))):
        prev=cache['regions'].get(region,{})
        if blocked:
            errors.append(region);cache['regions'][region]=dict(prev,status='error',errorCode=blocked_code);continue
        try:
            rows=[]
            for page in range(1,4):
                suffix='index.html' if region=='江西省地方' else ('index.jhtml' if page==1 else f'index_{page}.jhtml')
                html=fetch(BASE+channel+'/'+suffix);batch=listing(html);rows.extend(batch)
                total=re.search(r'pageParam\.count\s*=\s*(\d+)',html)
                if total and page*20>=int(total[1]):break
                if region=='江西省地方' or len(batch)<20 or (prev.get('lastSuccess') and all(r['url'] in cache['records'] for r in batch if RISK.search(r['title']) or CANCEL.search(r['title']))):break
            received+=len(rows)
            for row in rows:
                if not (RISK.search(row['title']) or CANCEL.search(row['title'])):continue
                prior=cache['records'].get(row['url'])
                if prior and (date(stamp)-date(prior['fetchedAt'])).total_seconds()<86400:continue
                cache['records'][row['url']]=article(fetch(row['url']),row['url'],region,stamp)
            cache['regions'][region]=dict(status='ok',lastAttempt=stamp,lastSuccess=stamp,received=len(rows));print('MSA_REGION='+region+' OK rows='+str(len(rows)),flush=True)
        except Exception as exc:
            code='http_'+str(exc.code) if hasattr(exc,'code') else str(exc)[:80]
            errors.append(region);cache['regions'][region]=dict(prev,status='error',errorCode=code,lastAttempt=stamp);print('MSA_REGION='+region+' '+code,flush=True)
            if getattr(exc,'code',None) in (403,429) or code=='hourly_request_budget':
                blocked=True;blocked_code='run_stopped_after_request_budget' if code=='hourly_request_budget' else 'run_stopped_after_access_error'
    cache['records']={u:r for u,r in cache['records'].items() if (date(stamp)-date(r['issued'])).days<400}
    result=build(list(cache['records'].values()),stamp)
    result['metadata'].update(status='error' if errors else 'ok',lastAttempt=stamp,lastSuccess=(old or {}).get('metadata',{}).get('lastSuccess') if errors else stamp,received=received,regions=cache['regions'],coverage='中国MSA全国16地域の公式掲載分。初回は各地域の最新最大60件、以後は保存分と新着を確認。有効警報全件の保証ではありません。',coverageGap=True)
    if errors:result['metadata'].update(error='一部地域の取得失敗。保存済み本文・取消情報を保持。',errorCode='regions_failed:'+','.join(errors))
    write_json(cache_path,cache);write_json(path,result)
    print('CHINA_MSA='+json.dumps(dict(status=result['metadata']['status'],regionsOK=len(CHANNELS)-len(errors),plotted=len(result['features']),unplotted=len(result['unplotted']),requests=getattr(fetch,'count',None)),ensure_ascii=False))
    return int(bool(errors))

if __name__=='__main__':sync(ROOT/'web/maritime/china_msa.json')
