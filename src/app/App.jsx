
import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// ENV (Vercel) or fallback to in-app settings
const ENV_URL = import.meta.env.VITE_SUPABASE_URL || ''
const ENV_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const AREAS = [
  "Impressora Speed","Impressora Adast 715","Impressora Adast 725","Impressora GTO Capas",
  "Impressora Digital Versant - Capas","Impressora Digital Nuvera - Miolo","Laminação de Capas",
  "Dobradeira","Intercalação","Costura","Blocagem","Destaque Digital","Destaque Off-set",
  "Coladeira Baby 01","Coladeira Baby 02","Coladeira Eurobind","Trilateral","Revisão","Embalagem","Entregue"
]
const PRESS_AREAS = new Set(["Impressora Speed","Impressora Adast 715","Impressora Adast 725","Impressora GTO Capas"])
const FORMATS = ["11,7x17,5cm","13,9x21cm","15,7x23cm","Tamanho especial"]

const pad = (n)=> n<10?`0${n}`:`${n}`
const fmt = (iso)=>{ const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}` }
const daysLeft = (iso)=> Math.ceil((new Date(iso).getTime() - Date.now())/(1000*60*60*24))

function useSupabase() {
  const [url,setUrl] = useState(localStorage.getItem('supabase.url')||ENV_URL)
  const [key,setKey] = useState(localStorage.getItem('supabase.key')||ENV_KEY)
  const [client,setClient] = useState(null)
  useEffect(()=>{
    if(url && key){
      const c = createClient(url, key)
      setClient(c)
      localStorage.setItem('supabase.url', url)
      localStorage.setItem('supabase.key', key)
    }
  },[url,key])
  return {url,setUrl,key,setKey,client}
}

async function query(c, fn){
  try{ return await fn() }catch(e){ console.error(e); alert('Erro de conexão com banco'); throw e }
}

export default function App(){
  const supa = useSupabase()
  const [me,setMe] = useState(null)
  const [view,setView] = useState('login')
  const [notify,setNotify] = useState([])
  const [logo,setLogo] = useState('/logo.png')

  // Data
  const [productions,setProductions] = useState([])
  const [events,setEvents] = useState([])

  useEffect(()=>{
    if(supa.client){
      // load initial data
      (async()=>{
        const { data: prods } = await query(supa.client, ()=> supa.client.from('productions').select('*').order('deadline'))
        setProductions(prods||[])
        const { data: evs } = await query(supa.client, ()=> supa.client.from('events').select('*').order('at'))
        setEvents(evs||[])
      })()
    }
  },[supa.client])

  // ---- Auth (simplificada) ----
  async function signIn(username, password){
    if(!supa.client){ alert('Configure o Supabase em Configurações'); return }
    const { data, error } = await supa.client.from('app_users').select('*').eq('username', username).eq('password', password).maybeSingle()
    if(error || !data){ alert('Usuário/senha inválidos'); return }
    if(data.approved===false){ alert('Sua conta aguarda aprovação da Gerência'); return }
    setMe(data); setView('home')
  }
  async function registerOperator({name,username,password,area}){
    if(!supa.client){ alert('Configure o Supabase em Configurações'); return }
    const { error } = await supa.client.from('app_users').insert({ name, username, password, role:'operador', area: area||null, approved:false })
    if(error){ alert('Erro ao cadastrar'); return }
    await supa.client.from('events').insert({ type:'userRegister', details:{ name, username, area } })
    await supa.client.from('notifications').insert({ to_role:'gerencia', message:`Novo cadastro pendente: ${name} (${username})` })
    alert('Cadastro enviado para aprovação da Gerência.')
  }

  // ---- Manager actions ----
  async function addProduction(p){
    const { error } = await supa.client.from('productions').insert(p)
    if(error){ alert('Erro ao cadastrar produção'); return }
    const { data: prods } = await supa.client.from('productions').select('*').order('deadline')
    setProductions(prods||[])
    await supa.client.from('book_catalog').upsert({ isbn:p.isbn, title:p.title })
    await supa.client.from('events').insert({ type:'createProduction', details:p })
  }
  async function reorder(idx, dir){
    // simple front-only reordering (no ordering column yet) – visual only
    setProductions((arr)=>{
      const a = arr.slice(); const j = idx+dir; if(j<0||j>=a.length) return a; const [it]=a.splice(idx,1); a.splice(j,0,it); return a
    })
  }
  async function approveUser(user, approve){
    if(approve){
      await supa.client.from('app_users').update({approved:true}).eq('id',user.id)
      await supa.client.from('events').insert({ type:'userApprove', details:{userId:user.id, username:user.username} })
    }else{
      await supa.client.from('app_users').delete().eq('id',user.id)
      await supa.client.from('events').insert({ type:'userReject', details:{userId:user.id, username:user.username} })
    }
  }

  // ---- Operator actions ----
  async function startPrep(p){
    if(['finalizado','entregue'].includes(p.status)) return
    await supa.client.from('productions').update({ status:'em preparação', prep_started_at:new Date().toISOString(), current_area: me?.area || p.current_area }).eq('id',p.id)
    await supa.client.from('events').insert({ type:'startPrep', production_id:p.id, details:{ area:me?.area } })
    refreshProds()
  }
  async function startProd(p){
    if(['finalizado','entregue'].includes(p.status)) return
    const patch = { status:'em produção' }
    if(!p.prod_started_at) patch.prod_started_at = new Date().toISOString()
    if(p.paused_at){ patch.total_paused_ms = (p.total_paused_ms||0) + (Date.now() - new Date(p.paused_at).getTime()); patch.paused_at = null }
    await supa.client.from('productions').update(patch).eq('id',p.id)
    await supa.client.from('events').insert({ type:'startArea', production_id:p.id, details:{ area:p.current_area || me?.area }})
    refreshProds()
  }
  async function togglePause(p){
    if(p.paused_at){
      const patch = { paused_at:null, total_paused_ms:(p.total_paused_ms||0) + (Date.now() - new Date(p.paused_at).getTime()), status:'em produção' }
      await supa.client.from('productions').update(patch).eq('id',p.id)
      await supa.client.from('events').insert({ type:'resume', production_id:p.id, details:{ area:p.current_area }})
    }else{
      await supa.client.from('productions').update({ paused_at:new Date().toISOString(), status:'pausado' }).eq('id',p.id)
      await supa.client.from('events').insert({ type:'pause', production_id:p.id, details:{ area:p.current_area }})
    }
    refreshProds()
  }
  async function finishProd(p, discardQty, finalQty){
    await supa.client.from('productions').update({ status:'finalizado', done_at:new Date().toISOString(), discard_qty:Number(discardQty||0), final_qty:Number(finalQty||0) }).eq('id',p.id)
    await supa.client.from('events').insert({ type:'finishArea', production_id:p.id, details:{ area:p.current_area, discard:Number(discardQty||0), finalQty:Number(finalQty||0) } })
    refreshProds()
  }
  async function signalProblem(p, desc){
    await supa.client.from('events').insert({ type:'problem', production_id:p.id, details:{ area:p.current_area||me?.area, desc } })
    await supa.client.from('notifications').insert({ to_role:'gerencia', message:`Problema: ${p.title} – ${desc}` })
    alert('Problema sinalizado à Gerência.')
  }
  async function sendToNextArea(p, nextArea){
    await supa.client.from('productions').update({ current_area:nextArea, status:'na fila', paused_at:null }).eq('id',p.id)
    await supa.client.from('events').insert({ type:'handoff', production_id:p.id, details:{ from:me?.area || p.current_area, to:nextArea } })
    await supa.client.from('notifications').insert({ to_area:nextArea, message:`Novo trabalho (${p.title}) para ${nextArea}` })
    refreshProds()
  }

  async function refreshProds(){
    const { data: prods } = await supa.client.from('productions').select('*').order('deadline')
    setProductions(prods||[])
  }

  // ---- Views ----
  if(view==='login') return <Login onSignIn={signIn} onRegister={registerOperator} supa={supa} />

  return (
    <div>
      <Topbar me={me} setView={setView} supa={supa} />
      {me?.role==='gerencia' && <Manager me={me} productions={productions} addProduction={addProduction} reorder={reorder} supa={supa} />}
      {me?.role==='operador' && <Operator me={me} productions={productions} startPrep={startPrep} startProd={startProd} togglePause={togglePause} finishProd={finishProd} sendToNextArea={sendToNextArea} signalProblem={signalProblem} />}
      {me?.role==='consultor' && <Consultant productions={productions} />}
    </div>
  )
}

function Topbar({ me, setView, supa }){
  const [notifs,setNotifs] = useState([])
  useEffect(()=>{
    if(!supa.client) return
    ;(async()=>{
      const filters = me?.role==='gerencia' ? { to_role:'gerencia' } : (me?.area ? { to_area: me.area } : null)
      if(!filters) return
      let q = supa.client.from('notifications').select('*').order('created_at',{ascending:false})
      if(filters.to_role) q = q.eq('to_role', filters.to_role)
      if(filters.to_area) q = q.eq('to_area', filters.to_area)
      const { data } = await q
      setNotifs(data||[])
    })()
  },[supa.client, me])

  return (
    <div className="card between p16" style={{position:'sticky',top:0,background:'#fff',zIndex:10}}>
      <div className="row">
        <img src="/logo.png" alt="logo" className="logo"/>
        <div><b>CEDET – Gestão de Produção</b><div className="small muted">{me? `${me.name}` : 'Login'}</div></div>
      </div>
      <div className="row">
        <button className="btn secondary" onClick={()=>setView('login')}>Sair</button>
      </div>
      {notifs?.length>0 && <div className="badge">{notifs.length} notificações</div>}
      <Settings supa={supa} />
    </div>
  )
}

function Settings({ supa }){
  const [open,setOpen] = useState(false)
  const [url,setUrl] = useState(supa.url)
  const [key,setKey] = useState(supa.key)
  return (
    <div>
      <button className="btn secondary" onClick={()=>setOpen(!open)}>Configurações</button>
      {open && (
        <div className="card p16" style={{position:'absolute',right:16,top:64,width:360}}>
          <div className="mb12"><b>Conexão Supabase (beta)</b></div>
          <div className="small muted mb12">Cole os valores de <i>Project Settings → API</i>.</div>
          <input className="inp mb12" placeholder="SUPABASE URL" value={url} onChange={e=>setUrl(e.target.value)} />
          <input className="inp mb12" placeholder="SUPABASE ANON KEY" value={key} onChange={e=>setKey(e.target.value)} />
          <div className="row">
            <button className="btn" onClick={()=>{ supa.setUrl(url); supa.setKey(key); alert('Conexão atualizada'); }}>Salvar</button>
            <button className="btn secondary" onClick={()=>setOpen(false)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Login({ onSignIn, onRegister, supa }){
  const [u,setU] = useState('')
  const [p,setP] = useState('')
  const [openReg,setOpenReg] = useState(false)
  const [rName,setRName] = useState('')
  const [rUser,setRUser] = useState('')
  const [rPass,setRPass] = useState('')
  const [rArea,setRArea] = useState('')

  return (
    <div className="container" style={{minHeight:'100vh',display:'grid',placeItems:'center'}}>
      <div className="card p24" style={{width:420}}>
        <div className="row mb16">
          <img src="/logo.png" className="logo" alt="logo"/>
          <div>
            <div><b>CEDET – Gestão de Produção</b></div>
            <div className="small muted">Acesse ou faça seu cadastro</div>
          </div>
        </div>
        <input className="inp mb12" placeholder="Usuário (e.g., master@cedet.com)" value={u} onChange={e=>setU(e.target.value)} />
        <input className="inp mb12" placeholder="Senha" type="password" value={p} onChange={e=>setP(e.target.value)} />
        <button className="btn mb12" onClick={()=>onSignIn(u,p)}>Entrar</button>
        <div className="between mb12">
          <div className="small">Não tem conta?</div>
          <button className="btn secondary" onClick={()=>setOpenReg(true)}>Novo cadastro</button>
        </div>
        <div className="small muted">Dica: master@cedet.com / Master123 • gerente@cedet.com / Gerente123</div>

        {openReg && (
          <div className="card p16 mb12" style={{marginTop:12}}>
            <div className="mb12"><b>Novo cadastro (Operador)</b></div>
            <input className="inp mb12" placeholder="Nome" value={rName} onChange={e=>setRName(e.target.value)} />
            <input className="inp mb12" placeholder="Usuário (email ou apelido)" value={rUser} onChange={e=>setRUser(e.target.value)} />
            <input className="inp mb12" placeholder="Senha" type="password" value={rPass} onChange={e=>setRPass(e.target.value)} />
            <select className="inp mb12" value={rArea} onChange={e=>setRArea(e.target.value)}>
              <option value="">Área (opcional)</option>
              {AREAS.map(a=> <option key={a} value={a}>{a}</option>)}
            </select>
            <div className="row">
              <button className="btn" onClick={()=>onRegister({name:rName,username:rUser,password:rPass,area:rArea})}>Enviar para aprovação</button>
              <button className="btn secondary" onClick={()=>setOpenReg(false)}>Cancelar</button>
            </div>
            <div className="small muted" style={{marginTop:8}}>A Gerência será notificada para aprovar/recusar seu acesso.</div>
          </div>
        )}
      </div>
    </div>
  )
}

function Manager({ me, productions, addProduction, reorder, supa }){
  const [isbn,setIsbn] = useState('')
  const [title,setTitle] = useState('')
  const [qty,setQty] = useState(0)
  const [pages,setPages] = useState(0)
  const [format,setFormat] = useState(FORMATS[1])
  const [osNumber,setOs] = useState('')
  const [deadline,setDeadline] = useState(new Date(Date.now()+7*86400000).toISOString().slice(0,10))

  const [pending,setPending] = useState([])
  useEffect(()=>{ (async()=>{
    if(!supa.client) return
    const { data } = await supa.client.from('app_users').select('*').eq('approved', false)
    setPending(data||[])
  })() },[supa.client])

  return (
    <div className="container">
      <div className="grid2 mb16">
        <div className="card p16">
          <div className="mb12"><b>Cadastrar nova produção</b></div>
          <div className="grid2">
            <input className="inp" placeholder="ISBN" value={isbn} onChange={e=>setIsbn(e.target.value)} />
            <input className="inp" placeholder="Título" value={title} onChange={e=>setTitle(e.target.value)} />
            <input className="inp" type="number" placeholder="Quantidade" value={qty} onChange={e=>setQty(Number(e.target.value))} />
            <input className="inp" type="number" placeholder="Páginas" value={pages} onChange={e=>setPages(Number(e.target.value))} />
            <select className="inp" value={format} onChange={e=>setFormat(e.target.value)}>
              {FORMATS.map(f=> <option key={f} value={f}>{f}</option>)}
            </select>
            <input className="inp" placeholder="Nº OS" value={osNumber} onChange={e=>setOs(e.target.value)} />
            <input className="inp" type="date" value={deadline} onChange={e=>setDeadline(e.target.value)} />
          </div>
          <div className="row" style={{marginTop:12}}>
            <button className="btn" onClick={()=>{
              if(!isbn || !title || !qty || !pages || !osNumber || !deadline){ alert('Preencha todos os campos'); return }
              addProduction({ isbn, title, qty, pages, format, os_number: osNumber, deadline: new Date(deadline).toISOString() })
              setIsbn(''); setTitle(''); setQty(0); setPages(0); setOs('')
            }}>Cadastrar</button>
          </div>
        </div>

        <div className="card p16">
          <div className="between mb12"><b>Fila de produção</b>
            <div className="small muted">Ordene com Subir/Descer (visual)</div>
          </div>
          <div className="list">
            {productions.map((p,idx)=> <ProdRow key={p.id} p={p} idx={idx} reorder={reorder} />)}
            {productions.length===0 && <div className="small muted">Nenhum trabalho cadastrado.</div>}
          </div>
        </div>
      </div>

      <div className="card p16 mb16">
        <div className="mb12"><b>Solicitações de cadastro (pendentes)</b></div>
        {pending.length===0 && <div className="small muted">Nenhuma pendência.</div>}
        {pending.map(u=> (
          <div key={u.id} className="between mb12">
            <div><b>{u.name}</b> <span className="muted small">({u.username})</span> • <span className="small">Área: {u.area||'—'}</span></div>
            <div className="row">
              <button className="btn" onClick={()=>approveUser(u,true)}>Aprovar</button>
              <button className="btn danger" onClick={()=>approveUser(u,false)}>Recusar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProdRow({ p, idx, reorder }){
  const dleft = p.deadline? daysLeft(p.deadline):null
  const pill = dleft==null? null : dleft<=0 ? <span className="pill danger">⚠️ Prazo expirado</span> : dleft===1? <span className="pill warn">Vence amanhã</span> : <span className="pill ok">Faltam {dleft} dias</span>
  return (
    <div className="between card p16 mb12">
      <div>
        <div><b>{p.title}</b> <span className="small muted">ISBN {p.isbn}</span></div>
        <div className="small muted">OS {p.os_number} • {p.qty} un. • {p.pages} págs • Formato {p.format} • Status: {p.status} {pill}</div>
        <div className="small">Área atual: <b>{p.current_area||'—'}</b></div>
      </div>
      <div className="row">
        <button className="btn secondary" onClick={()=>reorder(idx,-1)}>Subir</button>
        <button className="btn secondary" onClick={()=>reorder(idx, 1)}>Descer</button>
      </div>
    </div>
  )
}

function Operator({ me, productions, startPrep, startProd, togglePause, finishProd, sendToNextArea, signalProblem }){
  const [search,setSearch] = useState('')
  const [finishFor,setFinishFor] = useState(null)
  const [discard,setDiscard] = useState(0)
  const [finalQty,setFinalQty] = useState(0)

  const visible = useMemo(()=> productions.filter(p=> !search || p.isbn===search || p.id===search ), [productions,search])

  return (
    <div className="container">
      <div className="card p16 mb16">
        <div className="between mb12">
          <b>Fila de produção</b>
          <div className="small muted">Busque por ISBN/código</div>
        </div>
        <div className="row mb12">
          <input className="inp" placeholder="ISBN" value={search} onChange={e=>setSearch(e.target.value)} />
          <button className="btn secondary" onClick={()=>setSearch('')}>Limpar</button>
        </div>
        <div className="list">
          {visible.map(p=> <OpRow key={p.id} p={p} me={me} startPrep={startPrep} startProd={startProd} togglePause={togglePause} openFinish={()=>setFinishFor(p)} sendToNextArea={sendToNextArea} signalProblem={signalProblem} />)}
          {visible.length===0 && <div className="small muted">Sem itens na fila.</div>}
        </div>
      </div>

      {finishFor && (
        <div className="card p16">
          <div className="mb12"><b>Finalizar produção</b> – {finishFor.title}</div>
          <div className="roww mb12">
            <input className="inp" type="number" placeholder="Descarte" value={discard} onChange={e=>setDiscard(e.target.value)} />
            <input className="inp" type="number" placeholder="Quantidade final" value={finalQty} onChange={e=>setFinalQty(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn" onClick={()=>{ finishProd(finishFor, discard, finalQty); setFinishFor(null); setDiscard(0); setFinalQty(0) }}>Confirmar</button>
            <button className="btn secondary" onClick={()=>setFinishFor(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function OpRow({ p, me, startPrep, startProd, togglePause, openFinish, sendToNextArea, signalProblem }){
  const isPress = me?.area && ["Impressora Speed","Impressora Adast 715","Impressora Adast 725","Impressora GTO Capas"].includes(me.area)
  return (
    <div className="card p16 mb12">
      <div className="between">
        <div>
          <div><b>{p.title}</b> <span className="small muted">ISBN {p.isbn}</span></div>
          <div className="small muted">OS {p.os_number} • {p.qty} un. • {p.pages} págs • Área atual: <b>{p.current_area||'—'}</b></div>
        </div>
        <div className="row">
          {isPress && <span className="badge">Impressora</span>}
          <button className="btn secondary" onClick={()=>{ const d=prompt('Descreva o problema:'); if(d) signalProblem(p,d) }}>Problema</button>
        </div>
      </div>
      <div className="roww" style={{marginTop:8}}>
        <button className="btn" onClick={()=>startPrep(p)}>Preparação</button>
        <button className="btn" onClick={()=>startProd(p)}>Iniciar</button>
        <button className="btn secondary" onClick={()=>togglePause(p)}>{p.paused_at? 'Retomar':'Pausar'}</button>
        <button className="btn" onClick={openFinish}>Finalizar</button>
      </div>
      <div className="roww" style={{marginTop:12}}>
        {AREAS.filter(a=>a!==p.current_area).map(a=> <span key={a} className="area-chip" onClick={()=>sendToNextArea(p,a)}>{a}</span>)}
      </div>
    </div>
  )
}

function Consultant({ productions }){
  return (
    <div className="container">
      <div className="card p16">
        <div className="mb12"><b>Status dos livros</b></div>
        {productions.map(p=> (
          <div key={p.id} className="between mb12">
            <div>
              <div><b>{p.title}</b> <span className="small muted">ISBN {p.isbn}</span></div>
              <div className="small muted">Status: {p.status} • Área: {p.current_area||'—'}</div>
            </div>
            <div className="small muted">Prazo: {p.deadline? fmt(p.deadline):'—'}</div>
          </div>
        ))}
        {productions.length===0 && <div className="small muted">Sem itens.</div>}
      </div>
    </div>
  )
}
