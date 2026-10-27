import sys,unittest,tempfile,json
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from sync_china_msa import listing,article,geometry,time_fields,cancellations,build,sync,official_url
NORTH='辽航警442/26，渤海及渤海海峡，自10月24日0400时至1400时在38-37.27N121-07.45E、38-34.58N121-07.78E、38-35.67N121-21.83E、38-38.37N121-21.50E诸点连线范围内，在38-51.78N120-34.02E、38-40.53N120-28.10E、38-35.90N120-42.45E、38-36.68N120-54.10E、38-41.67N120-56.73E、38-43.05N120-57.45E诸点连线范围内执行军事任务。禁止驶入。'
CIRCLE='琼航警210/26，南海，自10月25日至10月26日，每日0900时至1100时，在以19-36.00N /110-55.80E为中心，5.4海里为半径的圆形区域内进行火箭发射，禁止驶入。'
URL='https://www.msa.gov.cn/html/cnmsa/hxaq/article/2026/abc.html'
class ChinaMSATests(unittest.TestCase):
 def row(self,body=NORTH):return dict(url=URL,title='军事任务—辽航警442/26',issued='2026-10-23T05:44:00Z',authority='大连海事局',body=body,fetchedAt='2026-10-23T06:00:00Z')
 def test_independent_polygons(self):
  s,n=geometry(NORTH);self.assertIsNone(n);g=s['geometry'];self.assertEqual(g['type'],'MultiPolygon');self.assertEqual([len(x[0]) for x in g['coordinates']],[5,7]);self.assertAlmostEqual(g['coordinates'][0][0][0][0],121+7.45/60)
 def test_four_points(self):
  text='津航警369/26，渤海，10月21日1200时至11月1日2400时，在38-36.78N 119-32.55E、38-35.70N 119-32.55E、38-35.70N 119-33.93E和38-36.78N 119-33.93E四点连线水域执行军事任务。'
  s,n=geometry(text);self.assertEqual(len(s['geometry']['coordinates'][0][0]),5)
 def test_explicit_circle(self):
  s,n=geometry(CIRCLE);self.assertAlmostEqual(s['circle']['radius'],5.4);self.assertEqual(s['circle']['unit'],'NM');self.assertAlmostEqual(s['circle']['center'][0],110.93)
 def test_periods(self):
  t=time_fields(NORTH,self.row()['issued']);self.assertEqual(t['validFrom'],'2026-10-23T20:00:00Z');self.assertEqual(t['validTo'],'2026-10-24T06:00:00Z')
  t=time_fields(CIRCLE,self.row()['issued']);self.assertEqual(t['validTo'],'2026-10-26T03:00:00Z');self.assertIn('unparsed',t['timeStatus'])
  self.assertEqual(time_fields('军事任务，另行通知',self.row()['issued']),{})
  self.assertEqual(time_fields('自2026年10月21日0900时至1900时',self.row()['issued'])['validTo'],'2026-10-21T11:00:00Z')
 def test_cancel_range(self):self.assertEqual(cancellations('琼航警214/26，撤销琼航警203/26—琼航警205/26。'),{'琼航警203/26','琼航警204/26','琼航警205/26'})
 def test_active_expired_cancelled_unknown(self):
  r=self.row();self.assertEqual(len(build([r],'2026-10-23T10:00:00Z')['features']),1)
  self.assertEqual(build([r],'2026-10-25T10:00:00Z')['features'],[])
  cancel=dict(r,title='撤销航警—辽航警447/26',body='辽航警447/26，撤销辽航警442/26。')
  self.assertEqual(build([r,cancel],'2026-10-23T10:00:00Z')['features'],[])
  r['body']='军事任务，在38-37.27N121-07.45E、38-34.58N121-07.78E、38-35.67N121-21.83E诸点连线范围内。'
  data=build([r],'2026-10-23T10:00:00Z');self.assertEqual(data['features'],[]);self.assertEqual(len(data['unplotted']),1)
 def test_page_validation_and_full_body(self):
  html='<meta name="ArticleTitle" content="军演"><meta name="PubDate" content="2026-10-23 13:44"><div id="ch_p"><p>'+NORTH+'</p><div class="foot_but"><a>打印</a></div></div>'
  r=article(html,URL,'辽宁','2026-10-23T06:00:00Z');self.assertEqual(r['body'],NORTH);self.assertEqual(r['issued'],'2026-10-23T05:44:00+00:00')
  with self.assertRaises(ValueError):article('<html>Forbidden</html>',URL,'辽宁','x')
  with self.assertRaises(ValueError):listing('<html>Home</html>')
  with self.assertRaises(ValueError):official_url('https://example.com/a')
  self.assertEqual(listing('航行警告<script>pageParam.count=0;</script>'),[])
 def test_failure_preserves_and_hourly_throttle(self):
  with tempfile.TemporaryDirectory() as folder:
   cache=Path(folder)/'state.json';out=Path(folder)/'out.json';cache.write_text(json.dumps({'records':{URL:self.row()},'regions':{}}))
   def fail(u):raise ValueError('unavailable')
   with patch('sync_china_msa.CHANNELS',{'辽宁':'abc'}):sync(out,cache,fail,'2026-10-23T10:00:00Z')
   data=json.loads(out.read_text());self.assertEqual(len(data['features']),1);self.assertEqual(data['metadata']['status'],'error');self.assertIsNone(data['metadata']['lastSuccess'])
   sync(out,cache,lambda u:self.fail('must not fetch'),'2026-10-23T10:30:00Z')
 def test_success_persist_and_reuse(self):
  html='<meta name="ArticleTitle" content="军事任务—辽航警442/26"><meta name="PubDate" content="2026-10-23 13:44"><div id="ch_p"><p>'+NORTH+'</p></div>'
  listing_html='<a href="/html/cnmsa/hxaq/article/2026/abc.html">军事任务—辽航警442/26</a>';calls=[]
  def fetch(url):calls.append(url);return html if '/article/' in url else listing_html
  with tempfile.TemporaryDirectory() as folder:
   cache=Path(folder)/'state.json';out=Path(folder)/'out.json'
   with patch('sync_china_msa.CHANNELS',{'辽宁':'abc'}):
    self.assertEqual(sync(out,cache,fetch,'2026-10-23T10:00:00Z'),0);self.assertEqual(len(json.loads(out.read_text())['features']),1);self.assertEqual(len(calls),2)
    sync(out,cache,fetch,'2026-10-23T10:30:00Z');self.assertEqual(len(calls),2)
    sync(out,cache,fetch,'2026-10-23T11:01:00Z');self.assertEqual(len(calls),3)
 def test_access_error_stops_requests(self):
  from urllib.error import HTTPError
  calls=[]
  def blocked(url):calls.append(url);raise HTTPError(url,403,'Forbidden',{},None)
  with tempfile.TemporaryDirectory() as folder,patch('sync_china_msa.CHANNELS',{'辽宁':'abc','海南':'def'}):
   out=Path(folder)/'out.json';sync(out,Path(folder)/'state.json',blocked,'2026-10-23T10:00:00Z')
   self.assertEqual(len(calls),1);self.assertEqual(json.loads(out.read_text())['metadata']['status'],'error')
 def test_unchecked_region_precedes_recent_failure(self):
  calls=[]
  def fetch(url):calls.append(url);return '航行警告<script>pageParam.count=0;</script>'
  with tempfile.TemporaryDirectory() as folder,patch('sync_china_msa.CHANNELS',{'最近失敗':'failed','未確認':'unchecked'}):
   cache=Path(folder)/'state.json';out=Path(folder)/'out.json'
   cache.write_text(json.dumps({'records':{},'regions':{'最近失敗':{'status':'error','lastAttempt':'2026-10-23T09:00:00Z'}}}))
   sync(out,cache,fetch,'2026-10-23T10:01:00Z')
   self.assertIn('/unchecked/',calls[0])
 def test_fullwidth_separators_and_dms(self):
  body='10月21日至30日每日0600时至2200时在34-13.10N120-18.00E，34-12.25N120-35.28E，34-01.30N120-41.28E，33-55.00N120-37.08E，33-55.00N120-26.20E诸点连线范围内进行实弹射击。'
  shape,note=geometry(body);self.assertIsNone(note);self.assertEqual(len(shape['geometry']['coordinates'][0][0]),6)
  dms='2026年10月14日至10月31日，在18-07-20N 109-37-50E；18-07-20N 109-41-20E；18-04-50N 109-41-20E；18-04-50N 109-37-50E，四点连线水域范围内进行军事训练。'
  shape,note=geometry(dms);self.assertIsNone(note);self.assertEqual(len(shape['geometry']['coordinates'][0][0]),5)
  times=time_fields(dms,self.row()['issued']);self.assertEqual(times['validTo'],'2026-10-31T16:00:00Z');self.assertEqual(times['timeStatus'],'date-only-period-unparsed')
 def test_cached_reparse_does_not_fetch_or_change_freshness(self):
  with tempfile.TemporaryDirectory() as folder:
   cache=Path(folder)/'state.json';out=Path(folder)/'out.json';stamp='2026-10-23T10:00:00Z'
   cache.write_text(json.dumps({'records':{URL:self.row()},'regions':{},'lastAttempt':stamp}))
   out.write_text(json.dumps({'features':[],'unplotted':[],'metadata':{'status':'ok','lastAttempt':stamp,'lastSuccess':stamp,'parserVersion':'old'}}))
   sync(out,cache,lambda u:self.fail('must not fetch'),'2026-10-23T10:30:00Z')
   data=json.loads(out.read_text());self.assertEqual(len(data['features']),1);self.assertEqual(data['metadata']['lastSuccess'],stamp);self.assertEqual(data['features'][0]['properties']['fetchedAt'],self.row()['fetchedAt'])
if __name__=='__main__':unittest.main()
