import { useRef, useState } from 'react';
import { File, FilePlus2, Download, Trash2, Upload } from 'lucide-react';
import { downloadText, getFiles, makeId, removeFile, saveFile, type LocalFile } from './localStore';
export default function FileManagerTool() {
  const [files, setFiles] = useState<LocalFile[]>(getFiles);
  const input = useRef<HTMLInputElement>(null);
  async function importFiles(list: FileList | null) { if (!list) return; for (const file of Array.from(list)) { if (file.size > 2_000_000) continue; const content = await file.text(); const ext = file.name.split('.').pop()?.toLowerCase() || 'text'; setFiles(saveFile({ id: makeId(), name: file.name, content, language: ext, updatedAt: new Date().toISOString() })); } }
  return <section className="tool-panel"><div className="tool-panel-heading"><div><span className="tool-eyebrow">FERRAMENTA LOCAL 02</span><h2><File size={19}/> Gerenciador de arquivos</h2><p>Importe, organize, baixe e remova arquivos armazenados localmente.</p></div><span className="tool-local-pill">OFFLINE</span></div>
    <div className="tool-toolbar"><button className="tool-button tool-button-primary" onClick={() => input.current?.click()}><Upload size={14}/> Importar arquivos</button><input ref={input} type="file" multiple hidden onChange={e => { void importFiles(e.target.files); e.currentTarget.value=''; }}/><span className="tool-muted">Limite de 2 MB por arquivo · texto e código</span></div>
    <div className="tool-file-list">{files.length ? files.map(file => <div className="tool-file-row" key={file.id}><File size={17}/><div><strong>{file.name}</strong><small>{file.language.toUpperCase()} · {file.content.length.toLocaleString('pt-BR')} caracteres · {new Date(file.updatedAt).toLocaleString('pt-BR')}</small></div><button className="tool-icon-button" onClick={() => downloadText(file.name,file.content)} title="Baixar"><Download size={15}/></button><button className="tool-icon-button tool-danger" onClick={() => setFiles(removeFile(file.id))} title="Excluir"><Trash2 size={15}/></button></div>) : <div className="tool-empty"><FilePlus2 size={25}/><strong>Nenhum arquivo local</strong><span>Importe um arquivo ou crie um no Editor de código.</span></div>}</div>
  </section>;
}
