import React, { useEffect, useMemo, useState } from 'react'
import { supa } from './supa'
import './styles.css'

/** ======= Constantes ======= */
const AREAS = [
  "Impressora Speed","Impressora Adast 715","Impressora Adast 725","Impressora GTO Capas",
  "Impressora Digital Versant - Capas","Impressora Digital Nuvera - Miolo","Laminação de Capas",
  "Dobradeira","Intercalação","Costura","Blocagem","Destaque Digital","Destaque Off-set",
  "Coladeira Baby 01","Coladeira Baby 02","Coladeira Eurobind","Trilateral","Revisão","Embalagem","Entregue"
]
const FORMATS = ["11,7x17,5cm","13,9x21cm","15,7x23cm","Tamanho especial"]
const ROLES = ["master","gerencia","consultor","operador"]
const DEFAULT_ROLE_POLICIES = {
  master: { manage_users:true, manage_policies:true, create_production:true, delete_production:true, reorder_queue:true, view_all_productions:true, operator_actions:true, view_reports:true, see_deadlines:true, mark_plates:true },
  gerencia: { manage_users:true, manage_policies:false, create_production:true, delete_production:true, reorder_queue:true, view_all_productions:true, operator_actions:false, view_reports:true, see_deadlines:true, mark_plates:true },
  consultor: { manage_users:false, manage_policies:false, create_production:false, delete_production:false, reorder_queue:false, view_all_productions:true, operator_actions:false, view_reports:true, see_deadlines:true, mark_plates:false },
  operador: { manage_users:false, manage_policies:false, create_production:false, delete_production:false, reorder_queue:false, view_all_productions:false, operator_actions:true, view_reports:false, see_deadlines:true, mark_plates:true }
}

const dayMs = 86400000
const fmtDate = (d)=> d ? new Date(d).toLocaleDateString() : "—"
const fmtDateTime = (d)=> d ? new Date(d).toLocaleString() : "—"
const areaIdx = (a)=> AREAS.findIndex(x=>x===a)

function DueBadge({deadline}){
  if(!deadline) return null
  const diff = new Date(deadline).getTime() - Date.now()
  if (diff < 0) return <span className="badge danger">VENCIDO</span>
  if (diff <= 2*dayMs) return <span className="badge warn">⚠ 48h</span>
  if (diff <= 5*dayMs) return <span className="badge warn">⚠ 5 dias</span>
  return <span className="badge ok">no prazo</span>
}

/** ======= App ======= */
export default function App(){
  const [me,setMe] = useState(null)
  const [policy,setPolicy] = useState({})
  const [productions,setProductions] = useState([])
  const [loading,setLoading] = useState(false)
  const [detailFor,setDetailFor] = useState(null)

  const can = (k)=> !!policy?.[k]

  useEffect(()=>{ if(me){ loadPolicy(me.role); refreshProds() } },[me?.role])

  async function loadPolicy(role){
    const { data } = await supa.from('role_policies').select('*').eq('role', role).maybeSingle()
    setPolicy(data?.policy ? { ...DEFAULT_ROLE_POLICIES[role], ...(data.policy||{}) } : (DEFAULT_ROLE_POLICIES[role]||{}))
  }

  async function refreshProds(){
    setLoading(true)
    let r1 = await supa.from('productions').select('*').order('priority',{ascending:true})
    if(r1.error){ r1 = await supa.from('productions').select('*').order('created_at',{ascending:true}) }
    setProductions(r1.data||[]); setLoading(false)
  }

  async function signIn(username, password, setErr){
    const u = (username||'').trim().toLowerCase()
    const p = (password||'').trim()
    if(!u || !p){ setErr('Informe usuário e senha.'); return }
    const { data } = await supa.from('app_users').select('*').eq('username', u).maybeSingle()
    if(!data){ setErr('Usuário não encontrado.'); return }
    if(data.approved!==true){ setErr('Conta aguarda aprovação da Gerência.'); return }
    if(data.active===false){ setErr('Acesso desativado. Procure a Gerência.'); return }
    if(data.password !== p){ setErr('Senha inválida.'); return }
    await supa.from('app_users').update({ last_login: new Date().toISOString() }).eq('id', data.id)
    setMe(data)
  }

  async function registerOperator({name,username,password,confirm,area}, setErr, setOk){
    const uname = (username||'').trim().toLowerCase()
    const pass = (password||'').trim()
    const conf = (confirm||'').trim()
    if(!uname || !pass){ setErr('Usuário e senha são obrigatórios.'); return }
    if(pass.length < 4){ setErr('Use senha com pelo menos 4 caracteres.'); return }
    if(pass !== conf){ setErr('Confirmação de senha não confere.'); return }
    const payload = { name: (name||null), username: uname, password: pass, role:'operador', area:area||null, approved:false, active:true }
    const { error } = await supa.from('app_users').insert(payload)
    if(error){ console.error(error); setErr('Erro ao cadastrar.'); return }
    setOk('Cadastro enviado para aprovação da Gerência.')
  }

  function signOut(){ setMe(null); setProductions([]); setDetailFor(null); setPolicy({}) }

  async function addProduction(p){
    if(!can('create_production')){ alert('Sem permissão para cadastrar.'); return }
    let res = await supa.from('productions').insert({ ...p, status:'na fila', current_area:null, priority: Date.now() })
    if(res.error){
      const {priority, ...rest} = p
      res = await supa.from('productions').insert({ ...rest, status:'na fila', current_area:null })
      if(res.error){ console.error(res.error); alert('Erro ao cadastrar produção'); return }
    }
    const newId = res.data?.[0]?.id || (await supa.from('productions').select('id').order('id',{ascending:false}).limit(1)).data?.[0]?.id
    if(newId) await supa.from('events').insert({ type:'created', production_id:newId })
    refreshProds()
  }

  async function deleteProduction(id){
    if(!can('delete_production')){ alert('Sem permissão para deletar.'); return }
    const { error } = await supa.from('productions').delete().eq('id', id)
    if(error){ alert('Erro ao deletar produção'); return }
    refreshProds()
  }

  async function approveUser(user, approve){
    if(!can('manage_users')){ alert('Sem permissão.'); return }
    if(approve) await supa.from('app_users').update({ approved:true, approved_at:new Date().toISOString() }).eq('id', user.id)
    else await supa.from('app_users').delete().eq('id', user.id)
  }
  async function deleteUser(user){
    if(!can('manage_users')){ alert('Sem permissão.'); return }
    await supa.from('app_users').delete().eq('id', user.id)
  }
  async function setUserActive(user, active){
    if(!can('manage_users')){ alert('Sem permissão.'); return }
    await supa.from('app_users').update({ active, deactivated_at: active? null : new Date().toISOString() }).eq('id', user.id)
  }
  async function setUserRole(user, role){
    if(!can('manage_users')){ alert('Sem permissão.'); return }
    await supa.from('app_users').update({ role }).eq('id', user.id)
  }
  async function resetUserPassword(user){
    if(!can('manage_users')){ alert('Sem permissão.'); return }
    const np = prompt(`Nova senha para ${user.username}:`)
    if(!np) return
    await supa.from('app_users').update({ password:np }).eq('id', user.id)
  }
  async function createUserQuick(){
    if(!can('manage_users')){ alert('Sem permissão.'); return }
    const username = prompt('Usuário (email ou apelido):'); if(!username) return
    const password = prompt('Senha:'); if(!password) return
    const name = prompt('Nome (opcional):')||null
    const role = prompt('Papel (master/gerencia/consultor/operador):','operador')||'operador'
    const { error } = await supa.from('app_users').insert({ username:username.toLowerCase().trim(), password:password.trim(), name, role, approved:true, active:true })
    if(error){ alert('Erro ao criar.'); return }
    alert('Usuário criado.')
  }

  async function bumpPriority(p, dir){
    if(!can('reorder_queue')){ alert('Sem permissão para alterar a fila.'); return }
    try{
      const delta = dir<0 ? -1000 : +1000
      const newPr = (p.priority||Date.now()) + delta
      const { error } = await supa.from('productions').update({ priority:newPr }).eq('id', p.id)
      if(error) throw error
    }catch{ alert('Para mover na fila, crie a coluna priority no Supabase (use o schema.sql).') }
    refreshProds()
  }

  async function startPrep(p){ if(!can('operator_actions')) return
    await supa.from('productions').update({ status:'em preparação', current_area:'Preparação' }).eq('id', p.id)
    await supa.from('events').insert({ type:'prep_start', production_id:p.id }); refreshProds()
  }
  async function startProd(p){ if(!can('operator_actions')) return
    await supa.from('productions').update({ status:'em produção' }).eq('id', p.id)
    await supa.from('events').insert({ type:'prod_start', production_id:p.id }); refreshProds()
  }
  async function togglePause(p){ if(!can('operator_actions')) return
    const paused = p.status==='pausado'
    await supa.from('productions').update({ status: paused ? 'em produção' : 'pausado' }).eq('id', p.id)
    await supa.from('events').insert({ type: paused ? 'resume' : 'pause', production_id:p.id }); refreshProds()
  }
  async function finishProd(p, discardQty, finalQty){ if(!can('operator_actions')) return
    await supa.from('productions').update({ status:'finalizado', discard_qty:Number(discardQty||0), final_qty:Number(finalQty||0) }).eq('id', p.id)
    await supa.from('events').insert({ type:'finish', production_id:p.id, details:{ discard:Number(discardQty||0), final:Number(finalQty||0) } })
    refreshProds()
  }
  async function signalProblem(p, desc){
    if(!desc) return
    await supa.from('events').insert({ type:'problem', production_id:p.id, details:{ desc } })
    alert('Problema sinalizado.')
  }
  async function sendToNextArea(p){ if(!can('operator_actions')) return
    const idx = areaIdx(p.current_area)
    const next = idx>=0 ? AREAS[Math.min(idx+1, AREAS.length-1)] : AREAS[0]
    await supa.from('productions').update({ current_area: next, status:'na fila' }).eq('id', p.id)
    await supa.from('events').insert({ type:'handoff', production_id:p.id, details:{ to: next } })
    refreshProds()
  }

  return (
    <div>
      <div className="header">
        <div className="header-inner">
          <div className="small" style={{opacity:.6}}>CEDET v3</div>
          <div className="brand">
            <img src="/logo.png" className="logo" alt="logo"/>
            <div className="appname">Gestão de Produção</div>
          </div>
          <div className="userbox">
            {me && <>Logado: <b style={{color:'#fff'}}>{me.role}</b> · <span className="link" onClick={()=>{ if(confirm('Sair?')) signOut() }}>Sair</span></>}
          </div>
        </div>
      </div>

      {!me && <Login onSignIn={signIn} onRegister={registerOperator} />}

      {me?.role && (me.role==='gerencia' || me.role==='master') && (
        <Manager
          me={me} policy={policy} can={can}
          productions={productions}
          addProduction={addProduction}
          deleteProduction={deleteProduction}
          approveUser={approveUser}
          deleteUser={deleteUser}
          setUserActive={setUserActive}
          setUserRole={setUserRole}
          resetUserPassword={resetUserPassword}
          createUserQuick={createUserQuick}
          moveUp={(p)=>bumpPriority(p,-1)}
          moveDown={(p)=>bumpPriority(p,1)}
          openDetail={setDetailFor}
          reload={refreshProds}
          loading={loading}
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
          openDetail={setDetailFor}
          reload={refreshProds}
          loading={loading}
        />
      )}

      {me?.role==='consultor' && (
        <Consultant productions={productions} openDetail={setDetailFor} reload={refreshProds} loading={loading} />
      )}

      {detailFor && <BookDetail prod={detailFor} onClose={()=>setDetailFor(null)} />}
    </div>
  )
}

/** ======= Login (centralizado) ======= */
function Login({ onSignIn, onRegister }){
  const [u,setU] = useState(''), [p,setP] = useState('')
  const [err,setErr] = useState('')

  const [openReg,setOpenReg] = useState(false)
  const [rName,setRName] = useState(''), [rUser,setRUser] = useState(''), [rPass,setRPass] = useState(''), [rPass2,setRPass2] = useState(''), [rArea,setRArea] = useState('')
  const [regErr,setRegErr] = useState('')
  const [regOk,setRegOk] = useState('')

  return (
    <div className="login-shell">
      <div className="login-card">
        <div style={{display:'flex',alignItems:'center',gap:12, marginBottom:10}}>
          <img src="/logo.png" className="logo" alt="logo"/>
          <div>
            <h3 className="login-title">Entrar no CEDET</h3>
            <div className="login-sub">Acesse sua conta ou crie um cadastro (operador)</div>
          </div>
        </div>
        {err && <div className="notice err">{err}</div>}
        <input className="inp mb12" placeholder="Usuário (email ou apelido)" value={u} onChange={e=>setU(e.target.value)} />
        <input className="inp mb12" placeholder="Senha" type="password" value={p} onChange={e=>setP(e.target.value)} />
        <button className="btn mb12" onClick={()=>onSignIn(u,p,setErr)}>Entrar</button>

        <div className="between mb12">
          <div className="small">Não tem conta?</div>
          <button className="btn secondary" onClick={()=>{ setOpenReg(!openReg); setRegOk(''); setRegErr(''); }}>{openReg?'Fechar':'Novo cadastro'}</button>
        </div>

        {openReg && (
          <div className="card p16 mb12" style={{marginTop:12}}>
            <div className="mb12"><b>Novo cadastro (Operador)</b></div>
            {regErr && <div className="notice err">{regErr}</div>}
            {regOk && <div className="notice">{regOk}</div>}
            <input className="inp mb12" placeholder="Nome" value={rName} onChange={e=>setRName(e.target.value)} />
            <input className="inp mb12" placeholder="Usuário (email ou apelido)" value={rUser} onChange={e=>setRUser(e.target.value)} />
            <input className="inp mb12" placeholder="Senha" type="password" value={rPass} onChange={e=>setRPass(e.target.value)} />
            <input className="inp mb12" placeholder="Confirmar senha" type="password" value={rPass2} onChange={e=>setRPass2(e.target.value)} />
            <select className="inp mb12" value={rArea} onChange={e=>setRArea(e.target.value)}>
              <option value="">Área (opcional)</option>
              {AREAS.map(a=> <option key={a} value={a}>{a}</option>)}
            </select>
            <div className="flex">
              <button className="btn" onClick={()=>onRegister({name:rName,username:rUser,password:rPass,confirm:rPass2,area:rArea}, setRegErr, setRegOk)}>Enviar para aprovação</button>
              <button className="btn secondary" onClick={()=>setOpenReg(false)}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** ======= Painel Gerência/Master ======= */
function Manager({ me, policy, can, productions, addProduction, deleteProduction, approveUser, deleteUser, setUserActive, setUserRole, resetUserPassword, createUserQuick, moveUp, moveDown, openDetail, reload, loading }){
  const [isbn,setIsbn] = useState(''), [title,setTitle] = useState('')
  const [qty,setQty] = useState(0), [pages,setPages] = useState(0)
  const [format,setFormat] = useState(FORMATS[1])
  const [osNumber,setOs] = useState('')
  const [deadline,setDeadline] = useState(new Date(Date.now()+7*dayMs).toISOString().slice(0,10))

  const [pending,setPending] = useState([])
  const [users,setUsers] = useState([])
  const [filter,setFilter] = useState('')

  useEffect(()=>{ (async()=>{
    const pend = await supa.from('app_users').select('*').eq('approved', false)
    setPending(pend.data||[])
    if(can('manage_users')){
      const u = await supa.from('app_users').select('*').order('created_at',{ascending:false})
      setUsers(u.data||[])
    }
  })() },[])

  const filteredUsers = users.filter(u=> !filter || (u.username||'').toLowerCase().includes(filter.toLowerCase()) || (u.name||'').toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="container">
      <div className="between mb16">
        <h3>Painel da {me.role==='master'?'Master':'Gerência'}</h3>
        <button className="btn secondary" onClick={reload}>{loading?'Atualizando...':'Atualizar'}</button>
      </div>

      {/* Produções */}
      {can('create_production') && (
      <div className="card p20 mb20">
        <div className="mb12"><b>Cadastrar nova produção</b></div>
        <div className="grid2">
          <input className="inp" placeholder="ISBN" value={isbn} onChange={e=>setIsbn(e.target.value)} />
          <input className="inp" placeholder="Título" value={title} onChange={e=>setTitle(e.target.value)} />
          <input className="inp" type="number" placeholder="Quantidade" value={qty} onChange={e=>setQty(Number(e.target.value))} />
          <input className="inp" type="number" placeholder="Páginas" value={pages} onChange={e=>setPages(Number(e.target.value))} />
          <select className="inp" value={format} onChange={e=>setFormat(e.target.value)}>{FORMATS.map(f=> <option key={f} value={f}>{f}</option>)}</select>
          <input className="inp" placeholder="Nº OS" value={osNumber} onChange={e=>setOs(e.target.value)} />
          <input className="inp" type="date" value={deadline} onChange={e=>setDeadline(e.target.value)} />
        </div>
        <div className="flex" style={{marginTop:12}}>
          <button className="btn" onClick={()=>{
            if(!isbn || !title || !qty || !pages || !osNumber || !deadline){ alert('Preencha todos os campos'); return }
            addProduction({ isbn, title, qty, pages, format, os_number: osNumber, deadline: new Date(deadline).toISOString() })
            setIsbn(''); setTitle(''); setQty(0); setPages(0); setOs('')
          }}>Cadastrar</button>
        </div>
      </div>
      )}

      <div className="card p20 mb20">
        <div className="between mb12"><b>Fila de produção</b></div>
        <div className="list">
          {productions.map(p=> (
            <div key={p.id} className="between card p16 rowCard">
              <div onClick={()=>openDetail(p)}>
                <div className="flex">
                  <b>{p.title}</b> <span className="small">ISBN {p.isbn}</span> <DueBadge deadline={p.deadline}/>
                </div>
                <div className="small">OS {p.os_number} • {p.qty} un. • {p.pages} págs • Formato {p.format} • Status: {p.status||'na fila'}</div>
                <div className="small">Área atual: <b>{p.current_area||'—'}</b> • Prazo: <b>{fmtDate(p.deadline)}</b></div>
              </div>
              <div className="flex">
                {can('reorder_queue') && (<>
                  <button className="btn" title="Subir" onClick={()=>moveUp(p)}>↑</button>
                  <button className="btn" title="Descer" onClick={()=>moveDown(p)}>↓</button>
                </>)}
                {can('delete_production') && (
                  <button className="btn danger" onClick={()=>{ if(confirm('Deletar esta produção?')) deleteProduction(p.id) }}>Deletar</button>
                )}
              </div>
            </div>
          ))}
          {productions.length===0 && <div className="small">Nenhum trabalho cadastrado.</div>}
        </div>
      </div>

      {/* Pendências de cadastro */}
      {can('manage_users') && (
      <div className="card p20 mb20">
        <div className="mb12"><b>Solicitações de cadastro (pendentes)</b></div>
        {pending.length===0 && <div className="small">Nenhuma pendência.</div>}
        {pending.map(u=> (
          <div key={u.id} className="between mb12">
            <div><b>{u.name||u.username}</b> <span className="small">({u.username})</span> • Área: {u.area||'—'}</div>
            <div className="flex">
              <button className="btn" onClick={async ()=>{
                await approveUser(u,true)
                const { data } = await supa.from('app_users').select('*').eq('approved', false)
                setPending(data||[]); alert('Operador aprovado.')
              }}>Aprovar</button>
              <button className="btn danger" onClick={async ()=>{
                await approveUser(u,false)
                const { data } = await supa.from('app_users').select('*').eq('approved', false)
                setPending(data||[]); alert('Cadastro removido.')
              }}>Recusar</button>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Gestão de Pessoas */}
      {can('manage_users') && (
      <div className="card p20 mb20">
        <div className="between mb12">
          <b>Gestão de Pessoas</b>
          <div className="flex">
            <input className="inp" style={{minWidth:220}} placeholder="Filtrar por nome/usuário" value={filter} onChange={e=>setFilter(e.target.value)} />
            <button className="btn secondary" onClick={async()=>{
              const u = await supa.from('app_users').select('*').order('created_at',{ascending:false})
              setUsers(u.data||[])
            }}>Recarregar</button>
            <button className="btn" onClick={createUserQuick}>Criar usuário rápido</button>
          </div>
        </div>
        {filteredUsers.length===0 && <div className="small">Nenhum usuário encontrado.</div>}
        {filteredUsers.map(u=> (
          <div key={u.id} className="between mb12">
            <div><b>{u.name||u.username}</b> <span className="small">({u.username})</span> • Papel: <b>{u.role}</b> • {u.approved?'Aprovado':'Pendente'} • {u.active===false?'Desativado':'Ativo'}</div>
            <div className="flex">
              <select className="inp" value={u.role} onChange={async (e)=>{ await setUserRole(u, e.target.value); u.role=e.target.value; }}>
                {ROLES.map(r=> <option key={r} value={r}>{r}</option>)}
              </select>
              {u.approved ? (
                <button className="btn secondary" onClick={()=>setUserActive(u, u.active===false ? true : false)}>{u.active===false?'Reativar':'Desativar'}</button>
              ) : (
                <button className="btn" onClick={()=>approveUser(u,true)}>Aprovar</button>
              )}
              <button className="btn" onClick={()=>resetUserPassword(u)}>Resetar senha</button>
              <button className="btn danger" onClick={()=>{ if(confirm('Deletar este usuário?')) deleteUser(u) }}>Excluir</button>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  )
}

/** ======= Operador ======= */
function Operator({ productions, startPrep, startProd, togglePause, finishProd, sendToNextArea, signalProblem, openDetail, reload, loading }){
  const [search,setSearch] = useState('')
  const [finishFor,setFinishFor] = useState(null)
  const [discard,setDiscard] = useState(0)
  const [finalQty,setFinalQty] = useState(0)

  const visible = useMemo(()=> productions
    .filter(p=> !search || p.isbn===search || (p.title||'').toLowerCase().includes(search.toLowerCase())), [productions,search])

  const chipsFor = (p)=>{
    const idx = areaIdx(p.current_area)
    const prev = idx>0 ? AREAS[idx-1] : null
    const curr = p.current_area || '—'
    const next = idx>=0 && idx<AREAS.length-1 ? AREAS[idx+1] : AREAS[0]
    return { prev, curr, next }
  }

  return (
    <div className="container">
      <div className="between mb16">
        <h3>Painel do Operador</h3>
        <button className="btn secondary" onClick={reload}>{loading?'Atualizando...':'Atualizar'}</button>
      </div>
      <div className="card p20 mb16">
        <div className="between mb12">
          <b>Fila de produção</b>
          <div className="small">Busque por ISBN ou título</div>
        </div>
        <div className="flex mb12">
          <input className="inp" placeholder="ISBN ou título" value={search} onChange={e=>setSearch(e.target.value)} />
          <button className="btn secondary" onClick={()=>setSearch('')}>Limpar</button>
        </div>
        <div className="list">
          {visible.map(p=> {
            const { prev, curr, next } = chipsFor(p)
            return (
            <div key={p.id} className="card p16">
              <div className="between">
                <div style={{cursor:'pointer'}} onClick={()=>openDetail(p)}>
                  <div className="flex">
                    <b>{p.title}</b> <span className="small">ISBN {p.isbn}</span> <DueBadge deadline={p.deadline}/>
                  </div>
                  <div className="small">OS {p.os_number} • {p.qty} un. • {p.pages} págs • Prazo: {fmtDate(p.deadline)}</div>
                  <div className="small">Área atual: <b>{p.current_area||'—'}</b> • Status: <b>{p.status||'na fila'}</b></div>
                </div>
                <button className="btn secondary" onClick={()=>{ const d=prompt('Descreva o problema:'); if(d) signalProblem(p,d) }}>Problema</button>
              </div>
              <div className="flex" style={{marginTop:8}}>
                <button className="btn" onClick={()=>startPrep(p)}>Preparação</button>
                <button className="btn" onClick={()=>startProd(p)}>Iniciar</button>
                <button className="btn secondary" onClick={()=>togglePause(p)}>{p.status==='pausado'? 'Retomar':'Pausar'}</button>
                <button className="btn" onClick={()=>setFinishFor(p)}>Finalizar</button>
              </div>
              <div className="flex" style={{marginTop:8}}>
                {prev && <span className="area-chip">{prev}</span>}
                <span className="area-chip area-chip--current">• {curr} •</span>
                {next && <span className="area-chip" onClick={()=>sendToNextArea(p)} title="Enviar para a próxima área">{next} →</span>}
              </div>
            </div>
          )})}
          {visible.length===0 && <div className="small">Sem itens na fila.</div>}
        </div>
      </div>

      {finishFor && (
        <div className="card p20">
          <div className="mb12"><b>Finalizar produção</b> – {finishFor.title}</div>
          <div className="flex mb12">
            <label className="small">Perdas (descarte)</label>
            <input className="inp" type="number" placeholder="Ex.: 3" value={discard} onChange={e=>setDiscard(e.target.value)} />
            <label className="small">Quantidade final produzida</label>
            <input className="inp" type="number" placeholder="Ex.: 997" value={finalQty} onChange={e=>setFinalQty(e.target.value)} />
          </div>
          <div className="flex">
            <button className="btn" onClick={()=>{ finishProd(finishFor, discard, finalQty); setFinishFor(null); setDiscard(0); setFinalQty(0) }}>Confirmar</button>
            <button className="btn secondary" onClick={()=>setFinishFor(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** ======= Consultor ======= */
function Consultant({ productions, openDetail, reload, loading }){
  return (
    <div className="container">
      <div className="between mb16">
        <h3>Painel do Consultor</h3>
        <button className="btn secondary" onClick={reload}>{loading?'Atualizando...':'Atualizar'}</button>
      </div>
      <div className="card p20">
        <div className="mb12"><b>Status dos livros</b></div>
        {productions.map(p=> (
          <div key={p.id} className="between rowCard" onClick={()=>openDetail(p)}>
            <div>
              <div className="flex">
                <b>{p.title}</b> <span className="small">ISBN {p.isbn}</span> <DueBadge deadline={p.deadline}/>
              </div>
              <div className="small">Status: {p.status||'na fila'} • Área: {p.current_area||'—'}</div>
            </div>
            <div className="small">Prazo: {fmtDate(p.deadline)}</div>
          </div>
        ))}
        {productions.length===0 && <div className="small">Sem itens.</div>}
      </div>
    </div>
  )
}

/** ======= Detalhes ======= */
function BookDetail({ prod, onClose }){
  const [events,setEvents] = useState([])
  useEffect(()=>{ (async()=>{
    const { data } = await supa.from('events').select('*').eq('production_id', prod.id).order('created_at', { ascending: true })
    setEvents(data||[])
  })() },[prod?.id])

  const timeline = events.map(ev=>{
    const label = ({
      created:'Cadastro criado', prep_start:'Preparação iniciada', prod_start:'Produção iniciada',
      pause:'Pausa', resume:'Retomada', finish:'Finalizado', problem:'Problema', handoff:'Encaminhado'
    })[ev.type] || ev.type
    return { when: ev.created_at, label, details: ev.details }
  })

  return (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,.55)',display:'grid',placeItems:'center',zIndex:1000}}>
      <div className="card p24" style={{width:'min(900px,95vw)',maxHeight:'90vh',overflow:'auto'}}>
        <div className="between mb12">
          <b>Detalhes do livro</b>
          <button className="btn secondary" onClick={onClose}>Fechar</button>
        </div>

        <div className="mb12">
          <div className="flex"><h3 style={{margin:'6px 0'}}>{prod.title}</h3> <DueBadge deadline={prod.deadline}/></div>
          <div className="small">ISBN {prod.isbn} • OS {prod.os_number} • {prod.qty} un. • {prod.pages} págs • Formato {prod.format}</div>
          <div className="small">Área atual: <b>{prod.current_area||'—'}</b> • Status: <b>{prod.status||'na fila'}</b> • Prazo: <b>{fmtDate(prod.deadline)}</b></div>
          {(prod.final_qty!=null || prod.discard_qty!=null) && (
            <div className="small" style={{marginTop:6}}>
              <b>Quantidade final:</b> {prod.final_qty??'—'} • <b>Perdas:</b> {prod.discard_qty??'—'}
            </div>
          )}
        </div>

        <div className="card p16">
          <div className="mb12"><b>Linha do tempo</b></div>
          {timeline.length===0 && <div className="small">Sem eventos registrados ainda.</div>}
          {timeline.map((t,i)=>(
            <div key={i} className="mb12">
              <div><b>{t.label}</b> <span className="small">({fmtDateTime(t.when)})</span></div>
              {t.details && <pre style={{whiteSpace:'pre-wrap',fontSize:12,opacity:.95}}>{JSON.stringify(t.details)}</pre>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
