const folios = [
  { id:"HV-2408", guest:"Nico Reyes", stay:"12–14 Nov 2026", total:18400, paid:11200, credit:0, inHouse:true, checkoutDue:true, entries:[
    { kind:"room", title:"Room stay", note:"2 nights · posted 12 Nov", date:"12 Nov", amount:16000 },
    { kind:"charge", title:"Minibar", note:"Incidentals · posted 13 Nov", date:"13 Nov", amount:1200, reversible:true },
    { kind:"charge", title:"Airport transfer", note:"Transportation · posted 13 Nov", date:"13 Nov", amount:1600, reversible:true },
    { kind:"adjustment", title:"Service recovery credit", note:"Correction · posted 13 Nov", date:"13 Nov", amount:-400 },
    { kind:"payment", title:"Reservation deposit", note:"Verified · GCash · 12 Nov", date:"12 Nov", amount:-4000 },
    { kind:"payment", title:"Stay payment", note:"Recorded · Cash · 14 Nov", date:"14 Nov", amount:-7200 }
  ]},
  { id:"HV-2416", guest:"Elena Cruz", stay:"14–16 Nov 2026", total:9800, paid:0, credit:0, pendingDeposit:3000, entries:[
    { kind:"room", title:"Room obligation", note:"2 nights · reserved 14 Nov", date:"14 Nov", amount:9800 }
  ]},
  { id:"HV-2393", guest:"Luis Dela Cruz", stay:"10–13 Nov 2026", total:21200, paid:21200, credit:800, entries:[
    { kind:"room", title:"Room stay", note:"3 nights · posted 10 Nov", date:"10 Nov", amount:20000 },
    { kind:"charge", title:"Room service", note:"Dining · posted 11 Nov", date:"11 Nov", amount:1200, reversible:true },
    { kind:"payment", title:"Stay payment", note:"Recorded · Card · 12 Nov", date:"12 Nov", amount:-22000 }
  ]},
  { id:"HV-2387", guest:"Amara Santos", stay:"9–11 Nov 2026", total:12500, paid:12500, credit:0, entries:[
    { kind:"room", title:"Room stay", note:"2 nights · posted 9 Nov", date:"9 Nov", amount:12500 },
    { kind:"payment", title:"Reservation deposit", note:"Verified · GCash · 9 Nov", date:"9 Nov", amount:-3500 },
    { kind:"payment", title:"Stay payment", note:"Recorded · Cash · 11 Nov", date:"11 Nov", amount:-9000 }
  ]},
  { id:"HV-2372", guest:"Celeste Lim", stay:"6–7 Nov 2026", total:6400, paid:6400, credit:0, entries:[
    { kind:"room", title:"Room stay", note:"1 night · posted 6 Nov", date:"6 Nov", amount:6400 },
    { kind:"payment", title:"Stay payment", note:"Recorded · Card · 7 Nov", date:"7 Nov", amount:-6400 }
  ]}
];

const money = amount => new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(amount);
const balance = folio => Math.max(0,folio.total-folio.paid);
const state = folio => balance(folio)>0?"due":folio.credit>0?"credit":"paid";
const label = folio => folio.pendingDeposit?"Deposit review":folio.checkoutDue?"Checkout due":state(folio)==="due"?"Balance due":state(folio)==="credit"?"Credit held":"Settled";
const matchesQueue = (folio,filter) => filter==="all" || filter==="checkout"&&folio.checkoutDue || filter==="review"&&Boolean(folio.pendingDeposit) || filter==="settled"&&state(folio)==="paid";
const byId = id => document.getElementById(id);
const app = { role:"front_desk", filter:"all", activity:"all", query:"", selected:folios[0].id, mobileDetail:false };
let toastTimer;

function notify(message){
  const toast=byId("toast"); toast.textContent=message; toast.hidden=false;
  window.clearTimeout(toastTimer); toastTimer=window.setTimeout(()=>{toast.hidden=true},4200);
}
function visibleFolios(){
  const query=app.query.trim().toLowerCase();
  return folios.filter(folio => matchesQueue(folio,app.filter) && (!query||`${folio.guest} ${folio.id}`.toLowerCase().includes(query)));
}
function renderRegister(){
  const rows=visibleFolios();
  if(rows.length && !rows.some(folio=>folio.id===app.selected)) app.selected=rows[0].id;
  byId("result-count").textContent=`${rows.length} of ${folios.length}`;
  byId("range").textContent=`Showing ${rows.length} sample ${rows.length===1?"folio":"folios"}`;
  document.querySelectorAll("[data-filter]").forEach(button=>{
    const filter=button.dataset.filter;
    button.setAttribute("aria-pressed",String(app.filter===filter));
    button.querySelector("span").textContent=`(${folios.filter(folio=>matchesQueue(folio,filter)).length})`;
  });
  byId("folio-list").innerHTML=rows.map(folio=>{
    const s=state(folio);
    const count=folio.entries.length;
    return `<button class="folio-row" type="button" data-folio="${folio.id}" aria-current="${folio.id===app.selected}"><div class="row-main"><strong>${folio.guest}</strong><span class="amount">${count} ${count===1?"entry":"entries"}</span></div><div class="row-meta">${folio.id} · ${folio.stay}</div><div class="row-bottom"><span class="status ${s}">${label(folio)}</span><span>${folio.credit?"Credit":"Balance"} ${money(folio.credit||balance(folio))}</span></div></button>`;
  }).join("");
  byId("empty").hidden=rows.length>0;
  byId("detail").hidden=rows.length===0;
}
function visibleEntries(folio){
  return folio.entries.filter(entry=>app.activity==="all"||app.activity==="charges"&&["room","charge"].includes(entry.kind)||app.activity==="payments"&&entry.kind==="payment"||app.activity==="adjustments"&&entry.kind==="adjustment");
}
function renderDetail(){
  const folio=folios.find(item=>item.id===app.selected);
  if(!folio) return;
  const s=state(folio);
  byId("detail-title").textContent=folio.guest;
  byId("detail-reference").textContent=`${folio.id} · ${folio.stay}`;
  byId("detail-status").className=`status ${s}`;
  byId("detail-status").textContent=label(folio);
  byId("total-value").textContent=money(folio.total);
  byId("paid-value").textContent=money(folio.paid);
  byId("due-value").textContent=money(balance(folio));
  byId("credit-value").textContent=money(folio.credit);
  byId("deposit-note").hidden=!folio.pendingDeposit;
  byId("deposit-note").textContent=folio.pendingDeposit?`${money(folio.pendingDeposit)} deposit awaiting Accounting verification. It is not included in applied payments.`:"";
  const entries=visibleEntries(folio);
  byId("activity-count").textContent=`${entries.length} ${entries.length===1?"entry":"entries"}`;
  document.querySelectorAll("[data-activity]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.activity===app.activity)));
  byId("activity-list").innerHTML=entries.length?entries.map(entry=>{
    const category=entry.kind==="room"?"Room":entry.kind==="charge"?"Charge":entry.kind==="payment"?"Payment":"Correction";
    const reverse=app.role==="accounting"&&entry.reversible?`<button class="entry-reverse" type="button" data-reverse="${entry.title}">Reverse charge</button>`:"";
    return `<div class="entry ${entry.kind}"><span class="entry-mark" aria-hidden="true">${category[0]}</span><div><div class="entry-title">${entry.title}</div><div class="entry-sub">${category} · ${entry.note}</div></div><div class="entry-value ${entry.amount<0?"negative":""}">${entry.amount<0?"−":"+"}${money(Math.abs(entry.amount))}${reverse}</div></div>`;
  }).join(""):`<p class="activity-empty">No ${app.activity} entries on this folio.</p>`;
  const primary=byId("primary-action");
  primary.textContent=folio.pendingDeposit&&app.role==="accounting"?"Review deposit":folio.inHouse&&balance(folio)>0?"Collect payment":"Open reservation";
  byId("adjustment").hidden=app.role!=="accounting";
}
function render(){
  renderRegister();renderDetail();
  document.querySelectorAll("[data-role]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.role===app.role)));
  byId("workspace").classList.toggle("show-detail",app.mobileDetail);
}

document.querySelectorAll("[data-role]").forEach(button=>button.addEventListener("click",()=>{app.role=button.dataset.role;render();}));
document.querySelectorAll("[data-filter]").forEach(button=>button.addEventListener("click",()=>{app.filter=button.dataset.filter;app.mobileDetail=false;render();}));
document.querySelectorAll("[data-activity]").forEach(button=>button.addEventListener("click",()=>{app.activity=button.dataset.activity;renderDetail();}));
byId("search").addEventListener("input",event=>{app.query=event.target.value;app.mobileDetail=false;render();});
byId("folio-list").addEventListener("click",event=>{
  const row=event.target.closest("[data-folio]");if(!row)return;
  app.selected=row.dataset.folio;app.activity="all";app.mobileDetail=true;render();
  if(window.matchMedia("(max-width: 760px)").matches) byId("detail-title").focus();
});
byId("activity-list").addEventListener("click",event=>{const button=event.target.closest("[data-reverse]");if(button)notify(`Preview only · Accounting would review reversal of ${button.dataset.reverse}.`);});
byId("back").addEventListener("click",()=>{app.mobileDetail=false;render();document.querySelector(`[data-folio="${app.selected}"]`)?.focus();});
byId("clear").addEventListener("click",()=>{app.query="";app.filter="all";byId("search").value="";render();byId("search").focus();});
byId("statement").addEventListener("click",()=>notify("Preview only · The live action issues an immutable folio statement."));
byId("adjustment").addEventListener("click",()=>notify("Preview only · Accounting would open the existing adjustment flow."));
byId("primary-action").addEventListener("click",()=>notify(`Preview only · Billing would open the ${byId("primary-action").textContent.toLowerCase()} flow.`));
byId("theme").addEventListener("click",()=>{
  const dark=document.documentElement.dataset.theme!=="dark";
  document.documentElement.dataset.theme=dark?"dark":"light";
  byId("theme").setAttribute("aria-label",dark?"Switch to light theme":"Switch to dark theme");
});
render();
