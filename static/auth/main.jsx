import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API_BASE = import.meta.env.VITE_AUTH_API_BASE || 'http://localhost:3001';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const nativeFetch = window.fetch.bind(window);
const ASSESSMENT_KEY = 'chessforge_age_assessment';

function readCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const entry = document.cookie.split('; ').find((value) => value.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : '';
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase())) headers.set('x-csrf-token', readCookie('chessforge_csrf'));
  const response = await nativeFetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || 'Request failed'), { code: body.code, status: response.status });
  return body;
}

window.fetch = (input, options = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!url.startsWith(`${API_BASE}/api/`)) return nativeFetch(input, options);
  const headers = new Headers(options.headers || (typeof input === 'string' ? undefined : input.headers));
  const method = (options.method || (typeof input === 'string' ? 'GET' : input.method) || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('x-csrf-token', readCookie('chessforge_csrf'));
  return nativeFetch(input, { ...options, headers, credentials: 'include' });
};

function publishSession(user) {
  window.chessForgeAuth = { user, request };
  window.dispatchEvent(new CustomEvent('chessforge:auth-changed', { detail: { user } }));
}
function publishPrivacy(profile) { window.chessForgePrivacy=profile; window.dispatchEvent(new CustomEvent('chessforge:privacy-changed',{detail:profile})); }

function Dialog({ title, children }) {
  useEffect(()=>{const app=document.querySelector('.app-container');const legal=document.querySelector('.privacy-notice-link');if(app)app.inert=true;if(legal)legal.inert=true;return()=>{if(app)app.inert=false;if(legal)legal.inert=false;};},[]);
  return <div className="privacy-overlay" role="presentation"><section className="privacy-dialog" role="dialog" aria-modal="true" aria-labelledby="privacy-title"><div className="privacy-brand">ChessForge</div><h1 id="privacy-title">{title}</h1>{children}</section></div>;
}

function AgeGate({ onComplete }) {
  const [form, setForm] = useState({ dateOfBirth: '', countryCode: '', regionCode: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { const assessment = await request('/privacy/age-assessments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) }); sessionStorage.setItem(ASSESSMENT_KEY, JSON.stringify(assessment)); onComplete(assessment); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <Dialog title="Before you continue">
    <p>We use your age and country to provide the right privacy protections. Your exact birth date is never shown publicly.</p>
    <form onSubmit={submit} className="privacy-form">
      <label>Date of birth<input required type="date" max={new Date().toISOString().slice(0, 10)} value={form.dateOfBirth} onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} /></label>
      <label>Country<select required value={form.countryCode} onChange={e => setForm({ ...form, countryCode: e.target.value })}><option value="">Choose country</option><option value="MY">Malaysia</option><option value="US">United States</option><option value="GB">United Kingdom</option><option value="DE">Germany</option><option value="FR">France</option><option value="IE">Ireland</option><option value="ES">Spain</option><option value="IT">Italy</option><option value="NL">Netherlands</option><option value="PT">Portugal</option><option value="SE">Sweden</option><option value="XX">Other / not listed</option></select></label>
      {form.countryCode === 'US' && <label>State or territory<select required value={form.regionCode} onChange={e => setForm({ ...form, regionCode: e.target.value })}><option value="">Choose state</option><option value="CA">California</option><option value="OTHER">Other</option></select></label>}
      <p className="privacy-small">For an unlisted country, ChessForge applies the stricter minor-protection path. Read the <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Notice</a>.</p>
      {error && <p className="privacy-error" role="alert">{error}</p>}<button className="privacy-primary" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
    </form>
  </Dialog>;
}

function GuardianRequest({ assessment, onReset }) {
  const [email, setEmail] = useState(''); const [relationship, setRelationship] = useState('parent'); const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError(''); try {
    const result = await request('/privacy/guardian/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assessmentToken: assessment.assessmentToken, guardianEmail: email, relationship }) });
    setSent(true); setDevToken(result.developmentDecisionToken || '');
  } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <Dialog title={sent ? 'Waiting for your guardian' : 'Guardian approval required'}>
    {!sent ? <><p>ChessForge requires a parent or legal guardian to approve every account belonging to someone under 18. Until approval, Google Sign-In, game imports, analytics, and cloud features remain off.</p>
      {assessment.requiredPath === 'coppa_vpc' && <div className="privacy-warning"><strong>Under-13 protection:</strong> verifiable parental consent is required before ChessForge creates the account or collects Google profile data.</div>}
      <form onSubmit={submit} className="privacy-form"><label>Parent or guardian email<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label><label>Relationship<select value={relationship} onChange={e => setRelationship(e.target.value)}><option value="parent">Parent</option><option value="legal_guardian">Legal guardian</option></select></label>
      {error && <p className="privacy-error" role="alert">{error}</p>}<button className="privacy-primary" disabled={busy}>{busy ? 'Sending…' : 'Send approval request'}</button></form></>
      : <><p>We sent a time-limited approval link. Return to this device after your guardian finishes, then continue to Google Sign-In.</p>{devToken && <p className="privacy-dev">Development only: <a href={`/?guardianConsent=${encodeURIComponent(devToken)}`}>open the guardian approval screen</a>.</p>}<button className="privacy-primary" onClick={() => onReset(assessment)}>My guardian approved</button></>}
    <button className="privacy-link-button" onClick={onReset}>Start over</button>
  </Dialog>;
}

function GuardianDecision({ token, onDone }) {
  const [record, setRecord] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState({ chesscom_link: false, optional_analytics: false, cloud_ai: false });
  useEffect(() => { request(`/privacy/guardian/requests/${encodeURIComponent(token)}`).then(setRecord).catch(e => setError(e.message)); }, [token]);
  const decide = async (decision) => { setBusy(true); setError(''); try { await request('/privacy/guardian/decisions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decisionToken: token, decision, relationship: record.relationship, verificationMethod: 'development_attestation', optionalGrants: choices }) }); onDone(decision); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <Dialog title="Parent or guardian approval">{!record && !error ? <p>Loading secure request…</p> : record && <>
    <p>You are being asked to approve a ChessForge account for a user in the <strong>{record.ageBand.replace('_', '–')}</strong> age group. ChessForge will store account details, chess games, puzzles and training progress.</p>
    {record.requiresGuardianVerification && <div className="privacy-warning"><strong>{record.requiresVPC?'Verifiable parental consent':'Guardian identity verification'}:</strong> {record.verificationCompleted?' Verification is complete. You may review the choices and approve.':record.verificationUrl?<a href={record.verificationUrl}> Verify with the approved provider</a>:' The production verification provider has not been configured. A development-only attestation may be available locally.'}</div>}
    <fieldset><legend>Optional features (off by default)</legend>{Object.entries({ chesscom_link: 'Allow Chess.com account linking and game import', optional_analytics: 'Allow optional product analytics', cloud_ai: 'Allow future cloud AI processing after a separate feature notice' }).map(([key,label]) => <label className="privacy-check" key={key}><input type="checkbox" checked={choices[key]} onChange={e => setChoices({...choices,[key]:e.target.checked})}/>{label}</label>)}</fieldset>
    <p className="privacy-small">By approving, you confirm that you are the child’s parent or legal guardian and have read the <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Notice</a>. You may withdraw approval and request deletion.</p>
    <div className="privacy-actions"><button disabled={busy} className="privacy-secondary" onClick={() => decide('deny')}>Deny</button><button disabled={busy} className="privacy-primary" onClick={() => decide('approve')}>Verify and approve</button></div></>}
    {error && <p className="privacy-error" role="alert">{error}</p>}</Dialog>;
}

function GoogleSignIn({ assessment, onUser, onReset }) {
  const ref = useRef(null); const [error, setError] = useState('');
  const accept = useCallback(async ({ credential }) => { try { const result = await request('/auth/google', { method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ credential, assessmentToken: assessment.assessmentToken }) }); sessionStorage.removeItem(ASSESSMENT_KEY); onUser(result.user); } catch(e){ setError(e.message); } }, [assessment, onUser]);
  useEffect(() => { if (!GOOGLE_CLIENT_ID) return; const init=()=>{ window.google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:accept}); window.google.accounts.id.renderButton(ref.current,{theme:'outline',size:'large',shape:'pill'}); }; if(window.google?.accounts?.id)init(); else { const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;s.onload=init;s.onerror=()=>setError('Google Sign-In could not be loaded');document.head.appendChild(s);return()=>s.remove(); } },[accept]);
  return <Dialog title="Sign in to ChessForge"><p>Your privacy path is ready. Google will share only the profile fields shown in its sign-in prompt. ChessForge never receives your Google password.</p>{GOOGLE_CLIENT_ID?<div ref={ref}/>:<p className="privacy-error">Google Sign-In is not configured.</p>}{error&&<p className="privacy-error" role="alert">{error}</p>}<button className="privacy-link-button" onClick={onReset}>Change age or country</button></Dialog>;
}

function PrivacyCenter({ user, onClose, onDeleted }) {
  const [profile,setProfile]=useState(null); const [error,setError]=useState('');
  useEffect(()=>{request('/privacy/me').then(setProfile).catch(e=>setError(e.message));},[]);
  const update=async(key,value)=>{try{const next=await request('/privacy/me/preferences',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({[key]:value})});setProfile(next);publishPrivacy(next);}catch(e){setError(e.message);}};
  const rightsRequest=async(requestType)=>{try{const result=await request('/privacy/me/requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestType})});setError(`Request ${result.id} was received and is due by ${new Date(result.due_at).toLocaleDateString()}.`);}catch(e){setError(e.message);}};
  const exportData=async()=>{const response=await nativeFetch(`${API_BASE}/privacy/me/export`,{method:'POST',headers:{'x-csrf-token':readCookie('chessforge_csrf')},credentials:'include'});if(!response.ok){setError('Export failed');return;}const blob=await response.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`chessforge-export-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);};
  const deleteAccount=async()=>{if(!window.confirm('Permanently delete your ChessForge account, games, and training data? This cannot be undone.'))return;try{await request('/privacy/me',{method:'DELETE'});onDeleted();}catch(e){setError(e.message);}};
  return <Dialog title="Privacy center"><p>Signed in as {user.email}. Manage optional processing or exercise your privacy rights.</p>{profile&&<><dl className="privacy-facts"><dt>Account protection</dt><dd>{profile.privacy_state}</dd><dt>Age group</dt><dd>{profile.age_band}</dd><dt>Country</dt><dd>{profile.country_code}</dd></dl><fieldset><legend>Optional processing</legend>{Object.entries({optional_analytics:'Optional product analytics',cloud_ai:'Cloud AI features',chesscom_link:'Chess.com linking',marketing:'Marketing messages',public_profile:'Public profile'}).map(([key,label])=><label className="privacy-check" key={key}><input type="checkbox" checked={profile.grants[key]===true} disabled={profile.privacy_state==='minor_active'&&['marketing','public_profile'].includes(key)} onChange={e=>update(key,e.target.checked)}/>{label}</label>)}</fieldset></>}{error&&<p className="privacy-error">{error}</p>}<div className="privacy-actions privacy-stack"><button className="privacy-secondary" onClick={exportData}>Download my data</button><button className="privacy-secondary" onClick={()=>rightsRequest('correct')}>Request correction</button><button className="privacy-secondary" onClick={()=>rightsRequest('restrict')}>Request restriction</button><button className="privacy-danger" onClick={deleteAccount}>Delete my account</button><button className="privacy-primary" onClick={onClose}>Done</button></div></Dialog>;
}

function GuardianManagement({token}){const[profile,setProfile]=useState(null);const[message,setMessage]=useState('');useEffect(()=>{request(`/privacy/guardian/manage/${encodeURIComponent(token)}`).then(setProfile).catch(e=>setMessage(e.message));},[token]);const revoke=async()=>{if(!window.confirm('Withdraw guardian approval and immediately restrict this ChessForge account?'))return;try{const result=await request(`/privacy/guardian/manage/${encodeURIComponent(token)}`,{method:'DELETE'});setMessage(result.accountRestricted?'Approval withdrawn and the account was restricted.':'Approval withdrawn before account creation.');setProfile(null);}catch(e){setMessage(e.message);}};const exportChild=async()=>{const response=await nativeFetch(`${API_BASE}/privacy/guardian/manage/${encodeURIComponent(token)}/export`,{method:'POST'});if(!response.ok){setMessage('The child export could not be prepared.');return;}const blob=await response.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='chessforge-child-export.json';a.click();URL.revokeObjectURL(a.href);};const deleteChild=async()=>{if(!window.confirm('Permanently delete the child’s ChessForge account and chess data?'))return;try{const result=await request(`/privacy/guardian/manage/${encodeURIComponent(token)}/child`,{method:'DELETE'});setMessage(`Deletion request ${result.requestId} is ${result.status}.`);setProfile(null);}catch(e){setMessage(e.message);}};return <Dialog title="Guardian privacy controls">{profile&&<><p>This approval covers a ChessForge user in the <strong>{profile.age_band.replace('_','–')}</strong> age group. Current status: <strong>{profile.status}</strong>.</p><div className="privacy-actions privacy-stack">{profile.child_user_id&&<button className="privacy-secondary" onClick={exportChild}>Download child data</button>}<button className="privacy-danger" onClick={revoke}>Withdraw approval</button>{profile.child_user_id&&<button className="privacy-danger" onClick={deleteChild}>Delete child account</button>}</div></>}{message&&<p>{message}</p>}<p className="privacy-small">For correction or other privacy requests, use the privacy contact listed in the Privacy Notice.</p></Dialog>}

function App() {
  const queryToken=new URLSearchParams(location.search).get('guardianConsent');
  const managementToken=new URLSearchParams(location.search).get('guardianManage');
  const [ready,setReady]=useState(false); const [user,setUser]=useState(null); const [assessment,setAssessment]=useState(()=>{try{return JSON.parse(sessionStorage.getItem(ASSESSMENT_KEY));}catch{return null;}}); const [privacyOpen,setPrivacyOpen]=useState(false); const [guardianDone,setGuardianDone]=useState('');
  useEffect(()=>{request('/auth/me').then(async({user:u})=>{setUser(u);publishSession(u);publishPrivacy(await request('/privacy/me'));}).catch(()=>{publishSession(null);publishPrivacy(null);}).finally(()=>setReady(true));},[]);
  const setAuthenticated=useCallback(u=>{setUser(u);publishSession(u);if(u)request('/privacy/me').then(publishPrivacy).catch(()=>publishPrivacy(null));else publishPrivacy(null);},[]);
  const signOut=async()=>{await request('/auth/logout',{method:'POST'});window.google?.accounts?.id?.disableAutoSelect();setAuthenticated(null);setAssessment(null);};
  if(queryToken&&!guardianDone)return <GuardianDecision token={queryToken} onDone={setGuardianDone}/>;
  if(managementToken)return <GuardianManagement token={managementToken}/>;
  if(queryToken&&guardianDone)return <Dialog title={guardianDone==='approve'?'Approval recorded':'Request denied'}><p>{guardianDone==='approve'?'The child may return to their original device and continue to Google Sign-In.':'No ChessForge account will be created from this request.'}</p></Dialog>;
  if(!ready)return <div className="auth-status">Restoring session…</div>;
  if(user)return <><aside className="google-auth-panel"><div className="auth-user">{user.picture&&<img src={user.picture} alt="" referrerPolicy="no-referrer"/>}<span>{user.name||user.email}</span><button type="button" onClick={()=>setPrivacyOpen(true)}>Privacy</button><button type="button" onClick={signOut}>Sign out</button></div></aside>{privacyOpen&&<PrivacyCenter user={user} onClose={()=>setPrivacyOpen(false)} onDeleted={()=>{setPrivacyOpen(false);setAuthenticated(null);setAssessment(null);}}/>}</>;
  if(!assessment)return <AgeGate onComplete={setAssessment}/>;
  if(assessment.requiredPath!=='adult'&&!assessment.guardianReady)return <GuardianRequest assessment={assessment} onReset={(approved)=>{if(approved?.assessmentToken){const next={...approved,guardianReady:true};sessionStorage.setItem(ASSESSMENT_KEY,JSON.stringify(next));setAssessment(next);}else{sessionStorage.removeItem(ASSESSMENT_KEY);setAssessment(null);}}}/>;
  return <GoogleSignIn assessment={assessment} onUser={setAuthenticated} onReset={()=>{sessionStorage.removeItem(ASSESSMENT_KEY);setAssessment(null);}}/>;
}

createRoot(document.getElementById('google-auth-root')).render(<App />);
