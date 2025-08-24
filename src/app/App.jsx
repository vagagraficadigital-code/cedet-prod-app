import React, { useState, useEffect } from 'react'
import { supa } from './supa'

export default function App(){
  const [me,setMe] = useState(null)
  const [productions,setProductions] = useState([])
  const [pending,setPending] = useState([])

  useEffect(()=>{ if(me) loadProductions(); },[me])

  async function loadProductions(){
    const { data } = await supa.from('productions').select('*').order('deadline')
    setProductions(data||[])
  }
  async function login(u,p){
    const { data } = await supa.from('app_users').select('*').eq('username',u.toLowerCase()).eq('password',p).eq('approved',true).maybeSingle()
    if(data) setMe(data); else alert('Usuário inválido ou não aprovado')
  }
  async function register(u,p){
    await supa.from('app_users').insert({username:u.toLowerCase(),password:p,role:'operador',approved:false})
    alert('Cadastro enviado para aprovação')
  }
  async function addProduction(prod){
    await supa.from('productions').insert(prod); loadProductions()
  }
  async function approveUser(user, ok){
    if(ok) await supa.from('app_users').update({approved:true}).eq('id',user.id)
    else await supa.from('app_users').delete().eq('id',user.id)
    const { data } = await supa.from('app_users').select('*').eq('approved',false)
    setPending(data||[])
  }

  if(!me) return <Login onLogin={login} onRegister={register}/>

  if(me.role==='gerencia') return <div style={{padding:20}}>
    <h2>Gerência</h2>
    <button onClick={loadProductions}>Recarregar</button>
    <h3>Produções</h3>
    <ul>{productions.map(p=><li key={p.id}>{p.title} – {p.status}</li>)}</ul>
    <h3>Pendentes</h3>
    <ul>{pending.map(u=><li key={u.id}>{u.username} <button onClick={()=>approveUser(u,true)}>Aprovar</button><button onClick={()=>approveUser(u,false)}>Recusar</button></li>)}</ul>
  </div>

  if(me.role==='operador') return <div style={{padding:20}}>
    <h2>Operador</h2>
    <ul>{productions.map(p=><li key={p.id}>{p.title} – {p.status}</li>)}</ul>
  </div>

  if(me.role==='consultor') return <div style={{padding:20}}>
    <h2>Consultor</h2>
    <ul>{productions.map(p=><li key={p.id}>{p.title} – {p.status}</li>)}</ul>
  </div>

  return null
}

function Login({onLogin,onRegister}){
  const [u,setU]=useState(''); const [p,setP]=useState('')
  return <div style={{padding:40}}>
    <h2>Login</h2>
    <input placeholder='Usuário' value={u} onChange={e=>setU(e.target.value)}/><br/>
    <input placeholder='Senha' type='password' value={p} onChange={e=>setP(e.target.value)}/><br/>
    <button onClick={()=>onLogin(u,p)}>Entrar</button>
    <button onClick={()=>onRegister(u,p)}>Cadastrar Operador</button>
  </div>
}
