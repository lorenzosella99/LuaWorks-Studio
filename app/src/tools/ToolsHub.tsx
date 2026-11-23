import { useState } from 'react';
import { BookOpen, Braces, Calculator, Code2, File, History, Brain, Terminal } from 'lucide-react';
import CodeEditorTool from './CodeEditorTool';
import FileManagerTool from './FileManagerTool';
import FormatterTool from './FormatterTool';
import TerminalTool from './TerminalTool';
import CalculatorTool from './CalculatorTool';
import VersionHistoryTool from './VersionHistoryTool';
import KnowledgeBaseTool from './KnowledgeBaseTool';
import MythFactTool from './MythFactTool';
import './tools.css';
const tools=[{id:'editor',label:'Editor de código',icon:Code2,description:'Editar e salvar arquivos'},{id:'files',label:'Arquivos',icon:File,description:'Importar e organizar'},{id:'formatter',label:'Formatador',icon:Braces,description:'Validar e organizar código'},{id:'terminal',label:'Terminal',icon:Terminal,description:'Comandos locais seguros'},{id:'calculator',label:'Calculadora',icon:Calculator,description:'Cálculos e conversões'},{id:'versions',label:'Versões',icon:History,description:'Restaurar alterações'},{id:'knowledge',label:'Conhecimento',icon:BookOpen,description:'Documentos locais'},{id:'myth',label:'Mito ou Fato',icon:Brain,description:'Quiz e verificação por IA'}] as const;
type ToolId=typeof tools[number]['id'];
export default function ToolsHub(){const [active,setActive]=useState<ToolId>('editor');const selected=tools.find(t=>t.id===active)!;const Icon=selected.icon;return <div className="tools-hub"><div className="tools-hub-intro"><div><span className="tool-eyebrow">WORKBENCH · UTILITÁRIOS</span><h1>Ferramentas</h1><p>Seu conjunto de ferramentas para criar, organizar e testar — com armazenamento local neste dispositivo.</p></div><span className="tool-local-pill">7 LOCAIS + 1 IA</span></div><div className="tools-hub-layout"><nav className="tools-hub-nav" aria-label="Ferramentas">{tools.map(tool=>{const ItemIcon=tool.icon;return <button key={tool.id} className={'tools-hub-nav-item '+(active===tool.id?'is-active':'')} onClick={()=>setActive(tool.id)}><ItemIcon size={17}/><span><strong>{tool.label}</strong><small>{tool.description}</small></span></button>;})}</nav><div className="tools-hub-content"><div className="tools-current-label"><Icon size={15}/>{selected.label}</div>{active==='editor'?<CodeEditorTool/>:active==='files'?<FileManagerTool/>:active==='formatter'?<FormatterTool/>:active==='terminal'?<TerminalTool/>:active==='calculator'?<CalculatorTool/>:active==='versions'?<VersionHistoryTool/>:active==='knowledge'?<KnowledgeBaseTool/>:<MythFactTool/>}</div></div></div>}
