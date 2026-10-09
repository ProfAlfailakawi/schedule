/* ── تنبيهُ «لديك مقترح دراسي» في بابَي الأستاذ الآخرين ───────────────────────
 *
 * يُحقن نصّاً في صفحة الطلب (/r/:token) وبطاقة الأستاذ (/s/:token): أنماطٌ
 * بأسماءٍ تبدأ بـ pb- وألوانٌ مكتوبة صراحةً (لا تعتمد على متغيّرات الصفحة
 * المضيفة)، ودوالُّ تبدأ بـ pb. لا شرطاتٍ مائلة ولا علاماتِ اقتباسٍ مائلة فيه،
 * فلا يحتاج هروباً داخل قوالب الخادم.
 */
export const PROPOSAL_ALERT_CSS = String.raw`.pb{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 14px;padding:13px 15px;border-radius:18px;border:1px solid #9fcdb6;background:linear-gradient(135deg,#e8f5ee,#f6fbf8);color:#15251d;box-shadow:0 8px 22px rgba(22,57,40,.08)}
.pb-ic{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:13px;background:#247756;color:#fff}
.pb-ic svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.pb-tx{flex:1 1 200px;min-width:0;line-height:1.6}
.pb-tx b{display:block;font-size:15.5px}
.pb-tx span{display:block;font-size:13px;color:#4a6356}
.pb-go{flex:none;display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:9px 18px;border-radius:13px;background:#247756;color:#fff;font-weight:700;font-size:14.5px;text-decoration:none;border:1.5px solid #247756}
.pb-go:hover{background:#1b5c43}
.pb-go:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(36,119,86,.35)}
.pb-more{display:flex;flex-wrap:wrap;gap:8px;width:100%}
.pb-more .pb-go{background:#fff;color:#1b5c43}
@media (max-width:520px){.pb-go{width:100%}}
@media print{.pb{display:none}}
@media screen{.pb{border-color:#a9cfc3}.pb-ic,.pb-go{background:#1f6b5c}.pb-go:hover{background:#17564a}.pb-go:focus-visible{box-shadow:0 0 0 3px rgba(31,107,92,.35)}.pb-more .pb-go{color:#17564a}}`;

export const PROPOSAL_ALERT_SCRIPT = String.raw`
function pbEsc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function pbWhen(iso){var d=new Date(iso);if(!iso||isNaN(d))return "";return d.toLocaleDateString("ar-KW-u-nu-latn",{weekday:"long",day:"numeric",month:"long"})}
function pbHtml(items){if(!items||!items.length)return "";
 var first=items[0],p=first.p,waiting=!p.decision||p.decision.outcome==="waiting"||p.decision.outcome==="none";
 var when=p.expiresAt?pbWhen(p.expiresAt):"";
 var sub=waiting?("يحتاج ردّك"+(when?" قبل "+when:"")+" · لن يتغيّر جدولك إلا بعد موافقتك وتثبيت القسم"):("سجّلنا ردّك · بانتظار تثبيت القسم"+(when?" · يمكنك تغييره حتى "+when:""));
 var link=function(it){return "/r/"+encodeURIComponent(it.token)+"/proposal/"+encodeURIComponent(it.p.id)};
 var h='<div class="pb" role="region" aria-label="مقترح دراسي"><span class="pb-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h10"/></svg></span>'+
 '<div class="pb-tx"><b>'+(items.length===1?"لديك مقترح دراسي من القسم":items.length===2?"لديك مقترحان دراسيان من القسم":"لديك "+items.length+(items.length<=10?" مقترحات دراسية":" مقترحاً دراسياً")+" من القسم")+'</b><span>'+pbEsc(sub)+'</span></div>';
 if(items.length===1)h+='<a class="pb-go" href="'+pbEsc(link(first))+'">فتح المقترح</a>';
 else h+='<div class="pb-more">'+items.map(function(it,i){return '<a class="pb-go" href="'+pbEsc(link(it))+'">'+pbEsc(it.p.title||("المقترح "+(i+1)))+'</a>'}).join("")+'</div>';
 return h+'</div>'}
/* يجلب مقترحات كل رابطٍ شخصي ويُبقي ما بابُ الرد فيه مفتوح. الفشلُ صمتٌ: التنبيهُ زيادة. */
function pbLoad(tokens,done){tokens=(tokens||[]).slice(0,8);var out=[],left=tokens.length;if(!left){done([]);return}
 tokens.forEach(function(t){
  fetch("/api/public/request/"+encodeURIComponent(t)+"/proposals",{headers:{Accept:"application/json"},cache:"no-store"})
  .then(function(r){return r.ok?r.json():{proposals:[]}}).catch(function(){return {proposals:[]}})
  .then(function(d){(d.proposals||[]).forEach(function(p){if(p&&p.gate&&p.gate.open&&!p.committedAt)out.push({token:t,p:p})});
   if(--left===0)done(out)})})}
`;
