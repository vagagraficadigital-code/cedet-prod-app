
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
    const { data } = await supa.client
      .from('app_users')
      .select('*')
      .eq('approved', true)
      .ilike('username', username)
      .eq('password', password)

    if(data?.length){
      setMe(data[0])
    } else {
      alert('Usuário ou senha inválidos ou ainda não aprovado.')
    }
  }

  async function loadProductions(){
    const { data } = await supa.client.from('productions').select('*').order('id', { ascending:true })
    setProductions(data||[])
  }

  async function addProduction(prod){
    await supa.client.from('productions').insert(prod)
    loadProductions()
  }

  async function deleteProduction(id){
    await supa.client.from('productions').delete().eq('id', id)
    loadProductions()
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
          deleteProduction={deleteProduction}
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

function Manager({ me, productions, addProduction, deleteProduction, supa, approveUser }){
  const [pending, setPending] = useState([])
  const [form, setForm] = useState({ isbn:'', titulo:'', quantidade:0, paginas:0, formato:'13,9x21cm', ordem_servico:'', deadline:'' })

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
          <button onClick={async ()=>{
            await approveUser(u, true)
            loadPending()
            alert('Operador aprovado.')
          }}>Aprovar</button>

          <button onClick={async ()=>{
            await approveUser(u, false)
            loadPending()
            alert('Cadastro removido.')
          }}>Recusar</button>
        </div>
      ))}

      <h3>Nova Produção</h3>
      <input placeholder="ISBN" value={form.isbn} onChange={e=>setForm({...form,isbn:e.target.value})} />
      <input placeholder="Título" value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})} />
      <input placeholder="Quantidade" type="number" value={form.quantidade} onChange={e=>setForm({...form,quantidade:+e.target.value})} />
      <input placeholder="Nº de Páginas" type="number" value={form.paginas} onChange={e=>setForm({...form,paginas:+e.target.value})} />
      <select value={form.formato} onChange={e=>setForm({...form,formato:e.target.value})}>
        <option>11,7x17,5cm</option>
        <option>13,9x21cm</option>
        <option>15,7x23cm</option>
        <option>Tamanho especial</option>
      </select>
      <input placeholder="Ordem de Serviço" value={form.ordem_servico} onChange={e=>setForm({...form,ordem_servico:e.target.value})} />
      <input placeholder="Data de entrega" type="date" value={form.deadline} onChange={e=>setForm({...form,deadline:e.target.value})} />
      <button onClick={async ()=>{
        await addProduction(form)
        alert('Livro cadastrado.')
      }}>Cadastrar</button>

      <h3>Fila de Produção</h3>
      {productions.map(p=>(
        <div key={p.id}>
          {p.titulo} ({p.isbn}) - {p.quantidade} un.
          <button onClick={()=>deleteProduction(p.id)}>Excluir</button>
        </div>
      ))}
    </div>
  )
}

function Operator({ me, productions, supa }){
  return (
    <div>
      <h2>Operador</h2>
      <p>Bem-vindo, {me.username}</p>

      <h3>Fila de Produção</h3>
      {productions.map(p=>(
        <div key={p.id}>
          {p.titulo} ({p.isbn})
          <button onClick={async ()=>{
            await supa.client.from('events').insert({ production_id:p.id, user_id:me.id, action:'iniciar' })
            alert('Produção iniciada.')
          }}>Iniciar</button>
        </div>
      ))}
    </div>
  )
}

function Consultant({ productions }){
  return (
    <div>
      <h2>Consultor</h2>
      <p>Status de produção</p>
      {productions.map(p=>(
        <div key={p.id}>
          {p.titulo} - {p.status||'pendente'}
        </div>
      ))}
    </div>
  )
}

export default App;
