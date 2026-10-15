"""Parse explicit UTC issue/cancellation timestamps; never infer daily activity."""
import re
from datetime import datetime,timezone
MONTHS={m:i+1 for i,m in enumerate('JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split())}
def stamp(day,hour,minute,month,year):
    year=int(year);year=year+2000 if year<100 else year
    try:return datetime(year,MONTHS[month.upper()],int(day),int(hour),int(minute),tzinfo=timezone.utc).isoformat().replace('+00:00','Z')
    except (ValueError,KeyError):return None

def times(text,issued=None):
    result={};raw=str(issued or text).upper().strip()
    # NGA/INHD explicit UTC date-time group; provider issue time is separate from fetch time.
    m=re.search(r'\b(\d{2})(\d{2})(\d{2})\s*(?:Z\s*/?\s*|UTC\s+)([A-Z]{3})\s+(\d{4}|\d{2})\b',raw)
    if m:
        v=stamp(*m.groups())
        if v:result['issuedISO']=v
    m=re.search(r'\bCANCEL THIS (?:MSG|MESSAGE)\s+(\d{2})(\d{2})(\d{2})\s*(?:Z\s*|UTC\s+)([A-Z]{3})\s+(\d{4}|\d{2})\b',text.upper())
    if m:
        v=stamp(*m.groups())
        if v:result['validTo']=v
    return result
