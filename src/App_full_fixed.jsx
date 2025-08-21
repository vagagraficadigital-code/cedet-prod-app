
import React, { useState, useEffect } from 'react';
import supa from './supaClient';

function App(){
  const [me, setMe] = useState(null)
  const [productions, setProductions] = useState([])

  useEffect(()=>{
    if(me){
      loadProductions()
    }
  },[me])

  async function login(username, password){
    const { data } = await supa.client.from('app_users').select('*')
      .eq('username', username)
      .eq('password', password)
      .eq('approved', true)
    if(data?.length){
      setMe(data[0])
    } else {
      alert('Usuário ou senha inválidos ou ainda não aprovado.')
    }
  }

  async function loadProductions(){
    const { data } = await supa.client.from('productions').select('*')
    setProductions(data||[])
  }

  async function addProduction(prod){
    await supa.client.from('productions').insert(prod)
    loadProductions()
  }

  async function reorder(updated){
    setProductions(updated)
  }

  async function approveUser(user, approve){
    if(approve){
      await supa.client.from('app_users').update({ approved:true }).eq('id', user.id)
    } else {
      await supa.client.from('app_users').delete().eq('id', user.id)
    }
  }

  return (
    <div>
      {!me && <Login login={login} />}
      {me?.role==='gerencia' && (
        <Manager
          me={me}
          productions={productions}
          addProduction={addProduction}
          reorder={reorder}
          supa={supa}
          approveUser={approveUser}
        />
      )}
      {me?.role==='operador' && <Operator me={me} productions={productions} supa={supa} />}
      {me?.role==='consultor' && <Consultant productions={productions} />}
    </div>
  )
}

function Login({ login }){
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  return (
    <div className="login">
      <h2>Login</h2>
      <input placeholder="Usuário" value={username} onChange={e=>setUsername(e.target.value)} />
      <input placeholder="Senha" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
      <button onClick={()=>login(username,password)}>Entrar</button>
    </div>
  )
}

function Manager({ me, productions, addProduction, reorder, supa, approveUser }){
  const [pending, setPending] = useState([])

  useEffect(()=>{
    loadPending()
  },[])

  async function loadPending(){
    const { data } = await supa.client.from('app_users').select('*').eq('approved', false)
    setPending(data||[])
  }

  return (
    <div>
      <h2>Gerência</h2>
      <h3>Cadastros pendentes</h3>
      {pending.map(u=>(
        <div key={u.id}>
          {u.username}
          <button className="btn" onClick={async ()=>{
            await approveUser(u, true)
            const { data } = await supa.client.from('app_users').select('*').eq('approved', false)
            setPending(data||[])
            alert('Operador aprovado.')
          }}>Aprovar</button>

          <button className="btn danger" onClick={async ()=>{
            await approveUser(u, false)
            const { data } = await supa.client.from('app_users').select('*').eq('approved', false)
            setPending(data||[])
            alert('Cadastro removido.')
          }}>Recusar</button>
        </div>
      ))}
    </div>
  )
}

function Operator({ me, productions }){
  return (
    <div>
      <h2>Operador</h2>
      <p>Bem-vindo, {me.username}</p>
    </div>
  )
}

function Consultant({ productions }){
  return (
    <div>
      <h2>Consultor</h2>
      <p>Status de produção</p>
    </div>
  )
}

export default App;
