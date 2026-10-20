"""Conservative explicit NOTAM text geometry; ambiguous arcs are never joined."""
import re
from update_airspace import polygon_geometry, position

PAIR = re.compile(r'(?<![\d.])(\d{4}(?:\d{2})?(?:\.\d+)?)([NS])\s*[, /]?\s*(\d{5}(?:\d{2})?(?:\.\d+)?)([EW])(?![A-Z\d])')

def angle(raw, hemisphere, degrees):
    whole=raw.split('.')[0]
    if len(whole) not in (degrees+2,degrees+4):raise ValueError('coordinate format')
    d=int(raw[:degrees]); tail=raw[degrees:]
    if len(whole)==degrees+2:minutes=float(tail);seconds=0
    else:minutes=int(tail[:2]);seconds=float(tail[2:])
    if minutes>=60 or seconds>=60:raise ValueError('coordinate range')
    return (d+minutes/60+seconds/3600)*(-1 if hemisphere in 'SW' else 1)

def coord(match):
    a,b,c,d=match.groups()
    return position([angle(c,d,3),angle(a,b,2)])

def circle_metres(c):
    return {'center':c['center'],'radius_m':c['radius']*{'NM':1852,'KM':1000,'M':1}[c['unit']]}

def combine_polygons(results):
    """Keep separate source-order polygons, traces and explicit circles."""
    polygons=[];lines=[];circles=[];extra=[];notes=[]
    for i,(shape,warning) in enumerate(results,1):
        if shape and 'geometry' in shape:
            g=shape['geometry']
            if g['type'] in ('Polygon','MultiPolygon'):polygons.extend([g['coordinates']] if g['type']=='Polygon' else g['coordinates'])
        if shape:
            lines.extend(shape.get('referenceLines',[]));extra.extend(shape.get('additionalCircles',[]))
            if 'circle' in shape:circles.append(shape['circle'])
        if warning:notes.append(f'区域{i}: {warning}')
    if polygons:result={'geometry':{'type':'MultiPolygon','coordinates':polygons}};extra=[circle_metres(c) for c in circles]+extra
    elif circles:result={'circle':circles[0]};extra=[circle_metres(c) for c in circles[1:]]+extra
    elif lines:result={'geometry':{'type':'MultiPoint','coordinates':[list(p) for p in dict.fromkeys(tuple(p) for line in lines for p in line)]}}
    else:return None,' / '.join(notes) or '多角形を確定できません。'
    if lines:result['referenceLines']=lines
    if extra:result['additionalCircles']=extra
    return result,(' / '.join(notes) or None)

def extract(value, bounded_chain=False):
    text=re.sub(r'\s+',' ',str(value).upper()).translate(str.maketrans({'–':'-','—':'-','−':'-'}))
    # Restrict interpretation to E) when a full ICAO message is supplied.
    section=re.search(r'(?:^|\s)E\)\s*',text)
    if section and (section.start()==0 or re.search(r'\bNOTAM[NRC]\b|\bQ\)',text[:section.start()])):
        text=re.split(r'\s+F\)\s*(?!\d{4,6}(?:\.\d+)?[NS])',text[section.end():],maxsplit=1)[0]
    # Normalize explicit hemisphere-qualified degrees/minutes/seconds only.
    def packed(m):
        d,mi,se,h=m.groups();width=2 if h in 'NS' else 3
        return d.zfill(width)+mi.zfill(2)+(se.zfill(2) if se else '')+h
    text=re.sub(r"(?<![\d.])(\d{1,3})[°:\- ](\d{2}(?:\.\d+)?)(?:[':\- ](\d{2}(?:\.\d+)?))?[\"' ]*([NSEW])\b",packed,text)
    text=re.sub(r'\b([NS])\s*(\d{4}(?:\d{2})?(?:\.\d+)?)\s*([EW])\s*(\d{5}(?:\d{2})?(?:\.\d+)?)\b',lambda m:m[2]+m[1]+' '+m[4]+m[3],text)
    text=re.sub(r'\((?:APRX\s+)?\d+(?:\.\d+)?\s*(?:NM|KM)\s+[^()]*\)', lambda m:m[0] if PAIR.search(m[0]) or 'RADIUS' in m[0] else '', text)
    # Independent repeated definitions include FAA's 'WI AN AREA DEFINED AS'.
    definitions=re.split(r'\b(?:WI\s+AN\s+)?AREA\s+DEFINED\s+AS\b',text)
    if len(definitions)>2 and not PAIR.search(definitions[0]):
        return combine_polygons([extract('AREA DEFINED AS '+part) for part in definitions[1:]])
    circle_parts=re.split(r'\s+AND\s+',text)
    if len(circle_parts)>1 and all(re.search(r'\bRADIUS\b',part) and PAIR.search(part) for part in circle_parts):
        return combine_polygons([extract(part) for part in circle_parts])
    # Numbered AIRSPACE boundaries and lettered maritime areas are separate polygons.
    parts=re.split(r'\(\d+\)\s*AIRSPACE\s*:',text)
    if len(parts)>2:
        shapes=[extract(b.split('RMK:',1)[0]) for b in parts[1:]]
        return combine_polygons(shapes)
    if re.search(r'\bAREAS? BOUND(?:ED)? BY\s*:',text):
        parts=re.split(r'\b[A-Z]\.\s*(?=\d{4,6}(?:\.\d+)?[NS])',text)
        if len(parts)>2:
            shapes=[extract('AREA BOUNDED BY '+b) for b in parts[1:]]
            return combine_polygons(shapes)
    # Separate repeated explicitly bounded areas, even when schedules precede each.
    parts=re.split(r'\b(?:AREA\s+)?BOUND(?:ED)? BY\b',text)
    if len(parts)>2 and not PAIR.search(parts[0]):
        shapes=[extract('AREA BOUNDED BY '+b) for b in parts[1:]]
        return combine_polygons(shapes)
    # Explicit AREA 1/AREA 2 chains stay separate. Never bridge disjoint zones.
    blocks=re.split(r'\b(?:AREA|ZONE)\s+[A-Z0-9]+\s*(?:[:.)]\s*|(?=\d{4,6}(?:\.\d+)?[NS]))',text)
    if len(blocks)>2:
        shapes=[extract('AREA BOUNDED BY '+b) for b in blocks[1:]]
        return combine_polygons(shapes)
    matches=list(PAIR.finditer(text))
    if not matches:return None,None
    try:points=[coord(m) for m in matches]
    except ValueError:return None,'本文の座標形式・値を解釈できません。'
    geometry_text=re.sub(r'\(APRX\s+[^()]*\)', '', text[:matches[-1].end()])
    complex_path=re.search(r'\b(ARC|SECTOR|FAN[ -]?SHAPED|SEMICIRCLE|SEMI[ -]CIRCLE|CLOCKWISE|ANTICLOCKWISE|COUNTERCLOCKWISE|BORDER|COASTLINE|ALONG|EXCLUDING|EXCEPT)\b|\b\d{1,3}\s*(?:DEG|DEGREES)\b',geometry_text)
    if complex_path:return None,'円弧・沿岸・除外区域等を含む本文は自動で境界を確定しません。'
    # Explicit hyphen-connected vertices define separate straight-line areas.
    # Never bridge prose, dates, labels, or separate chains; routes are not areas.
    if not re.search(r'\b(?:ROUTE|TRACK|CORRIDOR|CENTERLINE|CENTRELINE)\b',text):
        chains=[];chain=[matches[0]]
        for a,b in zip(matches,matches[1:]):
            if re.fullmatch(r'\s*-\s*',text[a.end():b.start()]):chain.append(b)
            else:
                chains.append(chain);chain=[b]
        chains.append(chain)
        if not bounded_chain and any(len(c)>=3 for c in chains):
            results=[]
            for c in chains:
                # A trailing hyphen signals an incomplete continuation; don't invent a closing edge.
                incomplete=bool(re.match(r'\s*-',text[c[-1].end():]))
                shape,warning=(None,'末尾が途中で切れた座標列です。') if incomplete else extract('AREA BOUNDED BY '+ ' TO '.join(m.group() for m in c), bounded_chain=True)
                if not shape and len(c)>=2:
                    shape={'referenceLines':[[coord(m) for m in c]]}
                    warning=(warning or '境界未確定')+' 記載順の座標線のみ表示（塗りつぶしなし）。'
                results.append((shape,warning))
            merged,warning=combine_polygons(results)
            if merged:
                if merged.get('geometry',{}).get('type')=='MultiPolygon' and len(merged['geometry']['coordinates'])==1:
                    merged['geometry']={'type':'Polygon','coordinates':merged['geometry']['coordinates'][0]}
                return merged,warning
    # One unambiguous centre and one radius with an explicit unit.
    radius=re.search(r'\b(?:WI|WITHIN)\s+(\d+(?:\.\d+)?)\s*(NM|N M|KM|METERS?|M)\s+(?:RADIUS\s+)?(?:OF|CENT(?:ER|RE)(?:D)?\s+(?:ON|AT))\s*',text)
    if not radius:radius=re.search(r'\b(?:RADIUS\s+(?:OF\s+)?)(\d+(?:\.\d+)?)\s*(NM|N M|KM|METERS?|M)\b',text)
    if not radius:radius=re.search(r'\b(\d+(?:\.\d+)?)\s*(NM|N M|KM|METERS?|M)\s+RADIUS\s+(?:OF|CENT(?:ER|RE)(?:D)?\s+(?:ON|AT))',text)
    if not radius:radius=re.search(r'\bRADIUS(?:\s+OF)?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(NM|N M|KM|METERS?|M)\b',text)
    if radius and len(points)>1 and re.search(r'\b(?:EACH|FOLLOWING (?:POINTS|POSITIONS|LOCATIONS)|CENTRES|CENTERS)\b',text):
        unit=radius[2].replace(' ','');unit='M' if unit.startswith('METER') else unit
        if 0<float(radius[1])*{'NM':1852,'KM':1000,'M':1}[unit]<=2000000:
            circles=[{'circle':{'center':point,'radius':float(radius[1]),'unit':unit}} for point in points]
            return combine_polygons([(c,None) for c in circles])
    if radius and len(points)==1 and 0<float(radius[1]):
        unit=radius[2].replace(' ','');unit='M' if unit.startswith('METER') else unit
        if float(radius[1])*{'NM':1852,'KM':1000,'M':1}[unit]<=2000000:return {'circle':{'center':points[0],'radius':float(radius[1]),'unit':unit}},None
    # Only a stated, straight-line boundary with a contiguous coordinate chain.
    bounded=re.search(r'\b(?:BOUNDED BY|BOUND BY|BOUNDARY DEFINED BY|AREA DEFINED BY|AREA DEFINED AS|WI AREA|WITHIN AREA|JOINING THE POINTS|FLW COORDS?|FOLLOWING COORDINATES|LATERAL LIMIT AREA FORMED BY THE UNION OF THE (?:FLW|FOLLOWING) POINTS)\b',text)
    if bounded and len(points)>=3:
        if any(not re.fullmatch(r'[\s,;:/\-]*(?:(?:TO|AND|PSN)\s*)?(?:[A-Z]\s*\)\s*)?',text[a.end():b.start()]) for a,b in zip(matches,matches[1:])):
            return None,'複数の区域または接続が不明な座標列です。'
        if points[-1]!=points[0]:points.append(points[0])
        try:
            g=polygon_geometry({'type':'Polygon','coordinates':[points]})
            if abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(points,points[1:])))<1e-12:raise ValueError('zero area')
            # Reject self-crossings instead of creating a misleading boundary.
            def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
            edges=list(zip(points,points[1:]))
            for i,(a,b) in enumerate(edges):
                for j,(c,d) in enumerate(edges):
                    if j<=i+1 or (i==0 and j==len(edges)-1):continue
                    if cross(a,b,c)*cross(a,b,d)<0 and cross(c,d,a)*cross(c,d,b)<0:raise ValueError('crossing')
            return {'geometry':g},None
        except ValueError:return {'geometry':{'type':'MultiPoint','coordinates':points},'referenceLines':[points]},'原文の座標を記載順に結線（交差を含むため塗りつぶしなし）。'
    return None,'本文に座標はありますが、境界・半径を一意に確定できません。'


def reference_points(value):
    """Only reported coordinates; no boundary or radius is inferred."""
    text=re.sub(r'\s+',' ',str(value).upper()).translate(str.maketrans({'–':'-','—':'-','−':'-'}))
    # Restrict interpretation to E) when a full ICAO message is supplied.
    section=re.search(r'(?:^|\s)E\)\s*',text)
    if section and (section.start()==0 or re.search(r'\bNOTAM[NRC]\b|\bQ\)',text[:section.start()])):
        text=re.split(r'\s+F\)\s*(?!\d{4,6}(?:\.\d+)?[NS])',text[section.end():],maxsplit=1)[0]
    # Normalize explicit hemisphere-qualified degrees/minutes/seconds only.
    def packed(m):
        d,mi,se,h=m.groups();width=2 if h in 'NS' else 3
        return d.zfill(width)+mi.zfill(2)+(se.zfill(2) if se else '')+h
    text=re.sub(r"(?<![\d.])(\d{1,3})[°:\- ](\d{2}(?:\.\d+)?)(?:[':\- ](\d{2}(?:\.\d+)?))?[\"' ]*([NSEW])\b",packed,text)
    text=re.sub(r'\b([NS])\s*(\d{4}(?:\d{2})?(?:\.\d+)?)\s*([EW])\s*(\d{5}(?:\d{2})?(?:\.\d+)?)\b',lambda m:m[2]+m[1]+' '+m[4]+m[3],text)
    points=[]
    for m in PAIR.finditer(text):
        try:
            p=coord(m)
            if p not in points:points.append(p)
        except ValueError:continue
    return points



def refresh_shapes(feed, parser=extract):
    """Reparse cached official messages without changing source freshness or making HTTP calls."""
    changed=False;features=list(feed.get('features',[]));pending=[]
    for props in feed.get('unplotted',[]):
        pending.append({'type':'Feature','id':props.get('featureId') or props['id'],'geometry':None,'properties':props})
    remaining=[]
    for feature in features+pending:
        p=feature['properties'];shape,warning=parser(p.get('originalText') or p.get('text',''))
        if not shape:
            if feature['geometry'] is None:remaining.append(p)
            continue
        before=(feature['geometry'],dict(p))
        if 'circle' in shape:
            c=shape['circle'];feature['geometry']={'type':'Point','coordinates':c['center']};p['radius_m']=circle_metres(c)['radius_m'];p['accuracy']='text-circle'
        elif 'geometry' in shape:
            feature['geometry']=shape['geometry'];p.pop('radius_m',None);p['accuracy']='text-trace' if shape['geometry']['type']=='MultiPoint' else 'text-boundary'
        else:
            if feature['geometry'] is None:remaining.append(p)
            continue
        for key in ('unplottedReason','geometryNote','textGeometryWarning','referenceLines','additionalCircles'):p.pop(key,None)
        for key in ('referenceLines','additionalCircles'):
            if shape.get(key):p[key]=shape[key]
        if warning:p['textGeometryWarning']=warning
        if before!=(feature['geometry'],p):changed=True
        if feature not in features:features.append(feature);changed=True
    if changed:
        feed['features']=features;feed['unplotted']=remaining
        feed['metadata'].update(plotted=len(features),unplotted=len(remaining),retained=len(features)+len(remaining))
    return changed
