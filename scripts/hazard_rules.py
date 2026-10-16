"""Explainable military/security filter. Generic danger/restricted is insufficient."""
import re

PATTERNS = [
 ('missile/rocket',r'\b(?:MISSILE(?:S)?|ROCKET(?:S)?|SPACE\s+(?:LAUNCH|DEBRIS)|RE[ -]?ENTRY)\b'),
 ('live-fire/weapons',r'\b(?:LIVE[ -]FIR(?:E|ING)|GUNFIRE|GUNNERY|FRNG|FIRING|WEAPONS?\s+(?:EXERCISE|TRAINING|TEST)|BOMBING)\b'),
 ('military-exercise',r'\b(?:MILITARY|NAVAL|ARMED FORCES|DEFEN[CS]E)\b.{0,70}\b(?:EXERCISE|EXER|TRAINING|OPERATIONS?|ACTIVITY)\b'),
 ('security-incident',r'\b(?:PIRACY|PIRATES|ARMED ATTACK|SECURITY INCIDENT|UNEXPLODED ORDNANCE|SEA MINES|DRIFTING MINES|CONFIRMED MINE|GPS JAMMING|GNSS (?:SIGNAL )?INTERFERENCE)\b'),
 ('cn-critical',r'军事训练|军事演习|实弹射击|导弹|火箭发射|军事实弹'),
 ('security-restriction',r'\b(?:TERRORIS[MT]|ANTI[ -]?TERROR|NATIONAL SECURITY|SECURITY THREAT|HOSTILITIES|ARMED CONFLICT|MILITARY CONFLICT)\b'),
 ('jp-critical',r'ミサイル|ロケット|実弾|射撃|射爆撃|武器訓練|軍事演習|テロ警戒')
]

def classify(text,qcode=''):
    text=re.sub(r'\s+',' ',str(text)).upper()
    q=str(qcode or '').upper().strip();q=q if q.startswith('Q') else 'Q'+q
    # Closed/finished exercises must not create an active hazard.
    if re.fullmatch(r'Q[A-Z]{4}',q) and q[-2:] in ('CN','CD','CC'):return []
    if re.search(r'\b(?:FIRING|EXERCISE|MILITARY ACTIVITY)\s+(?:IS\s+)?(?:CANCELLED|CANCELED|COMPLETED)\b',text):return []
    reasons=[]
    for label,pattern in PATTERNS:
        for m in re.finditer(pattern,text):
            before=text[max(0,m.start()-12):m.start()]
            if re.search(r'\b(?:NO|NOT|WITHOUT)\s+(?:LIVE\s+)?$',before):continue
            reasons.append(label);break
    # ICAO subject WM = missile, gun or rocket firing. WXX alone is not proof.
    if re.fullmatch(r'QWM[A-Z]{2}',q):
        if not reasons and re.search(r'\b(?:RWY|TWY|LIGHT|ILS|VOR|VOLCANIC|WEATHER|THUNDERSTORM)\b',text):return []
        reasons.append('ICAO-WM')
    return sorted(set(reasons))

def altitude(text,lower=None,upper=None,qline=''):
    text=str(text).upper()
    def value(raw):
        if raw is None:return None
        raw=str(raw).strip()
        if raw in ('SFC','GND','GROUND'):return {'label':'SFC / GND','reference':'surface','value':0,'unit':'FT'}
        if raw in ('UNL','UNLIMITED'):return {'label':'UNL','reference':'unlimited'}
        m=re.fullmatch(r'FL\s*(\d{2,3})',raw)
        if m:return {'label':'FL'+m[1],'reference':'pressure','value':int(m[1]),'unit':'FL'}
        m=re.fullmatch(r'(\d+(?:\.\d+)?)\s*(FT|FEET|M)\s*(AMSL|MSL|AGL)?',raw)
        if m:return {'label':raw,'reference':m[3] or 'unspecified','value':float(m[1]),'unit':m[2]}
        return {'label':raw,'reference':'unparsed'}
    f=re.search(r'(?:^|\s)F\)\s*(.+?)(?=\s+G\)|\n|$)',text)
    g=re.search(r'(?:^|\s)G\)\s*([^\n]+)',text)
    lo=value(f[1].strip() if f else lower);hi=value(g[1].strip() if g else upper)
    basis='F/G' if f or g else 'provider'
    fields=qline.split('/')
    if len(fields)>=8:
        if lo is None and re.fullmatch(r'\d{3}',fields[-3]):lo=value('FL'+fields[-3]);basis='Q-line envelope'
        if hi is None and re.fullmatch(r'\d{3}',fields[-2]):hi=value('FL'+fields[-2]);basis='Q-line envelope'
    return {'lower':lo,'upper':hi,'basis':basis,'label':(lo or {}).get('label','未提供')+' — '+(hi or {}).get('label','未提供')}


def classify_notam(text, qcode='', classification=''):
    """Broad candidate selection for NOTAM; maritime remains strictly filtered.
    A candidate label indicates possible military relevance, not confirmation.
    """
    body = re.sub(r'\s+', ' ', str(text)).upper()
    q = str(qcode or '').upper().strip()
    q = q if q.startswith('Q') else 'Q' + q
    if re.fullmatch(r'Q[A-Z]{4}', q) and q[-2:] in ('CN', 'CD', 'CC'):
        return []
    if re.search(r'\b(?:FIRING|EXERCISE|MILITARY ACTIVITY)\s+(?:IS\s+)?(?:CANCELLED|CANCELED|COMPLETED)\b', body):
        return []
    reasons = classify(body, q)
    if str(classification).upper() in ('MIL', 'MILITARY', 'LMIL', 'LOCAL_MILITARY'):
        reasons.append('military-feed-candidate')
    for label, pattern in [
        ('military-word-candidate', r'\b(?:MILITARY|MIL|NAVAL|NAVY|ARMY|AIR FORCE|USAF|USN|USMC|DEFEN[CS]E|COMBAT|TACTICAL|EXERCISE|EXER|AIR REFUELL?ING|UAS|UAV|DRONE|JAMMING|SPOOFING)\b|軍事|自衛隊|演習|軍用'),
        ('restricted-area-candidate', r'\b(?:DANGER AREA|RESTRICTED AREA|PROHIBITED AREA|TEMPORARY RESERVED AIRSPACE|TEMPORARY SEGREGATED AREA)\b')
    ]:
        for match in re.finditer(pattern, body):
            if not re.search(r'\b(?:NO|NOT|WITHOUT)\s+$', body[max(0, match.start()-12):match.start()]):
                reasons.append(label)
                break
    # Warning activity / restricted, danger and prohibited airspace are candidates.
    if re.fullmatch(r'Q(?:W[MEX]|R[DPR])[A-Z]{2}', q.replace(' ', '')) and not (not reasons and re.search(r'\b(?:RWY|TWY|ILS|VOR|VOLCANIC|WEATHER|THUNDERSTORM)\b', body)):
        reasons.append('warning-or-restricted-qcode-candidate')
    return sorted(set(reasons))
