export const ADMIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Funde Autopilot</title>
<style>
:root{--paper:#FAF8F3;--card:#fff;--teal:#0E5C4C;--gold:#C9971A;--ink:#1F2A28;--soft:#5B6663;--line:rgba(14,92,76,.16);--bad:#B3432E}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.45 system-ui,sans-serif}
header{background:var(--teal);color:#fff;padding:16px;border-bottom:4px solid var(--gold)}h1{margin:0;font-size:20px}
main{max-width:760px;margin:0 auto;padding:16px}section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin:0 0 16px}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:var(--teal);margin:0 0 10px}
label{display:block;font-size:12px;color:var(--soft);margin:10px 0 4px}input,textarea,select{width:100%;padding:10px;border:1.5px solid var(--line);border-radius:8px;font:inherit;background:var(--paper)}
textarea{min-height:120px}.row{display:flex;gap:10px;flex-wrap:wrap}.row>*{flex:1;min-width:140px}
button{background:var(--teal);color:#fff;border:0;border-radius:8px;padding:11px 14px;font:inherit;font-weight:600;cursor:pointer}
button.ghost{background:transparent;color:var(--teal);border:1.5px solid var(--teal)}.msg{margin-top:8px;font-size:13px}.bad{color:var(--bad)}
.post{border-top:1px solid var(--line);padding:10px 0}.tag{display:inline-block;font-size:12px;padding:2px 8px;border-radius:20px;background:#F2E4BC;margin-right:6px}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid var(--line);padding:6px 4px;text-align:left;vertical-align:top}
.wrap{overflow-x:auto}a{color:var(--teal)}
</style></head><body>
<header><h1>Funde Autopilot</h1><div>Instagram + Facebook scheduler, daily numbers. Sunday is always off.</div></header>
<main>
<section id="keybox"><h2>Admin key</h2><input id="key" type="password" placeholder="Admin key"><div class="row" style="margin-top:8px"><button onclick="saveKey()">Save key on this phone</button></div></section>

<section><h2>New post</h2>
<div class="row"><div><label>Type</label><select id="kind"><option value="reel">Reel (1 video)</option><option value="carousel">Carousel (2-10 JPG images)</option></select></div>
<div><label>When (IST, Mon-Sat)</label><input id="when" type="datetime-local"></div></div>
<label>Post to</label><div class="row"><label><input type="checkbox" id="pig" checked style="width:auto"> Instagram</label><label><input type="checkbox" id="pfb" checked style="width:auto"> Facebook Page</label></div>
<label>Files (in slide order)</label><input id="files" type="file" multiple accept="video/mp4,image/jpeg">
<label>Instagram caption <span id="count"></span></label><textarea id="caption" oninput="countCap()"></textarea>
<label>Facebook caption (leave empty to reuse the Instagram one)</label><textarea id="fbcap" style="min-height:70px"></textarea>
<div class="row" style="margin-top:12px"><button onclick="createPost()">Upload and schedule</button></div><div id="pmsg" class="msg"></div>
</section>

<section><h2>Queue</h2><div class="row"><button class="ghost" onclick="loadPosts()">Refresh</button><button class="ghost" onclick="runNow()">Publish anything due now</button></div><div id="posts"></div></section>

<section><h2>Numbers</h2><div class="row"><button class="ghost" onclick="loadStats()">Show latest</button><button class="ghost" onclick="pullNow()">Pull numbers now</button></div><div id="stats" class="wrap"></div></section>
</main>
<script>
let KEY='';try{KEY=localStorage.getItem('fa_key')||''}catch(e){}
document.getElementById('key').value=KEY;
function saveKey(){KEY=document.getElementById('key').value.trim();try{localStorage.setItem('fa_key',KEY)}catch(e){};loadPosts()}
async function api(path,opt={}){opt.headers=Object.assign({'x-admin-key':KEY},opt.headers||{});const r=await fetch(path,opt);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(Array.isArray(d.error)?d.error.join('; '):(d.error||r.status));return d}
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function countCap(){const t=document.getElementById('caption').value;const n=[...t].length+(t.match(/\\p{Extended_Pictographic}/gu)||[]).length;const h=(t.match(/#[\\p{L}\\p{N}_]+/gu)||[]).length;
document.getElementById('count').innerHTML=n+' chars, '+h+' hashtags'+(n>470?' <b class=bad>(over 470: Threads cross-share may fail)</b>':'')+(h>5?' <b class=bad>(max 5 hashtags)</b>':'')}
async function createPost(){const m=document.getElementById('pmsg');m.className='msg';
try{const files=[...document.getElementById('files').files];if(!files.length)throw new Error('pick the files first');
const media=[];for(let i=0;i<files.length;i++){m.textContent='Uploading '+(i+1)+' of '+files.length+'...';const f=files[i];
const d=await api('/api/upload?name='+encodeURIComponent(f.name),{method:'POST',body:f,headers:{'content-type':f.type||'application/octet-stream'}});media.push(d.key)}
const platforms=[];if(pig.checked)platforms.push('ig');if(pfb.checked)platforms.push('fb');
const d=await api('/api/posts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:kind.value,platforms,caption:caption.value,fb_caption:fbcap.value,media,when_ist:when.value})});
m.textContent='Scheduled. ID '+d.id;loadPosts()}catch(e){m.className='msg bad';m.textContent=e.message}}
async function loadPosts(){try{const ps=await api('/api/posts');posts.innerHTML=ps.map(p=>{const links=Object.entries(p.state).map(([k,v])=>v.link?'<a target=_blank href="'+esc(v.link)+'">'+k+' live</a>':(v.lastError?'<span class=bad>'+k+': '+esc(v.lastError)+'</span>':'')).join(' ');
return '<div class=post><span class=tag>'+esc(p.kind)+'</span><span class=tag>'+esc(p.platforms.join('+'))+'</span><span class=tag>'+esc(p.status)+'</span> <b>'+esc(p.scheduled_ist.replace('T',' '))+' IST</b><div>'+esc(p.caption.split('\\n')[0].slice(0,140))+'</div><div>'+links+'</div>'+
(['queued','processing'].includes(p.status)?'<button class=ghost onclick="cancelPost(\\''+p.id+'\\')">Cancel</button>':'')+(['failed','partial'].includes(p.status)?'<button class=ghost onclick="retry(\\''+p.id+'\\')">Retry</button>':'')+'</div>'}).join('')||'Nothing queued.'}catch(e){posts.innerHTML='<span class=bad>'+esc(e.message)+'</span>'}}
async function cancelPost(id){await api('/api/posts/'+id,{method:'DELETE'});loadPosts()}
async function retry(id){await api('/api/posts/'+id+'/retry',{method:'POST'});loadPosts()}
async function runNow(){try{await api('/api/run',{method:'POST'})}catch(e){alert(e.message)}loadPosts()}
async function pullNow(){stats.textContent='Pulling...';try{const r=await api('/api/pull',{method:'POST'});stats.textContent=JSON.stringify(r);loadStats()}catch(e){stats.innerHTML='<span class=bad>'+esc(e.message)+'</span>'}}
async function loadStats(){try{const s=await api('/api/stats');if(!s.day){stats.textContent='No numbers yet.';return}
stats.innerHTML='<p>Numbers for '+s.day+(s.compared_with?' (change vs '+s.compared_with+')':'')+'</p><table><tr><th>Where</th><th>Item</th><th>Views</th><th>Likes</th><th>Comm.</th><th>Sends</th><th>Saves</th><th>Followers</th></tr>'+
s.items.map(x=>'<tr><td>'+esc(x.platform)+'</td><td>'+(x.url?'<a target=_blank href="'+esc(x.url)+'">':'')+esc(x.title||x.item_id)+(x.url?'</a>':'')+'</td><td>'+(x.views??'')+(x.views_change?' (+'+x.views_change+')':'')+'</td><td>'+(x.likes??'')+'</td><td>'+(x.comments??'')+'</td><td>'+(x.shares??'')+'</td><td>'+(x.saves??'')+'</td><td>'+(x.followers??'')+(x.followers_change?' ('+(x.followers_change>0?'+':'')+x.followers_change+')':'')+'</td></tr>').join('')+'</table>'}catch(e){stats.innerHTML='<span class=bad>'+esc(e.message)+'</span>'}}
if(KEY){loadPosts()}
</script></body></html>`;
