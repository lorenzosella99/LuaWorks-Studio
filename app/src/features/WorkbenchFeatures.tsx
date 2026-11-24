import { useEffect, useMemo, useState } from 'react';
import { Activity, Brain, Heart, Mic, MicOff, Play, Search, Send, Sparkles, Volume2, VolumeX, Workflow } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ChatMessage, ChatMode } from '../types';
import './WorkbenchFeatures.css';

type Memory = { id: string; content: string; category: string; created_at: string };
type Bond = { bond_level: number; mood: string; interaction_count: number; notes: string };
type ResearchResult = { title: string; url: string; snippet: string };
type Props = { userId: string; messages: ChatMessage[]; onSendToChat: (prompt: string, mode?: ChatMode) => void };

const emptyBond: Bond = { bond_level: 0, mood: 'neutro', interaction_count: 0, notes: '' };

export default function WorkbenchFeatures({ userId, messages, onSendToChat }: Props) {
  const [tab, setTab] = useState('memory');
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [memoryCategory, setMemoryCategory] = useState('preferencia');
  const [bond, setBond] = useState<Bond>(emptyBond);
  const [loading, setLoading] = useState(true);
  const [researchQuery, setResearchQuery] = useState('');
  const [researchResults, setResearchResults] = useState<ResearchResult[]>([]);
  const [researchAnswer, setResearchAnswer] = useState('');
  const [researchBusy, setResearchBusy] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [system, setSystem] = useState({ cores: navigator.hardwareConcurrency || null, memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory || null, online: navigator.onLine, storage: 0, used: 0 });
  const latestAssistant = [...messages].reverse().find((m) => m.role === 'assistant')?.content.replace(/!\[[^\]]*\]\([^)]*\)/g, 'imagem gerada').slice(0, 5000) || '';

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!supabase) { setLoading(false); return; }
      const [memoryResult, bondResult, storageResult] = await Promise.all([
        supabase.from('assistant_memories').select('id,content,category,created_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(100),
        supabase.from('ai_relationship_profiles').select('bond_level,mood,interaction_count,notes').eq('user_id', userId).maybeSingle(),
        navigator.storage?.estimate ? navigator.storage.estimate() : Promise.resolve({ quota: 0, usage: 0 }),
      ]);
      if (!alive) return;
      if (!memoryResult.error) setMemories((memoryResult.data || []) as Memory[]);
      if (!bondResult.error && bondResult.data) setBond(bondResult.data as Bond);
      if (!bondResult.data && !bondResult.error) {
        const seeded = await supabase.from('ai_relationship_profiles').upsert({ user_id: userId }, { onConflict: 'user_id' });
        if (seeded.error) console.warn('Não foi possível iniciar o vínculo:', seeded.error.message);
      }
      setSystem((old) => ({ ...old, storage: Number(storageResult.quota || 0), used: Number(storageResult.usage || 0) }));
      setLoading(false);
    }
    void load();
    const online = () => setSystem((s) => ({ ...s, online: navigator.onLine }));
    window.addEventListener('online', online); window.addEventListener('offline', online);
    return () => { alive = false; window.removeEventListener('online', online); window.removeEventListener('offline', online); };
  }, [userId]);

  async function addMemory() {
    const content = memoryDraft.trim();
    if (!content || !supabase) return;
    const { data, error } = await supabase.from('assistant_memories').insert({ user_id: userId, content, category: memoryCategory }).select('id,content,category,created_at').single();
    if (error) { window.alert('Não foi possível salvar: ' + error.message); return; }
    setMemories((current) => [data as Memory, ...current]); setMemoryDraft('');
  }
  async function deleteMemory(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('assistant_memories').delete().eq('id', id).eq('user_id', userId);
    if (error) { window.alert('Não foi possível excluir: ' + error.message); return; }
    setMemories((current) => current.filter((item) => item.id !== id));
  }
  async function saveBond(next: Bond) {
    setBond(next);
    if (!supabase) return;
    const { error } = await supabase.from('ai_relationship_profiles').upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) window.alert('Não foi possível salvar o vínculo: ' + error.message);
  }
  async function research() {
    if (!researchQuery.trim() || !supabase || researchBusy) return;
    setResearchBusy(true); setResearchAnswer(''); setResearchResults([]);
    const { data, error } = await supabase.functions.invoke('chat-ai', { body: { mode: 'research', query: researchQuery.trim(), messages: [{ role: 'user', content: researchQuery.trim() }] } });
    setResearchBusy(false);
    if (error || data?.error) { setResearchAnswer('A pesquisa falhou: ' + (data?.error || error?.message || 'erro desconhecido')); return; }
    setResearchAnswer(typeof data.answer === 'string' ? data.answer : '');
    setResearchResults(Array.isArray(data.sources) ? data.sources : []);
  }
  function startListening() {
    const Speech = (window as Window & { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }).SpeechRecognition
      || (window as Window & { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    if (!Speech) { window.alert('Este navegador não oferece reconhecimento de voz. Tente Chrome ou Edge.'); return; }
    const recognition = new Speech();
    recognition.lang = 'pt-BR'; recognition.interimResults = true; recognition.continuous = false;
    recognition.onresult = (event: any) => setVoiceText(Array.from(event.results).map((r: any) => r[0].transcript).join(''));
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    setListening(true); recognition.start();
  }
  function speak(text: string) {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/\x60{3}[\s\S]*?\x60{3}/g, 'bloco de código'));
    utterance.lang = 'pt-BR'; utterance.rate = 1; utterance.onend = () => setSpeaking(false);
    setSpeaking(true); window.speechSynthesis.speak(utterance);
  }
  const storagePercent = system.storage ? Math.min(100, Math.round(system.used / system.storage * 100)) : 0;
  const tabs = [{ id: 'memory', label: 'Memória', icon: Brain }, { id: 'voice', label: 'Voz', icon: Mic }, { id: 'agent', label: 'Agente', icon: Workflow }, { id: 'research', label: 'Pesquisa', icon: Search }, { id: 'system', label: 'Sistema', icon: Activity }, { id: 'bond', label: 'Vínculo', icon: Heart }];
  const agentPrompt = 'Atue como meu agente de trabalho. Primeiro, transforme meu objetivo em um plano curto e ordenado. Depois execute cada etapa que puder realizar nesta conversa, explique claramente o que depende de acesso externo ou da minha confirmação e valide o resultado sem afirmar que executou ações que não realizou. Objetivo: ';
  return <section className="features-page">
    <div className="features-heading"><span>AI WORKBENCH · LAB</span><h1>Recursos inteligentes</h1><p>Memória, voz, agente, pesquisa, monitoramento e vínculo com sua personagem.</p></div>
    <nav className="features-tabs">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={15}/>{label}</button>)}</nav>
    <div className="features-panel">
      {tab === 'memory' && <div className="feature-section"><h2><Brain/> Memória inteligente</h2><p>Adicione fatos úteis que a IA pode considerar nas próximas conversas. Os registros ficam na sua conta e sincronizam entre dispositivos.</p>
        <textarea value={memoryDraft} onChange={(e) => setMemoryDraft(e.target.value)} maxLength={1200} placeholder="Ex.: Estou desenvolvendo o AI Workbench com React e Supabase."/>
        <div className="feature-inline"><select value={memoryCategory} onChange={(e) => setMemoryCategory(e.target.value)}><option value="preferencia">Preferência</option><option value="projeto">Projeto</option><option value="pessoa">Pessoa</option><option value="rotina">Rotina</option><option value="outro">Outro</option></select><button onClick={() => void addMemory()} disabled={!memoryDraft.trim()}>Salvar memória</button></div>
        {loading ? <p>Carregando memórias…</p> : <div className="memory-list">{memories.map((m) => <article key={m.id}><div><small>{m.category}</small><p>{m.content}</p></div><button onClick={() => void deleteMemory(m.id)}>Excluir</button></article>)}{!memories.length && <p>Nenhuma memória salva ainda.</p>}</div>}
      </div>}
      {tab === 'voice' && <div className="feature-section"><h2><Mic/> Voz e conversação</h2><p>Use a fala para preencher o chat ou ouça a resposta mais recente. O reconhecimento depende do suporte do navegador e pode pedir permissão para o microfone.</p>
        <textarea value={voiceText} onChange={(e) => setVoiceText(e.target.value)} placeholder="O texto reconhecido aparecerá aqui…"/>
        <div className="feature-actions"><button onClick={startListening} disabled={listening}>{listening ? <MicOff/> : <Mic/>}{listening ? 'Ouvindo…' : 'Falar'}</button><button onClick={() => onSendToChat(voiceText)} disabled={!voiceText.trim()}><Send/> Enviar ao chat</button><button onClick={() => speaking ? (window.speechSynthesis.cancel(), setSpeaking(false)) : speak(latestAssistant)} disabled={!latestAssistant}><Volume2/> {speaking ? 'Parar áudio' : 'Ouvir última resposta'}</button></div>
        <small>O áudio é processado pelas APIs de voz do navegador; não é gravado pelo Workbench.</small>
      </div>}
      {tab === 'agent' && <div className="feature-section"><h2><Workflow/> Modo agente</h2><p>Descreva um objetivo. A IA receberá instruções para planejar etapas, avançar com o que estiver disponível e separar ações que exigem sua autorização.</p>
        <textarea value={voiceText} onChange={(e) => setVoiceText(e.target.value)} placeholder="Ex.: Analise meu projeto, encontre erros e proponha uma correção segura…"/>
        <button onClick={() => { onSendToChat(agentPrompt + voiceText.trim(), 'agent'); setVoiceText(''); }} disabled={!voiceText.trim()}><Play/> Iniciar tarefa no chat</button>
        <small>O agente não controla o computador sozinho nem executa ações externas sem integração e confirmação.</small>
      </div>}
      {tab === 'research' && <div className="feature-section"><h2><Search/> Pesquisa com fontes</h2><p>Pesquise na web e receba uma síntese acompanhada dos links consultados.</p>
        <div className="feature-search"><input value={researchQuery} onChange={(e) => setResearchQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void research(); }} placeholder="O que você quer pesquisar?"/><button onClick={() => void research()} disabled={researchBusy || !researchQuery.trim()}>{researchBusy ? 'Pesquisando…' : 'Pesquisar'}</button></div>
        {researchAnswer && <div className="research-answer">{researchAnswer}</div>}
        {researchResults.map((r, i) => <a className="research-source" key={r.url + i} href={r.url} target="_blank" rel="noreferrer"><strong>{r.title}</strong><span>{r.snippet}</span><small>{r.url}</small></a>)}
      </div>}
      {tab === 'system' && <div className="feature-section"><h2><Activity/> Monitor de sistema</h2><p>Indicadores disponibilizados pelo navegador. Temperatura, processos e uso real de CPU/RAM do sistema operacional exigem um agente nativo e não são expostos por uma página web comum.</p>
        <div className="system-grid"><article><small>Processadores lógicos</small><strong>{system.cores ?? 'Indisponível'}</strong></article><article><small>Memória estimada do dispositivo</small><strong>{system.memory ? system.memory + ' GB' : 'Indisponível'}</strong></article><article><small>Conexão</small><strong>{system.online ? 'Online' : 'Offline'}</strong></article><article><small>Armazenamento do site usado</small><strong>{system.used ? (system.used / 1048576).toFixed(1) + ' MB' : 'Indisponível'}</strong></article></div>
        <div className="system-meter"><div><span>Quota estimada do armazenamento web</span><b>{storagePercent}%</b></div><i><span style={{ width: storagePercent + '%' }}/></i></div>
        <button onClick={() => void navigator.storage?.estimate().then((v) => setSystem((s) => ({ ...s, storage: v.quota || 0, used: v.usage || 0 })))}>Atualizar indicadores</button>
      </div>}
      {tab === 'bond' && <div className="feature-section"><h2><Heart/> Sistema de vínculo com a IA</h2><p>Um perfil lúdico de relacionamento para acompanhar interações e humor da personagem. Não altera automaticamente a personalidade nem representa sentimentos reais.</p>
        <div className="bond-score"><strong>{bond.bond_level}/100</strong><span>Nível de vínculo</span></div><input type="range" min="0" max="100" value={bond.bond_level} onChange={(e) => void saveBond({ ...bond, bond_level: Number(e.target.value) })}/>
        <label>Humor atual<select value={bond.mood} onChange={(e) => void saveBond({ ...bond, mood: e.target.value })}><option value="neutro">Neutro</option><option value="feliz">Feliz</option><option value="animada">Animada</option><option value="calma">Calma</option><option value="brincalhona">Brincalhona</option><option value="irritada">Irritada</option></select></label>
        <label>Notas da personagem<textarea value={bond.notes} maxLength={1200} onChange={(e) => setBond({ ...bond, notes: e.target.value })} onBlur={() => void saveBond(bond)} placeholder="Ex.: prefere humor sarcástico e conversas curtas."/></label>
        <small>Interações registradas: {bond.interaction_count}. O nível e o humor são configurados por você.</small>
      </div>}
    </div>
  </section>;
}
