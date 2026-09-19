const http=require("http"),fs=require("fs"),path=require("path"),{URL}=require("url");
const PORT=process.env.PORT||3000,ROOT=__dirname,DATA=path.join(ROOT,"data/news.json");
fs.mkdirSync(path.dirname(DATA),{recursive:true});if(!fs.existsSync(DATA))fs.writeFileSync(DATA,"[]");

const QUERIES=[
["기술",["AI","반도체","스마트폰"]],
["연예",["연예","배우","드라마"]],
["경제",["경제","주식","부동산"]],
["사회",["사회","교육","소비"]],
["스포츠",["스포츠","축구","야구"]],
["문화",["문화","전시","공연"]]
];
const API="https://freenewsapi.ai/v1/search";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const read=()=>{try{return JSON.parse(fs.readFileSync(DATA,"utf8"))}catch{return[]}};
const write=x=>fs.writeFileSync(DATA,JSON.stringify(x,null,2));
const decodeEntities=s=>(s||"")
 .replace(/&quot;/g,'"')
 .replace(/&apos;/g,"'")
 .replace(/&lt;/g,"<").replace(/&gt;/g,">")
 .replace(/&nbsp;/g," ")
 .replace(/&#x([0-9a-fA-F]+);/g,(m,h)=>String.fromCodePoint(parseInt(h,16)))
 .replace(/&#(\d+);/g,(m,d)=>String.fromCodePoint(parseInt(d,10)))
 .replace(/&amp;/g,"&");
const strip=s=>decodeEntities((s||"").replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim();
const summary=(d,t)=>{d=strip(d);if(!d)return t+" 관련 최신 기사입니다. 원문에서 자세한 내용을 확인할 수 있습니다.";return d.split(/(?<=[.!?。！？])\s+/).filter(Boolean).slice(0,3).join(" ").slice(0,500)};
async function search(q){
 let u=new URL(API);u.searchParams.set("q",q);u.searchParams.set("country","KR");u.searchParams.set("lang","ko");u.searchParams.set("sort","date");u.searchParams.set("size","30");
 let r=await fetch(u);console.log("API status",r.status,q);if(!r.ok)throw Error(r.status);let j=await r.json();console.log("API result count",q,(j.results||j.articles||[]).length);return j;
}
let lastUpdated=null;
async function refresh(){
 let map=new Map(read().map(x=>[x.url,x])),added=0;
 for(const [category,keywords] of QUERIES){
  for(const kw of keywords){
   try{
    let j=await search(kw), arr=j.articles||j.results||[];
    for(const a of arr){
     let title=decodeEntities(a.title||a.name||""),url=a.url||a.original_url||a.link||"";if(!title||!url||map.has(url))continue;
     let ts=a.published_at||a.publishedAt||a.pubDate||a.date||new Date().toISOString(),d=a.description||a.summary||a.content||"";
     let source=(a.publisher&& (a.publisher.name||a.publisher))||a.source||a.sitename||a.host||"Free News API";
     let image=a.image||a.image_url||a.thumbnail||a.top_image||"";
     map.set(url,{title,summary:summary(d,title),category,keyword:kw,source,url,image,tags:[category,...title.split(/\s+/).filter(w=>w.length>=2)].slice(0,3).map(w=>"#"+w.replace(/[“”"'‘’·,:!?()[\]]/g,"")).join(" "),ts:new Date(ts).toISOString()});added++;
    }
   }catch(e){console.error("Free News API:",category,kw,e.message)}
   await sleep(1000);
  }
 }
 let cut=Date.now()-7*864e5,out=[...map.values()].filter(x=>new Date(x.ts)>=cut).sort((a,b)=>new Date(b.ts)-new Date(a.ts));
 write(out);lastUpdated=new Date().toISOString();console.log("Free News API 갱신",added,"신규 /",out.length,"개 보관");return out;
}
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8"};
http.createServer(async(req,res)=>{
 try{
  let u=new URL(req.url,"http://localhost");
  if(u.pathname==="/api/news"){res.writeHead(200,{"Content-Type":mime[".json"],"Cache-Control":"no-store"});return res.end(JSON.stringify(read()))}
  if(u.pathname==="/api/meta"){res.writeHead(200,{"Content-Type":mime[".json"],"Cache-Control":"no-store"});return res.end(JSON.stringify({lastUpdated}))}
  if(u.pathname==="/api/refresh"){let x=await refresh();res.writeHead(200,{"Content-Type":mime[".json"]});return res.end(JSON.stringify({ok:true,count:x.length}))}
  if(u.pathname==="/api/img"){
   let src=u.searchParams.get("u");if(!src||!/^https?:\/\//.test(src))throw Error("400");
   let r=await fetch(src);if(!r.ok)throw Error(r.status);
   res.writeHead(200,{"Content-Type":r.headers.get("content-type")||"image/jpeg","Cache-Control":"public, max-age=86400"});
   return require("stream").Readable.fromWeb(r.body).pipe(res);
  }
  let f=path.join(ROOT,u.pathname==="/"?"index.html":u.pathname);if(!f.startsWith(ROOT)||!fs.existsSync(f))throw Error("404");
  res.writeHead(200,{"Content-Type":mime[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(res);
 }catch(e){res.writeHead(500);res.end(e.message)}
}).listen(PORT,()=>{console.log("http://localhost:"+PORT);refresh().catch(console.error)});
setInterval(()=>refresh().catch(console.error),3600000);
