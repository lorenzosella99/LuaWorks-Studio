export type LuaFinding = {
  level: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
};

export type LuaCheckResult = {
  characters: number;
  findings: LuaFinding[];
  blockedApis: string[];
  hasErrors: boolean;
};

function maskCommentsAndStrings(source: string): string {
  const chars = source.split('');
  const blank = (start: number, end: number) => {
    for (let i = start; i < end; i += 1) if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
  };
  const longBracketEnd = (start: number): { contentStart: number; close: string } | null => {
    if (chars[start] !== '[') return null;
    let cursor = start + 1;
    while (chars[cursor] === '=') cursor += 1;
    if (chars[cursor] !== '[') return null;
    return { contentStart: cursor + 1, close: `]${'='.repeat(cursor - start - 1)}]` };
  };

  let i = 0;
  while (i < chars.length) {
    if (chars[i] === '-' && chars[i + 1] === '-') {
      const longComment = longBracketEnd(i + 2);
      if (longComment) {
        const closeAt = source.indexOf(longComment.close, longComment.contentStart);
        const end = closeAt < 0 ? chars.length : closeAt + longComment.close.length;
        blank(i, end);
        i = end;
      } else {
        let end = i;
        while (end < chars.length && chars[end] !== '\n') end += 1;
        blank(i, end);
        i = end;
      }
      continue;
    }

    if (chars[i] === '"' || chars[i] === "'") {
      const quote = chars[i];
      let end = i + 1;
      while (end < chars.length) {
        if (chars[end] === '\\') { end += 2; continue; }
        if (chars[end] === quote) { end += 1; break; }
        end += 1;
      }
      blank(i, Math.min(end, chars.length));
      i = end;
      continue;
    }

    const longString = longBracketEnd(i);
    if (longString) {
      const closeAt = source.indexOf(longString.close, longString.contentStart);
      const end = closeAt < 0 ? chars.length : closeAt + longString.close.length;
      blank(i, end);
      i = end;
      continue;
    }
    i += 1;
  }
  return chars.join('');
}

export function checkLua(source: string): LuaCheckResult {
  const code = source ?? '';
  const masked = maskCommentsAndStrings(code);
  const characters = Array.from(code).length;
  const findings: LuaFinding[] = [];
  const blockedApis = new Set<string>();

  if (characters > 4096) {
    findings.push({ level: 'error', title: 'Limite excedido', detail: `O bloco tem ${characters.toLocaleString('pt-BR')} caracteres; o máximo é 4.096.` });
  } else {
    findings.push({ level: 'info', title: 'Tamanho dentro do limite', detail: `${characters.toLocaleString('pt-BR')} de 4.096 caracteres.` });
  }

  const blockedPatterns: Array<[string, RegExp]> = [
    ['os', /\bos\s*[.:]/i],
    ['io', /\bio\s*[.:]/i],
    ['package', /\bpackage\s*[.:]/i],
    ['debug', /\bdebug\s*[.:]/i],
    ['require()', /\brequire\s*\(/i],
    ['dofile()', /\bdofile\s*\(/i],
    ['loadfile()', /\bloadfile\s*\(/i],
  ];
  for (const [name, pattern] of blockedPatterns) {
    if (pattern.test(masked)) blockedApis.add(name);
  }
  if (blockedApis.size) {
    findings.push({ level: 'error', title: 'API fora do ambiente vanilla', detail: `Remova: ${[...blockedApis].join(', ')}.` });
  } else {
    findings.push({ level: 'info', title: 'Nenhuma API proibida detectada', detail: 'Não foram encontrados os, io, package, debug ou carregadores externos.' });
  }

  const delimiterStack: Array<{ char: string; index: number }> = [];
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  for (let i = 0; i < masked.length; i += 1) {
    const char = masked[i];
    if (char === '(' || char === '[' || char === '{') delimiterStack.push({ char, index: i });
    if (char === ')' || char === ']' || char === '}') {
      const last = delimiterStack.pop();
      if (!last || last.char !== pairs[char]) {
        findings.push({ level: 'error', title: 'Parênteses ou delimitadores incompatíveis', detail: `Delimitador inesperado "${char}" próximo da posição ${i + 1}.` });
        break;
      }
    }
  }
  if (delimiterStack.length) {
    const last = delimiterStack[delimiterStack.length - 1];
    findings.push({ level: 'error', title: 'Delimitador não fechado', detail: `O caractere "${last.char}" na posição ${last.index + 1} não foi fechado.` });
  }

  const blockStack: Array<{ kind: 'function' | 'if' | 'do' | 'repeat'; index: number }> = [];
  const tokens = [...masked.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)];
  let blockError = false;
  for (const token of tokens) {
    const word = token[0].toLowerCase();
    const index = token.index ?? 0;
    if (word === 'function' || word === 'if' || word === 'do' || word === 'repeat') {
      blockStack.push({ kind: word, index });
    } else if (word === 'end') {
      const last = blockStack[blockStack.length - 1];
      if (!last || last.kind === 'repeat') {
        findings.push({ level: 'error', title: 'Bloco Lua inesperado', detail: `"end" sem bloco correspondente próximo da posição ${index + 1}.` });
        blockError = true;
        break;
      }
      blockStack.pop();
    } else if (word === 'until') {
      const last = blockStack[blockStack.length - 1];
      if (!last || last.kind !== 'repeat') {
        findings.push({ level: 'error', title: 'Bloco repeat/until incompatível', detail: `"until" sem "repeat" correspondente próximo da posição ${index + 1}.` });
        blockError = true;
        break;
      }
      blockStack.pop();
    }
  }
  if (!blockError && blockStack.length) {
    const last = blockStack[blockStack.length - 1];
    findings.push({ level: 'error', title: 'Bloco Lua não fechado', detail: `Falta fechar "${last.kind}" iniciado próximo da posição ${last.index + 1}.` });
  }

  if (/\/[ \t]*0+(?:\.0*)?(?![\d.])/u.test(masked)) {
    findings.push({ level: 'warning', title: 'Possível divisão por zero', detail: 'Foi encontrada uma divisão por um literal zero. Confira o divisor antes de dividir.' });
  }

  const channelPattern = /\b(?:input\.(?:getNumber|getBool)|output\.setNumber|output\.setBool)\s*\(\s*(-?\d+)/gi;
  for (const match of masked.matchAll(channelPattern)) {
    const channel = Number(match[1]);
    if (channel < 1 || channel > 32) {
      findings.push({ level: 'warning', title: 'Canal fora da faixa habitual', detail: `Foi encontrado o canal ${channel}; confira se o número está entre 1 e 32.` });
      break;
    }
  }

  if (!/\bfunction\s+onTick\s*\(/.test(masked) && !/\bfunction\s+onDraw\s*\(/.test(masked)) {
    findings.push({ level: 'warning', title: 'Callback não identificado', detail: 'Não encontrei onTick() nem onDraw(). Confirme se este trecho é um microcontrolador completo.' });
  }

  if (!findings.some((finding) => finding.level === 'error')) {
    findings.push({ level: 'info', title: 'Estrutura básica aprovada', detail: 'Delimitadores e blocos function/if/do/repeat parecem estar equilibrados.' });
  }

  return { characters, findings, blockedApis: [...blockedApis], hasErrors: findings.some((finding) => finding.level === 'error') };
}
