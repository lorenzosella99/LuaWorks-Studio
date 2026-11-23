import { useState, type FormEvent } from 'react';
import { Terminal } from 'lucide-react';
import { getFiles } from './localStore';
type Line = { input?: string; output: string };
export default function TerminalTool() {
  const [command,setCommand]=useState(''); const [lines,setLines]=useState<Line[]>([{output:'AI Workbench Local Shell · ambiente restrito\nDigite help para ver os comandos disponíveis.'}]);
  function execute(event: FormEvent) { event.preventDefault(); const raw=command.trim(); if(!raw)return; const [cmd,...args]=raw.split(' '); const rest=args.join(' '); let output=''; const files=getFiles();
    switch(cmd.toLowerCase()) { case 'help': output='Comandos disponíveis:\nhelp · date · pwd · ls · cat NOME · echo TEXTO · clear\nEste terminal não executa comandos do sistema operacional.'; break; case 'date': output=new Date().toLocaleString('pt-BR'); break; case 'pwd': output='/workbench/local'; break; case 'ls': output=files.length?files.map(f=>f.name).join('\n'):'(nenhum arquivo salvo)'; break; case 'cat': { const file=files.find(f=>f.name===rest); output=file?file.content:'Arquivo não encontrado. Use ls para listar.'; break; } case 'echo': output=rest; break; case 'clear': setLines([]); setCommand(''); return; default: output='Comando não reconhecido. Digite help. Não são permitidos comandos arbitrários.'; }
    setLines(current=>[...current,{input:raw,output}].slice(-80)); setCommand('');
  }
  return <section className="tool-panel"><div className="tool-panel-heading"><div><span className="tool-eyebrow">FERRAMENTA LOCAL 04</span><h2><Terminal size={19}/> Terminal integrado</h2><p>Console local com comandos internos de leitura. Não acessa o shell do sistema.</p></div><span className="tool-local-pill">RESTRITO</span></div>
    <div className="tool-terminal">{lines.map((line,i)=><div className="tool-terminal-line" key={i}>{line.input && <div><b>$</b> {line.input}</div>}<pre>{line.output}</pre></div>)}<form onSubmit={execute} className="tool-terminal-form"><b>$</b><input value={command} onChange={e=>setCommand(e.target.value)} placeholder="Digite um comando..." autoComplete="off"/><button type="submit">Executar</button></form></div>
  </section>;
}
