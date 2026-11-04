const checkIn = document.querySelector('[name="checkIn"]');
const checkOut = document.querySelector('[name="checkOut"]');
document.querySelectorAll('[data-room-photo]').forEach(button=>button.addEventListener('click',()=>{
  const image=document.querySelector('#selected-room-photo');
  image.src=button.dataset.roomPhoto;
  image.alt=`${button.dataset.roomName} — existing illustrative room photograph`;
  document.querySelector('#selected-room-name').textContent=button.dataset.roomName;
  document.querySelector('#selected-room-spec').textContent=button.dataset.roomSpec;
  document.querySelector('#selected-room-rate').textContent=new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(button.dataset.roomRate);
  document.querySelector('#selected-room-link').href='/booking/search?roomType='+encodeURIComponent(button.dataset.roomName);
  document.querySelectorAll('[data-room-photo]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  updateRoomLinks();
}));
const today = new Date();
const localDate = value => `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
checkIn.min = localDate(today);
function updateCheckout() {
  if (!checkIn.value) return;
  const next = new Date(`${checkIn.value}T12:00:00`);
  next.setDate(next.getDate()+1);
  checkOut.min = localDate(next);
  if (checkOut.value && checkOut.value <= checkIn.value) checkOut.value = '';
}
checkIn.addEventListener('change',updateCheckout);
function updateRoomLinks(){
  document.querySelectorAll('a[href*="roomType="]').forEach(link=>{
    const url=new URL(link.href);
    if(checkIn.value&&checkOut.value&&checkOut.value>checkIn.value){
      url.searchParams.set('checkIn',checkIn.value);
      url.searchParams.set('checkOut',checkOut.value);
      url.searchParams.set('guests',document.querySelector('[name="guests"]').value);
    }else{
      ['checkIn','checkOut','guests'].forEach(key=>url.searchParams.delete(key));
    }
    link.href=url.pathname+url.search;
  });
}
document.querySelector('.booking').addEventListener('change',updateRoomLinks);
const menu = document.querySelector('.menu');
const mobileNavigation = document.querySelector('#mobile-navigation');
menu.addEventListener('click',()=>{
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded',String(open));
  menu.setAttribute('aria-label',open?'Close menu':'Open menu');
  mobileNavigation.hidden = !open;
});
mobileNavigation.addEventListener('click',event=>{
  if (event.target.closest('a')) { mobileNavigation.hidden=true; menu.setAttribute('aria-expanded','false'); menu.setAttribute('aria-label','Open menu'); }
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!mobileNavigation.hidden){mobileNavigation.hidden=true;menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open menu');menu.focus();}
});
const roomTrack = document.querySelector('.rooms');
const previous = document.querySelector('#room-prev');
const next = document.querySelector('#room-next');
if(roomTrack){
function syncRooms(){previous.disabled=roomTrack.scrollLeft<=2;next.disabled=roomTrack.scrollLeft>=roomTrack.scrollWidth-roomTrack.clientWidth-2;}
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function stepRoom(direction){const width=roomTrack.querySelector('.room').getBoundingClientRect().width;const gap=parseFloat(getComputedStyle(roomTrack).gap);roomTrack.scrollBy({left:direction*(width+gap),behavior:reduced?'instant':'smooth'});}
previous.addEventListener('click',()=>stepRoom(-1));
next.addEventListener('click',()=>stepRoom(1));
roomTrack.addEventListener('scroll',syncRooms);
window.addEventListener('resize',syncRooms);
syncRooms();
}
const scenes={
  morning:['photo-1544148103-0773bf10d330','A slow morning over breakfast','A slower start. A moment over breakfast. Settle into the little things that make time away feel different.'],
  afternoon:['photo-1571003123894-1f0594d2b5d9','An illustrative hotel pool in afternoon light','A poolside pause. A little sunshine. Leave room in your afternoon to do a little less.'],
  evening:['photo-1611892440504-42a792e24d32','An illustrative hotel room ready for the evening','A room to return to. A quieter evening. Unwind at your own pace, with tomorrow still ahead.'],
};
document.querySelectorAll('[data-scene]').forEach(button=>button.addEventListener('click',()=>{
  const [photo,alt,description]=scenes[button.dataset.scene];
  const image=document.querySelector('#experience-photo');
  image.src=`https://images.unsplash.com/${photo}?q=80&w=1400&auto=format&fit=crop`;
  image.alt=alt;
  document.querySelector('#experience-description').textContent=description;
  document.querySelectorAll('[data-scene]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
}));
