const $ = id => document.getElementById(id);
const settings = window.RIFAS_CONFIG || {};
const configured = Boolean(settings.supabaseUrl && settings.supabaseKey && !settings.supabaseUrl.includes('TU-PROYECTO') && !settings.supabaseKey.includes('TU_CLAVE'));
const db = configured ? window.supabase.createClient(settings.supabaseUrl, settings.supabaseKey) : null;
const money = n => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(n||0));
const dateLabel = s => s ? new Date(s).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'}) : 'Sin fecha';
function notify(message,kind=''){const e=$('alert');e.textContent=message;e.className='notice '+kind;e.scrollIntoView({behavior:'smooth',block:'nearest'});}
function clearNotice(){$('alert').className='notice hidden';}
function errorMessage(e){return e?.message || 'Ocurrió un error inesperado.';}
async function call(name,params={}){if(!db)throw Error('Configura config.js con los datos de Supabase.');const {data,error}=await db.rpc(name,params);if(error)throw error;return data;}
function make(tag,text,className){let node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);if(className)node.className=className;return node;}
