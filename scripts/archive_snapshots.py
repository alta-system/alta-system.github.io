"""Bounded public observation archive: 48h half-hour slots, then daily for 30d.
These are observed snapshots, not a reconstruction of historical official coverage.
"""
import gzip,json,re
from pathlib import Path
from datetime import datetime,timezone,timedelta
from update_airspace import ROOT,write_json,utcnow

def archive(root=ROOT/'web',now=None):
    now=now or datetime.now(timezone.utc);folder=root/'archive';folder.mkdir(exist_ok=True)
    index=json.loads((root/'production/index.json').read_text());feeds={}
    for c in index['countries']:
        if not re.fullmatch(r'[A-Z]{2}\.json',c['file']):raise ValueError('country path')
        data=json.loads((root/'production'/c['file']).read_text())
        if data['metadata'].get('generation')!=index.get('generation'):raise ValueError('snapshot generation')
        feeds[c['code']]=data
    sea=json.loads((root/'maritime/index.json').read_text());zz=feeds.setdefault('ZZ',dict(features=[],unplotted=[],metadata={'country':'ZZ'}))
    zz['features']+=sea['features'];zz['unplotted']+=sea['unplotted']
    slot=now.replace(minute=now.minute//30*30,second=0,microsecond=0);name=slot.strftime('%Y%m%dT%H%MZ.json.gz')
    if not (folder/name).exists():
        data=dict(schemaVersion=1,capturedAt=now.isoformat().replace('+00:00','Z'),index=index,marineMetadata=sea['metadata'],feeds=list(feeds.items()))
        (folder/name).write_bytes(gzip.compress(json.dumps(data,ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
    # Keep the last observation of each older day, bounded to 30 days total.
    files=sorted(folder.glob('*.json.gz'),reverse=True);days=set();entries=[]
    for p in files:
        when=datetime.strptime(p.name,'%Y%m%dT%H%MZ.json.gz').replace(tzinfo=timezone.utc);day=p.name[:8]
        keep=when>=now-timedelta(days=30) and (when>=now-timedelta(hours=48) or day not in days)
        if not keep:p.unlink();continue
        days.add(day)
        data=json.loads(gzip.decompress(p.read_bytes()));entries.append(dict(at=data['capturedAt'],file=p.name))
    write_json(folder/'index.json',dict(schemaVersion=1,retention='直近48時間は30分枠、その後30日までは1日1回。開始前の記録はありません。',snapshots=sorted(entries,key=lambda x:x['at'])))
if __name__=='__main__':archive()
