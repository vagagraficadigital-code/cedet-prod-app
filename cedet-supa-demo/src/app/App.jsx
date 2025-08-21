
import React, { useEffect, useMemo, useState } from 'react'
import { supa } from './supa'

const AREAS = [
  "Impressora Speed","Impressora Adast 715","Impressora Adast 725","Impressora GTO Capas",
  "Impressora Digital Versant - Capas","Impressora Digital Nuvera - Miolo","Laminação de Capas",
  "Dobradeira","Intercalação","Costura","Blocagem","Destaque Digital","Destaque Off-set",
  "Coladeira Baby 01","Coladeira Baby 02","Coladeira Eurobind","Trilateral","Revisão","Embalagem","Entregue"
]
const FORMATS = ["11,7x17,5cm","13,9x21cm","15,7x23cm","Tamanho especial"]

export default function App(){
  const [me,setMe] = useState(null)
  const [productions,setProductions] = useState([])

  useEffect(()=>{ if(supa){ refreshProds() } },[])

  async function refreshProds(){
    const { data, error } = await supa.from('productions').select('*').order('deadline')
    if(error){ console.error(error); alert('Erro ao carregar produções'); return }
    setProductions(data||[])
  }

  // ---- Auth ----
  async function signIn(username, password){
    if(!supa){ alert('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY na Vercel'); return }
    const u = (username||'').trim()
    const p = (password||'').trim()
    const { data, error } = await supa
      .from('app_users')
      .select('*')
      .ilike('username', u)
      .eq('password', p)
      .eq('approved', true)
      .maybeSingle()
    if(error || !data){ alert('Usuário/senha inválidos ou não aprovado'); return }
    setMe(data)
  }

  async function registerOperator({name,username,password,area}){
    const payload = { name, username:(username||'').trim(), password:(password||'').trim(), role:'operador', area: area||null, approved:false }
    const { error } = await supa.from('app_users').insert(payload)
    if(error){ console.error(error); alert('Erro ao cadastrar'); return }
    alert('Cadastro enviado para aprovação da Gerência.')
  }

  // ---- Gerência ----
  async function addProduction(p){
    const patch = { ...p, status:'na fila', current_area:null }
    const { error } = await supa.from('productions').insert(patch)
    if(error){ console.error(error); alert('Erro ao cadastrar produção'); return }
    await refreshProds()
  }
  async function deleteProduction(id){
    const { error } = await supa.from('productions').delete().eq('id', id)
    if(error){ console.error(error); alert('Erro ao deletar'); return }
    await refreshProds()
  }
  async function approveUser(user, approve){
    if(approve){
      await supa.from('app_users').update({approved:true}).eq('id',user.id)
    }else{
      await supa.from('app_users').delete().eq('id',user.id)
    }
  }
  async function deleteUser(user){
    const { error } = await supa.from('app_users').delete().eq('id', user.id)
    if(error){ console.error(error); alert('Erro ao deletar usuário'); return }
  }

  // ---- Operador ----
  async function startPrep(p){
    await supa.from('productions').update({ status:'em preparação', current_area: 'Preparação' }).eq('id',p.id)
    await refreshProds()
  }
  async function startProd(p){
    await supa.from('productions').update({ status:'em produção' }).eq('id',p.id)
    await refreshProds()
  }
  async function togglePause(p){
    const newStatus = p.status==='pausado' ? 'em produção' : 'pausado'
    await supa.from('productions').update({ status:newStatus }).eq('id',p.id)
    await refreshProds()
  }
  async function finishProd(p, discardQty, finalQty){
    await supa.from('productions').update({ status:'finalizado', discard_qty:Number(discardQty||0), final_qty:Number(finalQty||0) }).eq('id',p.id)
    await refreshProds()
  }
  async function signalProblem(p, desc){
    await supa.from('events').insert({ type:'problem', production_id:p.id, details:{ desc } })
    alert('Problema sinalizado à Gerência.')
  }
  async function sendToNextArea(p, nextArea){
    await supa.from('productions').update({ current_area:nextArea, status:'na fila' }).eq('id',p.id)
    await refreshProds()
  }

  return (
    <div>
      {!me && <Login onSignIn={signIn} onRegister={registerOperator} />}
      {me?.role==='gerencia' && (
        <Manager
          productions={productions}
          addProduction={addProduction}
          deleteProduction={deleteProduction}
          approveUser={approveUser}
          deleteUser={deleteUser}
        />
      )}
      {me?.role==='operador' && (
        <Operator
          productions={productions}
          startPrep={startPrep}
          startProd={startProd}
          togglePause={togglePause}
          finishProd={finishProd}
          sendToNextArea={sendToNextArea}
          signalProblem={signalProblem}
        />
      )}
      {me?.role==='consultor' && <Consultant productions={productions} />}
    </div>
  )
}

function Login({ onSignIn, onRegister }){
  const [u,setU] = useState('')
  const [p,setP] = useState('')
  const [openReg,setOpenReg] = useState(false)
  const [rName,setRName] = useState('')
  const [rUser,setRUser] = useState('')
  const [rPass,setRPass] = useState('')
  const [rArea,setRArea] = useState('')

  return (
    <div className="container" style={{minHeight:'100vh',display:'grid',placeItems:'center'}}>
      <div className="card p24" style={{width:480}}>
        <div className="row mb16">
          <img src="/logo.png" className="logo" alt="logo"/>
          <div>
            <div><b>CEDET – Gestão de Produção</b></div>
            <div className="small muted">Acesse ou faça seu cadastro</div>
          </div>
        </div>
        <input className="inp mb12" placeholder="Usuário (email ou apelido)" value={u} onChange={e=>setU(e.target.value)} />
        <input className="inp mb12" placeholder="Senha" type="password" value={p} onChange={e=>setP(e.target.value)} />
        <button className="btn mb12" onClick={()=>onSignIn(u,p)}>Entrar</button>
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
          </div>
        )}
      </div>
    </div>
  )
}

function Manager({ productions, addProduction, deleteProduction, approveUser, deleteUser }){
  const [isbn,setIsbn] = useState('')
  const [title,setTitle] = useState('')
  const [qty,setQty] = useState(0)
  const [pages,setPages] = useState(0)
  const [format,setFormat] = useState(FORMATS[1])
  const [osNumber,setOs] = useState('')
  const [deadline,setDeadline] = useState(new Date(Date.now()+7*86400000).toISOString().slice(0,10))

  const [pending,setPending] = useState([])
  const [users,setUsers] = useState([])

  useEffect(()=>{ (async()=>{
    const { data: pend } = await supa.from('app_users').select('*').eq('approved', false)
    setPending(pend||[])
    const { data: us } = await supa.from('app_users').select('*').order('role')
    setUsers(us||[])
  })() },[])

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
          <div className="between mb12"><b>Fila de produção</b></div>
          <div className="list">
            {productions.map(p=> (
              <div key={p.id} className="between card p16 mb12">
                <div>
                  <div><b>{p.title}</b> <span className="small muted">ISBN {p.isbn}</span></div>
                  <div className="small muted">OS {p.os_number} • {p.qty} un. • {p.pages} págs • Formato {p.format} • Status: {p.status}</div>
                  <div className="small">Área atual: <b>{p.current_area||'—'}</b></div>
                </div>
                <button className="btn danger" onClick={()=>{ if(confirm('Deletar esta produção?')) deleteProduction(p.id) }}>Deletar</button>
              </div>
            ))}
            {productions.length===0 && <div className="small muted">Nenhum trabalho cadastrado.</div>}
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="card p16">
          <div className="mb12"><b>Solicitações de cadastro (pendentes)</b></div>
          {pending.length===0 && <div className="small muted">Nenhuma pendência.</div>}
          {pending.map(u=> (
            <div key={u.id} className="between mb12">
              <div><b>{u.name||u.username}</b> <span className="muted small">({u.username})</span> • <span className="small">Área: {u.area||'—'}</span></div>
              <div className="row">
                <button className="btn" onClick={async ()=>{
                  await approveUser(u,true)
                  const { data } = await supa.from('app_users').select('*').eq('approved', false)
                  setPending(data||[])
                  alert('Operador aprovado.')
                }}>Aprovar</button>
                <button className="btn danger" onClick={async ()=>{
                  await approveUser(u,false)
                  const { data } = await supa.from('app_users').select('*').eq('approved', false)
                  setPending(data||[])
                  alert('Cadastro removido.')
                }}>Recusar</button>
              </div>
            </div>
          ))}
        </div>

        <div className="card p16">
          <div className="mb12"><b>Usuários</b> <span className="small muted">(Gerentes, Consultores e Operadores)</span></div>
          {users.map(u=> (
            <div key={u.id} className="between mb12">
              <div><b>{u.name||u.username}</b> <span className="muted small">({u.username})</span> • <span className="small">Papel: {u.role}</span> • <span className="small">Aprovado: {u.approved? 'Sim':'Não'}</span></div>
              <button className="btn danger" onClick={()=>{ if(confirm('Deletar este usuário?')) deleteUser(u) }}>Deletar</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Operator({ productions, startPrep, startProd, togglePause, finishProd, sendToNextArea, signalProblem }){
  const [search,setSearch] = useState('')
  const [finishFor,setFinishFor] = useState(null)
  const [discard,setDiscard] = useState(0)
  const [finalQty,setFinalQty] = useState(0)

  const visible = useMemo(()=> productions.filter(p=> !search || p.isbn===search || (p.title||'').toLowerCase().includes(search.toLowerCase()) ), [productions,search])

  return (
    <div className="container">
      <div className="card p16 mb16">
        <div className="between mb12">
          <b>Fila de produção</b>
          <div className="small muted">Busque por ISBN ou título</div>
        </div>
        <div className="row mb12">
          <input className="inp" placeholder="ISBN ou título" value={search} onChange={e=>setSearch(e.target.value)} />
          <button className="btn secondary" onClick={()=>setSearch('')}>Limpar</button>
        </div>
        <div className="list">
          {visible.map(p=> (
            <div key={p.id} className="card p16 mb12">
              <div className="between">
                <div>
                  <div><b>{p.title}</b> <span className="small muted">ISBN {p.isbn}</span></div>
                  <div className="small muted">OS {p.os_number} • {p.qty} un. • {p.pages} págs</div>
                  <div className="small">Área atual: <b>{p.current_area||'—'}</b> • Status: <b>{p.status}</b></div>
                </div>
                <button className="btn secondary" onClick={()=>{ const d=prompt('Descreva o problema:'); if(d) signalProblem(p,d) }}>Problema</button>
              </div>
              <div className="roww" style={{marginTop:8}}>
                <button className="btn" onClick={()=>startPrep(p)}>Preparação</button>
                <button className="btn" onClick={()=>startProd(p)}>Iniciar</button>
                <button className="btn secondary" onClick={()=>togglePause(p)}>{p.status==='pausado'? 'Retomar':'Pausar'}</button>
                <button className="btn" onClick={()=>setFinishFor(p)}>Finalizar</button>
              </div>
              <div className="roww" style={{marginTop:12}}>
                {AREAS.filter(a=>a!==p.current_area).map(a=> <span key={a} className="area-chip" onClick={()=>sendToNextArea(p,a)}>{a}</span>)}
              </div>
            </div>
          ))}
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
            <div className="small muted">Prazo: {p.deadline? new Date(p.deadline).toLocaleDateString():'—'}</div>
          </div>
        ))}
        {productions.length===0 && <div className="small muted">Sem itens.</div>}
      </div>
    </div>
  )
}
