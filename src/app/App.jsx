import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// Lê as variáveis da Vercel ou do painel de Configurações in-app
const ENV_URL = import.meta.env.VITE_SUPABASE_URL || ''
const ENV_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const AREAS = [
  "Impressora Speed","Impressora Adast 715","Impressora Adast 725","Impressora GTO Capas",
  "Impressora Digital Versant - Capas","Impressora Digital Nuvera - Miolo","Laminação de Capas",
  "Dobradeira","Intercalação","Costura","Blocagem","Destaque Digital","Destaque Off-set",
  "Coladeira Baby 01","Coladeira Baby 02","Coladeira Eurobind","Trilateral","Revisão","Embalagem","Entregue"
]
const FORMATS = ["11,7x17,5cm","13,9x21cm","15,7x23cm","Tamanho especial"]

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

const daysLeft = (iso)=> Math.ceil((new Date(iso).getTime() - Date.now())/(1000*60*60*24))

export default function App(){
  const supa = useSupabase()
  const [me,setMe] = useState(null)
  const [productions,setProductions] = useState([])

  useEffect(()=>{ if(supa.client){ refreshProds() } },[supa.client])

  async function refreshProds(){
    const { data } = await supa.client.from('productions').select('*').order('deadline')
    setProductions(data||[])
  }

  // -------- Auth --------
  async function signIn(username, password){
    if(!supa.client){ alert('Configure o Supabase em Configurações'); return }
    const { data, error } = await supa.client
      .from('app_users')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .maybeSingle()
    if(error || !data){ alert('Usuário/senha inválidos'); return }
    if(data.approved===false){ alert('Sua conta aguarda aprovação da Gerência'); return }
    setMe(data)
  }

  async function registerOperator({name,username,password,area}){
    if(!supa.client){ alert('Configure o Supabase em Configurações'); return }
    const { error } = await supa.client.from('app_users').insert({
      name, username, password, role:'operador', area: area||null, approved:false
    })
    if(error){ alert('Erro ao cadastrar'); return }
    await supa.client.from('events').insert({ type:'userRegister', details:{ name, username, area } })
    await supa.client.from('notifications').insert({ to_role:'gerencia', message:`Novo cadastro pendente: ${name} (${username})` })
    alert('Cadastro enviado para aprovação da Gerência.')
  }

  // -------- Gerência --------
  async function addProduction(p){
    const { error } = await supa.client.from('productions').insert(p)
    if(error){ alert('Erro ao cadastrar produção'); return }
    await supa.client.from('book_catalog').upsert({ isbn:p.isbn, title:p.title })
    await supa.client.from('events').insert({ type:'createProduction', details:p })
    refreshProds()
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

  return (
    <div>
      {!me && <Login onSignIn={signIn} onRegister={registerOperator} supa={supa} />}
      {me?.role==='gerencia' && <Manager me={me} productions={productions} addProduction={addProduction} supa={supa} approveUser={approveUser} />}
      {me?.role==='operador' && <Operator me={me} productions={productions} supa={supa} />}
      {me?.role==='consultor' && <Consultant productions={productions} />}
    </div>
  )
}

function Topbar({ me, setView, supa }){/* opcional: manter se seu projeto já tinha */ return null }
function Settings(){ return null }

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
        <input className="inp mb12" placeholder="Usuário (email)" value={u} onChange={e=>setU(e.target.value)} />
        <input className="inp mb12" placeholder="Senha" type="password" value={p} onChange={e=>setP(e.target.value)} />
        <button className="btn mb12" onClick={()=>onSignIn(u,p)}>Entrar</button>
        {/* DICA REMOVIDA */}
        <div className="between mb12">
          <div className="small">Não tem conta?</div>
          <button className="btn secondary" onClick={()=>setOpenReg(true)}>Novo cadastro</button>
        </div>

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

function Manager({ me, productions, addProduction, supa, approveUser }){
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
          <div className="between mb12"><b>Solicitações de cadastro (pendentes)</b></div>
          {pending.length===0 && <div className="small muted">Nenhuma pendência.</div>}
          {pending.map(u=> (
            <div key={u.id} className="between mb12">
              <div><b>{u.name}</b> <span className="muted small">({u.username})</span> • <span className="small">Área: {u.area||'—'}</span></div>
              <div className="row">
                <button className="btn" onClick={async ()=>{
                  await approveUser(u,true)
                  const { data } = await supa.client.from('app_users').select('*').eq('approved', false)
                  setPending(data||[])
                  alert('Operador aprovado.')
                }}>Aprovar</button>
                <button className="btn danger" onClick={async ()=>{
                  await approveUser(u,false)
                  const { data } = await supa.client.from('app_users').select('*').eq('approved', false)
                  setPending(data||[])
                  alert('Cadastro removido.')
                }}>Recusar</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Operator({ me, productions }){ return (
  <div className="container">
    <div className="card p16"><b>Operador</b><div className="small muted">Bem-vindo, {me.username}</div></div>
  </div>
)}

function Consultant({ productions }){ return (
  <div className="container">
    <div className="card p16"><b>Consultor</b><div className="small muted">Status de produção</div></div>
  </div>
)}
