import { useEffect, useState } from 'react';
import { Code2, Download, Save } from 'lucide-react';
import { addVersion, downloadText, getFiles, makeId, saveFile, type LocalFile } from './localStore';
export default function CodeEditorTool() {
  const [files, setFiles] = useState<LocalFile[]>(getFiles);
  const [activeId, setActiveId] = useState<string>(() => getFiles()[0]?.id ?? '');
  const [name, setName] = useState('script.lua');
  const [language, setLanguage] = useState('lua');
  const [code, setCode] = useState('-- Seu código começa aqui\n');
  const [saved, setSaved] = useState(true);
  useEffect(() => { const active = files.find(file => file.id === activeId); if (active) { setName(active.name); setLanguage(active.language); setCode(active.content); setSaved(true); } }, [activeId]);
  function save() { const id = activeId || makeId(); const file = { id, name: name.trim() || 'sem-nome.txt', language, content: code, updatedAt: new Date().toISOString() }; setFiles(saveFile(file)); setActiveId(id); addVersion({ id: makeId(), fileId: id, fileName: file.name, content: code, createdAt: file.updatedAt }); setSaved(true); }
  function create() { setActiveId(''); setName('novo-arquivo.lua'); setLanguage('lua'); setCode(''); setSaved(false); }
  return <section className="tool-panel"><div className="tool-panel-heading"><div><span className="tool-eyebrow">FERRAMENTA LOCAL 01</span><h2><Code2 size={19}/> Editor de código</h2><p>Edite arquivos diretamente no navegador. O conteúdo fica salvo neste dispositivo.</p></div><span className="tool-local-pill">OFFLINE</span></div>
    <div className="tool-editor-toolbar"><select value={activeId} onChange={e => setActiveId(e.target.value)}><option value="">Arquivo novo</option>{files.map(file => <option key={file.id} value={file.id}>{file.name}</option>)}</select><input value={name} onChange={e => { setName(e.target.value); setSaved(false); }} aria-label="Nome do arquivo"/><select value={language} onChange={e => { setLanguage(e.target.value); setSaved(false); }}><option value="lua">Lua</option><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="python">Python</option><option value="html">HTML</option><option value="css">CSS</option><option value="json">JSON</option><option value="sql">SQL</option><option value="text">Texto</option></select><button className="tool-button" onClick={create}>Novo</button><button className="tool-button tool-button-primary" onClick={save}><Save size={14}/> Salvar</button><button className="tool-icon-button" onClick={() => downloadText(name, code)} title="Baixar arquivo"><Download size={15}/></button></div>
    <textarea className="tool-code-editor" spellCheck={false} value={code} onChange={e => { setCode(e.target.value); setSaved(false); }} aria-label="Editor de código"/>
    <div className="tool-status-line"><span>{language.toUpperCase()} · {code.length.toLocaleString('pt-BR')} caracteres</span><span>{saved ? 'Salvo neste dispositivo' : 'Alterações não salvas'}</span></div>
  </section>;
}
