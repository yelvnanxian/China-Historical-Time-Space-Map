#!/usr/bin/env python3
"""Re-fetch revision-linked encyclopedia extracts for south/east Tang dossiers."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, quote
import hashlib,json,subprocess,sys
ROOT=Path(__file__).resolve().parents[4]
OUT=Path(__file__).resolve().parent
PAGES={
 'chengdu':'成都市','guangzhou':'广州市','yangzhou':'扬州市','xiangyang':'襄阳市','jingzhou':'荆州市','nanjing':'南京市','hangzhou':'杭州市','quanzhou':'泉州市','dali':'大理市',
 'suzhou':'苏州市','zhenjiang':'镇江市','shaoxing':'绍兴市','ningbo':'宁波市','huzhou':'湖州市','jinhua':'金华市','nanchang':'南昌市','jiujiang':'九江市','changsha':'长沙市','hengyang':'衡阳市','wuchang':'武昌区','fuzhou':'福州市','wenzhou':'温州市','xuancheng':'宣城市','shexian':'歙县','shouxian':'寿县','hefei':'合肥市','santai':'三台县','mianyang':'绵阳市','guanghan':'广汉市','jiange':'剑阁县','hanzhong':'汉中市','fengjie':'奉节县','chongqing':'重庆市','langzhong':'阆中市','suining':'遂宁市','guilin':'桂林市','liuzhou':'柳州市','nanning':'南宁市','hanoi':'河内市','changzhou':'常州市',
 'suzhou-prefecture':'苏州 (古代)','runzhou-prefecture':'润州','yuezhou-prefecture':'越州','mingzhou-prefecture':'明州','huzhou-prefecture':'湖州 (古代)','wuzhou-prefecture':'婺州','hongzhou-prefecture':'洪州','jiangzhou-prefecture':'江州 (行政区划)','tanzhou-prefecture':'潭州','hengzhou-prefecture':'衡州','ezhou-prefecture':'鄂州 (古代)','fuzhou-prefecture':'福州 (古代)','wenzhou-prefecture':'温州 (古代)','xuanzhou-prefecture':'宣州','shezhou-prefecture':'歙州','shouzhou-prefecture':'寿州','luzhou-prefecture':'庐州','zizhou-prefecture':'梓州','mianzhou-prefecture':'绵州','hanzhou-prefecture':'汉州','jianzhou-prefecture':'剑州','liangzhou-prefecture':'梁州','kuizhou-prefecture':'夔州','yuzhou-prefecture':'渝州','langzhou-prefecture':'阆州','suizhou-prefecture':'遂州','guizhou-prefecture':'桂州','liuzhou-prefecture':'柳州 (古代)','yongzhou-prefecture':'邕州','annan-protectorate':'安南都护府','changzhou-prefecture':'常州 (古代)',
}
def fetch(item):
 key,title=item
 if (OUT/(key+'.json')).exists(): return {'key':key,'cached':True}
 params={'action':'query','prop':'extracts|revisions','titles':title,'redirects':1,'explaintext':1,'rvprop':'ids|timestamp','format':'json','formatversion':2}
 api='https://zh.wikipedia.org/w/api.php?'+urlencode(params)
 response=subprocess.run(['curl','-L','--fail','--retry','3','--retry-all-errors','--max-time','35','-sS',api],capture_output=True,text=True,check=True)
 raw=json.loads(response.stdout)
 page=raw['query']['pages'][0]
 content=page.get('extract','')
 if len(content)<40: return {'key':key,'missing':True,'title':page['title']}
 snapshot=OUT/(key+'.txt')
 snapshot.write_text(content,encoding='utf-8')
 (OUT/(key+'.api.json')).write_text(json.dumps(raw,ensure_ascii=False,indent=2)+'\n')
 revision=page['revisions'][0]
 meta={'id':'tang-se-'+key,'title':page['title']+' — 维基百科','url':'https://zh.wikipedia.org/w/index.php?title='+quote(page['title'])+'&oldid='+str(revision['revid']),'retrievedAt':datetime.now(timezone.utc).isoformat(),'note':'固定修订百科条目，供唐代建置、名称和历史节点概览；坐标仅是现代地区参考，不由本文核定。引文保留原字形。','snapshotPath':str(snapshot.relative_to(ROOT)),'snapshotSha256':hashlib.sha256(snapshot.read_bytes()).hexdigest(),'pageId':page['pageid'],'revision':revision,'apiUrl':api}
 (OUT/(key+'.json')).write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
 return {'key':key,'title':page['title'],'characters':len(content),'revid':revision['revid']}
if __name__=='__main__':
 chosen={k:v for k,v in PAGES.items() if len(sys.argv)==1 or k in sys.argv[1:]}
 with ThreadPoolExecutor(max_workers=2) as pool:
  futures={pool.submit(fetch,x):x for x in chosen.items()}
  for f in as_completed(futures):
   try: print(json.dumps(f.result(),ensure_ascii=False),flush=True)
   except Exception as e: print(json.dumps({'failed':futures[f][0],'error':str(e)},ensure_ascii=False),flush=True)
