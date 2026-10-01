/* =========================================================
   FOOD BRIDGE — SIMPLE SUPABASE VERSION
   No phone verification and no backend server.
   Put your Supabase URL and ANON key in the two constants below.
   ========================================================= */

const SUPABASE_URL = "https://yhpiusaqqdguzicotckn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_4LanKY69Dc69gvBf0bfDXw_VQulw0Tg";

let supabaseClient = null;
let donations = [];
let receivers = [];
let currentUser = null;
let isAdmin = false;
let receiverTab = 'available';
let dataReady = false;
let selectedImageData = null;

const FOOD_EXPIRY_MS = 24 * 60 * 60 * 1000;
const SUPPORT_EMAIL = "mealagainsupport01@gmail.com";

/* ---------- SUPABASE ---------- */
function initSupabase(){
  if(SUPABASE_URL === "YOUR_SUPABASE_URL" || SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY"){
    console.warn("Supabase is not configured yet.");
    return false;
  }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
}

function requireSupabase(){
  if(!supabaseClient){
    toast('Add your Supabase URL and anon key in the HTML first.', true);
    return false;
  }
  return true;
}

function mapDonation(row){
  return {
    id: row.id,
    donorName: row.donor_name || '',
    food: row.food || '',
    category: row.category || 'Other',
    qty: row.qty || '',
    address: row.address || '',
    phone: row.phone || '',
    image: row.image || null,
    accepted: !!row.accepted,
    acceptedBy: row.accepted_by || null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    reported: !!row.reported,
    reportReason: row.report_reason || null,
    reportedBy: row.reported_by || null,
    reportedAt: row.reported_at || null
  };
}

function donationRow(d){
  return {
    id: d.id,
    donor_name: d.donorName,
    food: d.food,
    category: d.category,
    qty: d.qty,
    address: d.address,
    phone: d.phone,
    image: d.image || null,
    accepted: !!d.accepted,
    accepted_by: d.acceptedBy || null,
    created_at: d.createdAt,
    expires_at: d.expiresAt,
    reported: !!d.reported,
    report_reason: d.reportReason || null,
    reported_by: d.reportedBy || null,
    reported_at: d.reportedAt || null
  };
}

function mapReceiver(row){
  return {user:row.user_name, phone:row.phone || ''};
}

async function loadData(){
  if(!requireSupabase()) return;

  try{
    const [dRes,rRes] = await Promise.all([
      supabaseClient.from('donations').select('*').order('created_at',{ascending:false}),
      supabaseClient.from('receivers').select('user_name,phone').order('user_name')
    ]);

    if(dRes.error) throw dRes.error;
    if(rRes.error) throw rRes.error;

    donations=(dRes.data||[]).map(mapDonation);
    receivers=(rRes.data||[]).map(mapReceiver);

    const expiredIds=donations
      .filter(d=>!d.accepted&&!d.reported&&isExpired(d))
      .map(d=>d.id);

    if(expiredIds.length){
      const {error}=await supabaseClient.from('donations').delete().in('id',expiredIds);
      if(!error) donations=donations.filter(d=>!expiredIds.includes(d.id));
    }

    dataReady=true;
  }catch(err){
    console.error(err);
    toast('Supabase connection failed: '+(err.message||err),true);
  }
}

async function saveDonations(){
  if(!requireSupabase()) return false;
  if(!donations.length) return true;

  const {error}=await supabaseClient.from('donations')
    .upsert(donations.map(donationRow),{onConflict:'id'});

  if(error){
    console.error(error);
    toast('Could not save donation: '+error.message,true);
    return false;
  }
  return true;
}

async function saveReceivers(){
  if(!requireSupabase()) return false;
  if(!receivers.length) return true;

  const {error}=await supabaseClient.from('receivers')
    .upsert(receivers.map(r=>({
      user_name:r.user,
      phone:r.phone||''
    })),{onConflict:'user_name'});

  if(error){
    console.error(error);
    toast('Could not save receiver: '+error.message,true);
    return false;
  }
  return true;
}

/* ---------- EXPIRY ---------- */
function donationExpiresAt(d){
  return d.expiresAt ? new Date(d.expiresAt).getTime() :
    (new Date(d.createdAt).getTime()+FOOD_EXPIRY_MS);
}
function isExpired(d){
  return !d.accepted && Date.now()>donationExpiresAt(d);
}
function expiryLabel(d){
  const ms=donationExpiresAt(d)-Date.now();
  if(ms<=0) return 'Expired';
  const h=Math.floor(ms/3600000);
  const m=Math.floor((ms%3600000)/60000);
  return h>0 ? `Expires in ${h}h ${m}m` : `Expires in ${m}m`;
}
function isExpiringSoon(d){
  const ms=donationExpiresAt(d)-Date.now();
  return ms>0 && ms<=2*60*60*1000;
}

/* ---------- UTILITY ---------- */
function escapeHtml(str){
  return String(str??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function toast(msg,isErr){
  const host=document.getElementById('toast-host');
  const el=document.createElement('div');
  el.className='toast'+(isErr?' err':'');
  el.textContent=msg;
  host.appendChild(el);
  setTimeout(()=>el.remove(),3200);
}
function setFieldError(id,hasError){
  const el=document.getElementById(id);
  if(el) el.classList.toggle('error',hasError);
}
function validPhone(p){
  const digits=String(p||'').replace(/\D/g,'');
  return digits.length>=7 && digits.length<=15;
}
function normalizePhone(p){
  return String(p||'').replace(/\D/g,'');
}

/* ---------- IMAGE ---------- */
function compressImage(file){
  return new Promise((resolve,reject)=>{
    if(!file.type.startsWith('image/')){reject(new Error('Not an image'));return;}
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Could not read file'));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('Could not decode image'));
      img.onload=()=>{
        const maxDim=900;
        let {width,height}=img;
        if(width>maxDim||height>maxDim){
          if(width>height){
            height=Math.round(height*maxDim/width); width=maxDim;
          }else{
            width=Math.round(width*maxDim/height); height=maxDim;
          }
        }
        const canvas=document.createElement('canvas');
        canvas.width=width; canvas.height=height;
        canvas.getContext('2d').drawImage(img,0,0,width,height);
        resolve(canvas.toDataURL('image/jpeg',0.72));
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- NAVIGATION ---------- */
function showScreen(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const target=document.getElementById('screen-'+name);
  if(target) target.classList.add('active');
  const loginErr=document.getElementById('loginErr');
  if(loginErr) loginErr.style.display='none';
  document.getElementById('userChip').textContent=
    currentUser?('Signed in as '+currentUser):(isAdmin?'Admin':'');
}
function logout(){
  togglePasswordMenu(false);
  currentUser=null; isAdmin=false;
  document.getElementById('ruser').value='';
  document.getElementById('rpass').value='';
  document.getElementById('rphone').value='';
  showScreen('home'); renderHome();
}

/* ---------- HOME ---------- */
function renderHome(){
  const pending=donations.filter(d=>!d.accepted&&!d.reported&&!isExpired(d)).length;
  const accepted=donations.filter(d=>d.accepted).length;
  document.getElementById('pendingCount').textContent=pending;
  document.getElementById('statTotal').textContent=donations.length;
  document.getElementById('statAccepted').textContent=accepted;
  document.getElementById('statReceivers').textContent=receivers.length;
  document.getElementById('thaliCount').textContent=accepted;
  renderLeaderboard();
}
function renderLeaderboard(){
  const box=document.getElementById('leaderboardList');
  const counts=new Map();
  donations.forEach(d=>{
    const name=(d.donorName||'').trim();
    if(name) counts.set(name,(counts.get(name)||0)+1);
  });
  const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
  if(!ranked.length){
    box.innerHTML='<div class="empty"><b>No donors yet</b>Once donations come in, top donors will be ranked here.</div>';
    return;
  }
  box.innerHTML=ranked.map(([name,count],i)=>`
    <div class="lb-row clickable ${i===0?'top1':i===1?'top2':i===2?'top3':''}"
      data-donor="${escapeHtml(name)}" tabindex="0" role="button"
      onclick="showDonorDetails(this.dataset.donor)"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showDonorDetails(this.dataset.donor);}">
      <div class="lb-rank">${i+1}</div>
      <div class="lb-name">${escapeHtml(name)}</div>
      <div class="lb-count"><b>${count}</b> ${count===1?'donation':'donations'}</div>
    </div>`).join('');
}
function showDonorDetails(name){
  const matches=donations.filter(d=>(d.donorName||'').trim()===name)
    .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  if(!matches.length) return;
  const latest=matches[0];
  document.getElementById('dmName').textContent=name;
  document.getElementById('dmCount').textContent=
    `${matches.length} ${matches.length===1?'donation':'donations'} logged`;
  document.getElementById('dmPhone').textContent=latest.phone||'—';
  document.getElementById('dmAddress').textContent=latest.address||'—';
  document.getElementById('donorModal').classList.add('show');
}
function closeDonorModal(){
  document.getElementById('donorModal').classList.remove('show');
}

/* ---------- DONOR ---------- */
function showTrackPanel(){
  const p=document.getElementById('trackPanel');
  p.style.display=p.style.display==='none'?'block':'none';
}
function trackDonations(){
  const phone=document.getElementById('trackPhone').value.trim();
  const box=document.getElementById('trackResults');
  if(!phone){
    box.innerHTML='<p style="font-size:13px;color:#84907F;">Enter the phone number you donated with.</p>';
    return;
  }
  const digits=phone.replace(/\D/g,'');
  const mine=donations.filter(d=>String(d.phone||'').replace(/\D/g,'').endsWith(digits)&&digits.length>=6);
  if(!mine.length){
    box.innerHTML='<div class="empty"><b>Nothing found</b>No donations are linked to that number yet.</div>';
    return;
  }
  box.innerHTML=mine.map(d=>{
    let statusClass=d.accepted?'accepted':'pending';
    let statusText=d.accepted?'Accepted':'Pending';
    if(d.reported){statusClass='reported';statusText='Reported as fake';}
    else if(!d.accepted&&isExpired(d)) statusText='Expired';
    return `<div class="receiver-row"><span>${escapeHtml(d.food)} · ${escapeHtml(d.qty)}</span><span class="badge ${statusClass}">${statusText}</span></div>`;
  }).join('');
}
async function addDonation(){
  const donorName=document.getElementById('donorName').value.trim();
  const food=document.getElementById('food').value.trim();
  const category=document.getElementById('category').value;
  const otherFood=document.getElementById('otherFood').value.trim();
  const qty=document.getElementById('qty').value.trim();
  const finalFood=category==='Other' ? otherFood : food;
  const address=document.getElementById('address').value.trim();
  const phone=document.getElementById('phone').value.trim();

  let ok=true;
  setFieldError('f-donorname',!donorName); if(!donorName) ok=false;
  setFieldError('f-food',category==='Other'?false:!food); if(category!=='Other'&&!food) ok=false;
  setFieldError('f-otherfood',category==='Other'&&!otherFood); if(category==='Other'&&!otherFood) ok=false;
  setFieldError('f-qty',!qty); if(!qty) ok=false;
  setFieldError('f-address',!address); if(!address) ok=false;
  setFieldError('f-image',!selectedImageData); if(!selectedImageData) ok=false;
  setFieldError('f-phone',!validPhone(phone)); if(!validPhone(phone)) ok=false;

  if(!ok){toast('Please fill all required fields.',true);return;}
  if(!requireSupabase()) return;

  const btn=document.getElementById('submitDonationBtn');
  btn.disabled=true; btn.textContent='Saving…';

  const now=new Date();
  const row={
    donor_name:donorName, food:finalFood, category, qty, address, phone,
    image:selectedImageData, accepted:false, accepted_by:null,
    created_at:now.toISOString(),
    expires_at:new Date(now.getTime()+FOOD_EXPIRY_MS).toISOString(),
    reported:false, report_reason:null, reported_by:null, reported_at:null
  };

  const {data,error}=await supabaseClient.from('donations').insert(row).select().single();
  btn.disabled=false; btn.textContent='Submit donation';

  if(error){console.error(error);toast('Could not save donation: '+error.message,true);return;}

  donations.unshift(mapDonation(data));
  toast('Donation added — thank you!');

  ['donorName','food','otherFood','qty','address'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('phone').value='';
  document.getElementById('category').selectedIndex=0;
  document.getElementById('image').value='';
  document.getElementById('imgPreview').style.backgroundImage='';
  document.getElementById('imgPreview').textContent='No photo selected';
  selectedImageData=null;
  ['f-donorname','f-food','f-otherfood','f-qty','f-address','f-phone','f-image'].forEach(id=>setFieldError(id,false));
  renderHome();
}

/* ---------- RECEIVER LOGIN ---------- */
async function receiverLogin(){
  const u=document.getElementById('ruser').value.trim();
  const p=document.getElementById('rpass').value;
  const phone=normalizePhone(document.getElementById('rphone').value);
  const errEl=document.getElementById('loginErr');
  const btn=document.getElementById('loginBtn');

  errEl.style.display='none';

  // Username and password are always required.
  if(!u||!p){
    errEl.textContent='Enter username and password.';
    errEl.style.display='block';
    return;
  }

  if(!requireSupabase()) return;

  btn.disabled=true;
  btn.textContent='Checking…';

  try{
    // Check the admin account first. Admin also requires its registered mobile number.
    if(!validPhone(phone)){
      errEl.textContent='Enter the mobile number registered for this account.';
      errEl.style.display='block';
      return;
    }

    const {data:admin,error:adminError}=await supabaseClient
      .from('admin_accounts')
      .select('username,phone')
      .eq('username',u)
      .eq('password',p)
      .maybeSingle();

    if(adminError) throw adminError;

    if(admin && normalizePhone(admin.phone)===phone){
      isAdmin=true;
      currentUser=null;
      errEl.style.display='none';
      showScreen('adminPanel');
      renderAdmin();
      return;
    }

    // If it is not a matching admin account, check the receiver account.
    // Receiver phone must also match the number stored by the admin.

    const {data:receiver,error:receiverError}=await supabaseClient
      .from('receivers')
      .select('user_name,phone')
      .eq('user_name',u)
      .eq('password',p)
      .maybeSingle();

    if(receiverError) throw receiverError;

    if(receiver && normalizePhone(receiver.phone)===phone){
      currentUser=receiver.user_name;
      isAdmin=false;
      document.getElementById('receiverName').textContent=receiver.user_name;
      receiverTab='available';
      showScreen('receiver');
      renderReceiverList();
    }else{
      errEl.textContent='Username, password or mobile number does not match the registered account.';
      errEl.style.display='block';
    }
  }catch(err){
    console.error(err);
    errEl.textContent='Login failed: '+(err.message||err);
    errEl.style.display='block';
  }finally{
    btn.disabled=false;
    btn.textContent='Log in';
  }
}

/* ---------- RECEIVER PANEL ---------- */
function setReceiverTab(tab){
  receiverTab=tab;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));
  renderReceiverList();
}
function renderReceiverList(){
  const list=document.getElementById('receiverList');
  const search=(document.getElementById('receiverSearch')?.value||'').trim().toLowerCase();
  const category=document.getElementById('receiverCategoryFilter')?.value||'';

  let rows=donations.filter(d=>!isExpired(d)||d.accepted||d.reported);
  if(receiverTab==='available') rows=rows.filter(d=>!d.accepted&&!d.reported&&!isExpired(d));
  else rows=rows.filter(d=>d.accepted&&d.acceptedBy===currentUser);

  if(search) rows=rows.filter(d=>[d.food,d.donorName,d.address,d.category]
    .some(v=>String(v||'').toLowerCase().includes(search)));
  if(category) rows=rows.filter(d=>d.category===category);

  if(!rows.length){
    list.innerHTML='<div class="empty"><b>No donations found</b>Try another search or check back soon.</div>';
    return;
  }

  list.innerHTML='<div class="grid">'+rows.map(d=>`
    <article class="dcard">
      ${d.image?`<img src="${d.image}" alt="Food donation">`:`<div class="img-preview" style="height:150px;border:none;border-radius:0;">No photo</div>`}
      <div class="body">
        <div class="food">${escapeHtml(d.food)}</div>
        <div class="meta"><span>${escapeHtml(d.category)}</span><span>•</span><span>${escapeHtml(d.qty)}</span></div>
        <div class="addr">📍 ${escapeHtml(d.address)}</div>
        <div class="meta">👤 ${escapeHtml(d.donorName)}</div>
        ${!d.accepted?`<div class="expiry ${isExpiringSoon(d)?'soon':''}">⏳ ${expiryLabel(d)}</div>`:''}
        ${d.accepted?`<div class="meta mono">📞 ${escapeHtml(d.phone)}</div>`:''}
        ${d.reported&&d.acceptedBy===currentUser?`<div class="report-note">🚩 You reported this: "${escapeHtml(d.reportReason||'')}"</div>`:''}
        <div class="actions">
          <a class="btn-navigate" target="_blank" rel="noopener"
             href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(d.address)}">Navigate</a>
          ${d.accepted?`<button class="btn-secondary" style="margin-top:0;" onclick="unaccept(${d.id})">Unaccept</button>`:`<button class="btn-accept" onclick="accept(${d.id})">Accept</button>`}
        </div>
        ${d.accepted&&d.acceptedBy===currentUser&&!d.reported?`<button class="btn-report" onclick="reportDonation(${d.id})">🚩 Report as fake</button>`:''}
      </div>
    </article>`).join('')+'</div>';
}
async function reportDonation(id){
  const d=donations.find(x=>x.id===id);
  if(!d||d.acceptedBy!==currentUser||d.reported) return;

  const reason=prompt('What made this donation seem fake?');
  if(reason===null) return;
  if(!reason.trim()){toast('Please describe the issue.',true);return;}

  d.reported=true; d.reportReason=reason.trim();
  d.reportedBy=currentUser; d.reportedAt=new Date().toISOString();

  if(await saveDonations()){
    toast('Reported — admin can review it.');
    renderReceiverList(); renderHome();
  }
}
async function accept(id){
  const d=donations.find(x=>x.id===id);
  if(!d||d.accepted) return;
  d.accepted=true; d.acceptedBy=currentUser;
  if(await saveDonations()){
    toast('Marked as accepted.'); renderReceiverList(); renderHome();
  }
}
async function unaccept(id){
  const d=donations.find(x=>x.id===id);
  if(!d||d.acceptedBy!==currentUser){toast('Only the receiver who accepted this can undo it.',true);return;}
  d.accepted=false; d.acceptedBy=null;
  if(await saveDonations()){
    toast('Moved back to available.'); renderReceiverList(); renderHome();
  }
}
function togglePasswordMenu(force){
  const menu=document.getElementById('passwordMenu');
  if(!menu) return;
  const shouldShow = typeof force === 'boolean' ? force : !menu.classList.contains('show');
  menu.classList.toggle('show',shouldShow);
}

async function changeReceiverPassword(){
  if(!currentUser){
    toast('Please log in as a receiver first.',true);
    return;
  }

  const currentPassword=document.getElementById('currentReceiverPassword').value;
  const newPassword=document.getElementById('newReceiverPassword').value;
  const confirmPassword=document.getElementById('confirmReceiverPassword').value;

  if(!currentPassword||!newPassword||!confirmPassword){
    toast('Please fill all password fields.',true);
    return;
  }

  if(newPassword.length<4){
    toast('New password must be at least 4 characters.',true);
    return;
  }

  if(newPassword!==confirmPassword){
    toast('New passwords do not match.',true);
    return;
  }

  if(currentPassword===newPassword){
    toast('New password must be different from the current password.',true);
    return;
  }

  const btn=document.getElementById('changePasswordBtn');
  btn.disabled=true;
  btn.textContent='Updating…';

  try{
    const {data:receiver,error:findError}=await supabaseClient
      .from('receivers')
      .select('user_name,password')
      .eq('user_name',currentUser)
      .maybeSingle();

    if(findError) throw findError;

    if(!receiver){
      toast('Receiver account was not found.',true);
      return;
    }

    if(receiver.password!==currentPassword){
      toast('Current password is incorrect.',true);
      return;
    }

    const {error:updateError}=await supabaseClient
      .from('receivers')
      .update({password:newPassword})
      .eq('user_name',currentUser);

    if(updateError) throw updateError;

    document.getElementById('currentReceiverPassword').value='';
    document.getElementById('newReceiverPassword').value='';
    document.getElementById('confirmReceiverPassword').value='';
    toast('Password changed successfully.');
    togglePasswordMenu(false);
  }catch(err){
    console.error(err);
    toast('Could not change password: '+(err.message||err),true);
  }finally{
    btn.disabled=false;
    btn.textContent='Change password';
  }
}

/* ---------- ADMIN ---------- */
function renderAdmin(){
  document.getElementById('adminTotal').textContent=donations.length;
  document.getElementById('adminPending').textContent=donations.filter(d=>!d.accepted&&!d.reported&&!isExpired(d)).length;
  document.getElementById('adminAccepted').textContent=donations.filter(d=>d.accepted).length;
  document.getElementById('adminReceivers').textContent=receivers.length;
  document.getElementById('adminReported').textContent=donations.filter(d=>d.reported).length;
  renderReceiverAdminList(); renderReportedList(); renderReceiverMonitor();
}
function renderReceiverMonitor(){
  const box=document.getElementById('receiverMonitorList');
  if(!receivers.length){
    box.innerHTML='<div class="empty"><b>No receiver accounts</b>Add a receiver to start monitoring activity.</div>';
    return;
  }

  box.innerHTML=receivers.map(r=>{
    const mine=donations.filter(d=>d.acceptedBy===r.user);
    const accepted=mine.length;
    const reported=mine.filter(d=>d.reported).length;
    const active=mine.filter(d=>d.accepted&&!d.reported).length;
    const last=mine.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];
    return `<div class="receiver-row" style="display:block;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <strong>${escapeHtml(r.user)}</strong>
        <span class="mono">${escapeHtml(r.phone||'—')}</span>
      </div>
      <div class="stats-row" style="margin-top:12px;gap:12px;">
        <div class="stat-box"><b class="mono">${accepted}</b><span>Total taken</span></div>
        <div class="stat-box"><b class="mono">${active}</b><span>Currently accepted</span></div>
        <div class="stat-box"><b class="mono">${reported}</b><span>Reported</span></div>
        <div class="stat-box"><b class="mono">${last?escapeHtml(last.food):'—'}</b><span>Last donation</span></div>
      </div>
    </div>`;
  }).join('');
}

function renderReportedList(){
  const box=document.getElementById('reportedListAdmin');
  const reported=donations.filter(d=>d.reported)
    .sort((a,b)=>new Date(b.reportedAt||0)-new Date(a.reportedAt||0));

  if(!reported.length){
    box.innerHTML='<div class="empty"><b>No reports</b>Nothing has been flagged as fake yet.</div>';
    return;
  }

  box.innerHTML=reported.map(d=>`
    <div class="receiver-row" style="flex-direction:column;align-items:stretch;gap:8px;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <span><b>${escapeHtml(d.food)}</b> from ${escapeHtml(d.donorName||'Unknown donor')}</span>
        <span class="mono">${escapeHtml(d.phone||'')}</span>
      </div>
      <div class="addr">${escapeHtml(d.address)}</div>
      <div style="font-size:13px;color:#4A5C50;">"${escapeHtml(d.reportReason||'')}" — reported by ${escapeHtml(d.reportedBy||'unknown')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn-secondary" style="width:auto;padding:8px 14px;margin-top:0;" onclick="dismissReport(${d.id})">Dismiss report</button>
        <button class="btn-danger" style="width:auto;padding:8px 14px;" onclick="adminRemoveDonation(${d.id})">Remove listing</button>
      </div>
    </div>`).join('');
}
async function dismissReport(id){
  const d=donations.find(x=>x.id===id);
  if(!d) return;
  d.reported=false; d.reportReason=null; d.reportedBy=null; d.reportedAt=null;
  if(await saveDonations()){toast('Report dismissed.');renderAdmin();}
}
async function adminRemoveDonation(id){
  if(!confirm('Permanently remove this donation listing?')) return;
  const {error}=await supabaseClient.from('donations').delete().eq('id',id);
  if(error){toast('Could not remove listing: '+error.message,true);return;}
  donations=donations.filter(x=>x.id!==id);
  toast('Listing removed.'); renderAdmin(); renderHome();
}
function renderReceiverAdminList(){
  const box=document.getElementById('receiverListAdmin');
  if(!receivers.length){
    box.innerHTML='<div class="empty"><b>No receivers yet</b>Add one above to get started.</div>';
    return;
  }
  box.innerHTML=receivers.map((r,i)=>`
    <div class="receiver-row">
      <span>${escapeHtml(r.user)}
        <span class="mono" style="color:#6E7A6C;font-size:12px;">${r.phone?escapeHtml(r.phone):'— no phone on file —'}</span>
      </span>
      <button class="btn-danger" style="border-radius:8px;" onclick="removeReceiver(${i})">Remove</button>
    </div>`).join('');
}
async function addReceiver(){
  const u=document.getElementById('newUser').value.trim();
  const p=document.getElementById('newPass').value;
  const phone=document.getElementById('newReceiverPhone').value.trim();

  if(!u||!p||!validPhone(phone)){toast('Enter username, password and a valid mobile number.',true);return;}
  if(receivers.some(r=>r.user===u)){toast('That username already exists.',true);return;}

  const {data,error}=await supabaseClient.from('receivers')
    .insert({user_name:u,password:p,phone}).select('user_name,phone').single();

  if(error){toast('Could not add receiver: '+error.message,true);return;}

  receivers.push(mapReceiver(data));
  document.getElementById('newUser').value='';
  document.getElementById('newPass').value='';
  document.getElementById('newReceiverPhone').value='';
  toast('Receiver added.'); renderAdmin(); renderHome();
}
async function removeReceiver(i){
  const r=receivers[i];
  if(!r) return;
  if(!confirm(`Remove receiver "${r.user}"?`)) return;

  const {error}=await supabaseClient.from('receivers').delete().eq('user_name',r.user);
  if(error){toast('Could not remove receiver: '+error.message,true);return;}

  receivers.splice(i,1);
  toast('Receiver removed.'); renderAdmin(); renderHome();
}

document.addEventListener('click',e=>{
  const wrap=document.querySelector('.password-menu-wrap');
  const menu=document.getElementById('passwordMenu');
  if(menu&&wrap&&!wrap.contains(e.target)) menu.classList.remove('show');
});

/* ---------- INIT ---------- */
(async function init(){
  initSupabase();

  const categoryInput=document.getElementById('category');
  if(categoryInput){
    categoryInput.addEventListener('change',()=>{
      const isOther=categoryInput.value==='Other';
      document.getElementById('f-otherfood').style.display=isOther?'block':'none';
      if(!isOther){
        document.getElementById('otherFood').value='';
        setFieldError('f-otherfood',false);
      }
    });
  }

  const imageInput=document.getElementById('image');
  if(imageInput){
    imageInput.addEventListener('change',async e=>{
      const file=e.target.files[0];
      if(!file){
        selectedImageData=null;
        document.getElementById('imgPreview').style.backgroundImage='';
        document.getElementById('imgPreview').textContent='No photo selected';
        return;
      }
      try{
        selectedImageData=await compressImage(file);
        const preview=document.getElementById('imgPreview');
        preview.style.backgroundImage=`url("${selectedImageData}")`;
        preview.textContent='';
      }catch(err){
        selectedImageData=null;
        toast('Could not read that image.',true);
      }
    });
  }

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape') closeDonorModal();
  });

  await loadData();
  renderHome();
})();
