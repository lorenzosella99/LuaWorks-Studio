import { useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Clipboard, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';
import { checkLua } from '../lib/luaCheck';

const starter = `function onTick()\n    local velocidade = input.getNumber(1)\n    local ativo = input.getBool(1)\n\n    output.setNumber(1, velocidade)\n    output.setBool(1, ativo)\nend\n\nfunction onDraw()\n    screen.drawText(2, 2, "Stormworks")\nend`;

export default function LuaValidator() {
  const [code, setCode] = useState(starter);
  const [checked, setChecked] = useState(false);
  const result = useMemo(() => checkLua(code), [code]);
  const errorCount = result.findings.filter((item) => item.level === 'error').length;
  const warningCount = result.findings.filter((item) => item.level === 'warning').length;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const area = document.querySelector<HTMLTextAreaElement>('.lua-editor');
      area?.select();
      document.execCommand('copy');
    }
  }

  return (
    <section className="lua-validator-page">
      <div className="lua-page-heading">
        <div>
          <span className="mode-eyebrow">FERRAMENTA LOCAL · SEM CHAVE DE IA</span>
          <h1>Validador <span>Lua</span></h1>
          <p>Verifique limites, blocos, delimitadores e APIs incompatíveis com Stormworks vanilla diretamente no dispositivo.</p>
        </div>
        <div className="lua-local-badge"><span /> Análise no dispositivo</div>
      </div>

      <div className="lua-validator-grid">
        <div className="lua-editor-card">
          <div className="lua-card-toolbar">
            <div><span className="lua-file-icon">{`{ }`}</span><strong>script.lua</strong><span className="lua-language">LUA</span></div>
            <span className={`lua-counter ${result.characters > 4096 ? 'lua-counter--over' : ''}`}>{result.characters.toLocaleString('pt-BR')} / 4.096</span>
          </div>
          <textarea className="lua-editor" spellCheck={false} value={code} onChange={(event) => { setCode(event.target.value); setChecked(false); }} aria-label="Código Lua para validar" />
          <div className="lua-editor-actions">
            <button className="secondary-button" type="button" onClick={() => { setCode(''); setChecked(false); }}><RotateCcw size={14} /> Limpar</button>
            <button className="secondary-button" type="button" onClick={() => void copyCode()}><Clipboard size={14} /> Copiar código</button>
            <button className="primary-button" type="button" onClick={() => setChecked(true)} disabled={!code.trim()}><ShieldCheck size={15} /> Analisar Lua</button>
          </div>
        </div>

        <aside className="lua-results-card">
          <div className="lua-results-heading"><div><span className="mode-eyebrow">RESULTADO</span><h2>{checked ? (errorCount ? 'Precisa de ajustes' : 'Análise concluída') : 'Pronto para analisar'}</h2></div><span className={`lua-result-symbol ${errorCount ? 'lua-result-symbol--error' : checked ? 'lua-result-symbol--ok' : ''}`}>{errorCount ? <XCircle size={20} /> : checked ? <CheckCircle2 size={20} /> : <ShieldCheck size={20} />}</span></div>
          <div className="lua-stat-row">
            <div className="lua-stat"><strong>{result.characters.toLocaleString('pt-BR')}</strong><span>caracteres</span></div>
            <div className="lua-stat"><strong className={errorCount ? 'lua-stat-error' : ''}>{errorCount}</strong><span>erros</span></div>
            <div className="lua-stat"><strong className={warningCount ? 'lua-stat-warning' : ''}>{warningCount}</strong><span>avisos</span></div>
          </div>
          <div className="lua-findings">
            {!checked ? <div className="lua-empty-result"><ShieldCheck size={21} /><span>Clique em <strong>Analisar Lua</strong> para executar a verificação.</span></div> : result.findings.map((finding, index) => (
              <div className={`lua-finding lua-finding--${finding.level}`} key={`${finding.title}-${index}`}>
                <span className="lua-finding-icon">{finding.level === 'error' ? <XCircle size={15} /> : finding.level === 'warning' ? <AlertTriangle size={15} /> : <Check size={15} />}</span>
                <div><strong>{finding.title}</strong><p>{finding.detail}</p></div>
              </div>
            ))}
          </div>
          <div className="lua-disclaimer"><AlertTriangle size={14} /><span>Esta análise é estática. Ela não executa o código nem garante que todas as APIs e a lógica estejam corretas dentro do jogo.</span></div>
        </aside>
      </div>
      <div className="lua-method-note"><ShieldCheck size={16} /><span><strong>Privacidade:</strong> o código digitado nesta ferramenta permanece no navegador e não é enviado para uma API de IA.</span></div>
    </section>
  );
}
