#!/usr/bin/env python3
from concurrent.futures import ThreadPoolExecutor,as_completed
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import quote
from html.parser import HTMLParser
import hashlib,json,re,subprocess,runpy,sys
OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[3]
PAGES=runpy.run_path(str(OUT/'fetch-sources.py'))['PAGES']
class Plain(HTMLParser):
 def __init__(self):super().__init__();self.parts=[];self.skip=0
 def handle_data(self,d):
  if not self.skip:self.parts.append(d)
 def handle_starttag(self,t,a):
  if t in ('script','style'):self.skip+=1
  if t in ('p','div','br','h2','h3','li','tr'):self.parts.append('\n')
 def handle_endtag(self,t):
  if t in ('script','style'):self.skip=max(0,self.skip-1)
  if t in ('p','div','h2','h3','li','tr'):self.parts.append('\n')
def fetch(item):
 key,title=item
 if (OUT/(key+'.json')).exists():return {'key':key,'cached':True}
 host='zh.wikisource.org' if key.startswith('jiutangshu') else 'zh.wikipedia.org'
 url='https://'+host+'/wiki/'+quote(title)
 r=subprocess.run(['curl','-L','--fail','--retry','2','--retry-all-errors','--max-time','30','-sS',url],capture_output=True,text=True,check=True)
 html=r.stdout
 rev=re.search(r'"wgRevisionId":(\d+)',html) or re.search(r'oldid=(\d+)',html)
 if not rev:raise ValueError('Missing revision: '+title)
 parser=Plain();parser.feed(html)
 content='\n'.join(re.sub(r'\s+',' ',s).strip() for s in ''.join(parser.parts).splitlines() if s.strip())+'\n'
 snapshot=OUT/(key+'.txt');snapshot.write_text(content)
 (OUT/(key+'.html')).write_text(html)
 meta={'id':'tang-se-'+key,'title':title+' — '+('维基文库' if host=='zh.wikisource.org' else '维基百科'),'url':'https://'+host+'/w/index.php?title='+quote(title)+'&oldid='+rev[1],'retrievedAt':datetime.now(timezone.utc).isoformat(),'note':'实际获取页面全文及固定修订，引文逐字核对；古籍与百科只用于建置、名称及事件概览，不能直接核定古城经纬度。','snapshotPath':str(snapshot.relative_to(ROOT)),'snapshotSha256':hashlib.sha256(snapshot.read_bytes()).hexdigest(),'revisionId':rev[1],'htmlSnapshotPath':str((OUT/(key+'.html')).relative_to(ROOT))}
 (OUT/(key+'.json')).write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
 return {'key':key,'characters':len(content),'revision':rev[1]}
if __name__=='__main__':
 PAGES['jiutangshu-41']='舊唐書/卷41'
 wanted={k:v for k,v in PAGES.items() if len(sys.argv)==1 or k in sys.argv[1:]}
 with ThreadPoolExecutor(max_workers=2) as pool:
  fs={pool.submit(fetch,x):x for x in wanted.items()}
  for f in as_completed(fs):
   try: print(json.dumps(f.result(),ensure_ascii=False),flush=True)
   except Exception as e:print(json.dumps({'failed':fs[f][0],'error':str(e)},ensure_ascii=False),flush=True)
