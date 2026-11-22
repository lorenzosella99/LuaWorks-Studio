import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { CSSProperties } from 'react';
import {
  ArrowDown, ArrowUp, Bot, Check, ChevronDown, Code2, Download, Github, Image as ImageIcon,
  LogOut, Menu, MessageSquare, MessageCircleHeart, Monitor, Package, Plus, Settings2, SlidersHorizontal, Smartphone, Sparkles, Trash2, X, Zap, Wrench,
} from 'lucide-react';
import MarkdownMessage from './components/MarkdownMessage';
import LuaValidator from './components/LuaValidator';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import type { ChatMessage, ChatMode, Conversation } from './types';

const ALLOWED_EMAIL = 'lorenzosella99@gmail.com';
const ALLOWED_USERNAME = 'loren';

type ApiProbe = { id: string; title: string; status: 'idle' | 'running' | 'ok' | 'error'; detail: string };
type EffortLevel = 'low' | 'medium' | 'ultra';
type EffortSettings = { general: EffortLevel; stormworks: EffortLevel; personality: EffortLevel };

const DEFAULT_EFFORTS: EffortSettings = { general: 'medium', stormworks: 'medium', personality: 'medium' };
const EFFORT_STORAGE_KEY = 'ai-workbench-effort-v1';

function loadEffortSettings(): EffortSettings {
  if (typeof window === 'undefined') return DEFAULT_EFFORTS;
  try {
    const saved = window.localStorage.getItem(EFFORT_STORAGE_KEY);
    if (!saved) return DEFAULT_EFFORTS;
    const value = JSON.parse(saved) as Partial<EffortSettings>;
    const valid = (item: unknown): item is EffortLevel => item === 'low' || item === 'medium' || item === 'ultra';
    return {
      general: valid(value.general) ? value.general : DEFAULT_EFFORTS.general,
      stormworks: valid(value.stormworks) ? value.stormworks : DEFAULT_EFFORTS.stormworks,
      personality: valid(value.personality) ? value.personality : DEFAULT_EFFORTS.personality,
    };
  } catch {
    return DEFAULT_EFFORTS;
  }
}

type AppearanceSettings = {
  pageWidth: 'compact' | 'standard' | 'wide' | 'full';
  primaryColor: string;
  secondaryColor: string;
};

const DEFAULT_APPEARANCE: AppearanceSettings = {
  pageWidth: 'standard',
  primaryColor: '#D9F99D',
  secondaryColor: '#8ED7CE',
};

const APPEARANCE_STORAGE_KEY = 'ai-workbench-appearance-v1';

function loadAppearanceSettings(): AppearanceSettings {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE;
  try {
    const saved = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!saved) return DEFAULT_APPEARANCE;
    const value = JSON.parse(saved) as Partial<AppearanceSettings>;
    const validWidths: AppearanceSettings['pageWidth'][] = ['compact', 'standard', 'wide', 'full'];
    const isColor = (color: unknown): color is string => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
    return {
      pageWidth: validWidths.includes(value.pageWidth as AppearanceSettings['pageWidth']) ? value.pageWidth as AppearanceSettings['pageWidth'] : DEFAULT_APPEARANCE.pageWidth,
      primaryColor: isColor(value.primaryColor) ? value.primaryColor.toUpperCase() : DEFAULT_APPEARANCE.primaryColor,
      secondaryColor: isColor(value.secondaryColor) ? value.secondaryColor.toUpperCase() : DEFAULT_APPEARANCE.secondaryColor,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

function readableAccentInk(hex: string) {
  const value = hex.replace('#', '');
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 150 ? '#17210F' : '#FFFFFF';
}


function isAllowedAccount(user: User | null | undefined) {
  return Boolean(user && user.email?.trim().toLowerCase() === ALLOWED_EMAIL);
}

function getWelcomeCopy(user: User | null, date: Date) {
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const configuredName = [metadata.full_name, metadata.name, metadata.display_name, metadata.username]
    .find((value) => typeof value === 'string' && value.trim().length > 0);
  const fallbackName = user?.email?.toLowerCase() === ALLOWED_EMAIL ? 'Lorenzo' : ALLOWED_USERNAME;
  const rawName = typeof configuredName === 'string' ? configuredName : fallbackName;
  const name = rawName.trim().split(/\s+/)[0] || 'amigo';

  const hour = date.getHours();
  const motivationalLines = [
    'Uma boa ideia pode ser o começo de algo incrível.',
    'Não precisa sair perfeito de primeira. O importante é começar.',
    'Cada pequeno avanço também conta.',
    'Sua curiosidade pode transformar uma ideia em algo real.',
    'Erros fazem parte do caminho de quem está aprendendo e criando.',
    'Continue tentando: seu próximo projeto pode nascer hoje.',
    'Um passo de cada vez ainda é progresso.',
    'Tire uma ideia do papel e descubra até onde ela pode chegar.',
  ];
  const encouragement = motivationalLines[(date.getDate() + hour) % motivationalLines.length];

  if (hour < 6) {
    return { title: `Madrugando, ${name}?`, subtitle: 'As ideias também aparecem de madrugada. Vamos construir algo legal?', encouragement };
  }
  if (hour < 12) {
    return { title: `Bom dia, ${name}!`, subtitle: 'Que tal começar o dia tirando uma ideia do papel?', encouragement };
  }
  if (hour < 18) {
    return { title: `Boa tarde, ${name}!`, subtitle: 'Ainda dá tempo de transformar aquela ideia em projeto.', encouragement };
  }
  return { title: `Boa noite, ${name}!`, subtitle: 'Feche o dia criando algo de que você possa se orgulhar.', encouragement };
}

function AppearanceSettingsPanel({ value, onSave }: { value: AppearanceSettings; onSave: (next: AppearanceSettings) => void }) {
  const [pageWidth, setPageWidth] = useState<AppearanceSettings['pageWidth']>(value.pageWidth);
  const [preview, setPreview] = useState<{ primaryColor: string; secondaryColor: string } | null>(null);
  const primaryInputRef = useRef<HTMLInputElement>(null);
  const secondaryInputRef = useRef<HTMLInputElement>(null);
  const primaryHexRef = useRef<HTMLOutputElement>(null);
  const secondaryHexRef = useRef<HTMLOutputElement>(null);

  const currentColors = () => ({
    primaryColor: primaryInputRef.current?.value.toUpperCase() ?? value.primaryColor,
    secondaryColor: secondaryInputRef.current?.value.toUpperCase() ?? value.secondaryColor,
  });
  const updateHex = (input: HTMLInputElement, output: HTMLOutputElement | null) => {
    if (output) output.textContent = input.value.toUpperCase();
  };
  const resetDraft = () => {
    setPageWidth(DEFAULT_APPEARANCE.pageWidth);
    if (primaryInputRef.current) primaryInputRef.current.value = DEFAULT_APPEARANCE.primaryColor;
    if (secondaryInputRef.current) secondaryInputRef.current.value = DEFAULT_APPEARANCE.secondaryColor;
    if (primaryInputRef.current) updateHex(primaryInputRef.current, primaryHexRef.current);
    if (secondaryInputRef.current) updateHex(secondaryInputRef.current, secondaryHexRef.current);
    setPreview(null);
  };
  const showPreview = () => setPreview(currentColors());
  const saveDraft = () => onSave({ pageWidth, ...currentColors() });

  return (
    <div className="settings-section appearance-section">
      <div className="settings-section-title"><Sparkles size={17} /> Aparência</div>
      <p>Personalize a largura e as cores. Os ajustes ficam em rascunho até você salvar.</p>
      <div className="appearance-control-group">
        <div className="appearance-control-heading"><strong>Tamanho da página</strong><span>largura do conteúdo</span></div>
        <div className="appearance-width-options" role="group" aria-label="Largura da página">
          {([
            ['compact', 'Compacto'],
            ['standard', 'Padrão'],
            ['wide', 'Amplo'],
            ['full', 'Total'],
          ] as const).map(([width, label]) => (
            <button key={width} type="button" className={'appearance-width-option' + (pageWidth === width ? ' appearance-width-option--active' : '')} aria-pressed={pageWidth === width} onClick={() => setPageWidth(width)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="appearance-control-group">
        <div className="appearance-control-heading"><strong>Paleta de cores</strong><span>prévia antes de salvar</span></div>
        <div className="appearance-color-grid">
          <label className="appearance-color-control">
            <span>Cor primária</span>
            <div className="appearance-color-input">
              <input ref={primaryInputRef} type="color" defaultValue={value.primaryColor} onInput={(event) => updateHex(event.currentTarget, primaryHexRef.current)} aria-label="Escolher cor primária" />
              <output ref={primaryHexRef}>{value.primaryColor}</output>
            </div>
          </label>
          <label className="appearance-color-control">
            <span>Cor secundária</span>
            <div className="appearance-color-input">
              <input ref={secondaryInputRef} type="color" defaultValue={value.secondaryColor} onInput={(event) => updateHex(event.currentTarget, secondaryHexRef.current)} aria-label="Escolher cor secundária" />
              <output ref={secondaryHexRef}>{value.secondaryColor}</output>
            </div>
          </label>
        </div>
      </div>
      <div className="appearance-preview-actions">
        <button className="secondary-button" type="button" onClick={showPreview}><Sparkles size={13} /> {preview ? 'Atualizar prévia' : 'Prévia rápida'}</button>
        <span>Não altera o restante da tela</span>
      </div>
      {preview && (
        <div className="appearance-preview-wrap">
          <div className="appearance-preview" style={{
            '--accent': preview.primaryColor,
            '--accent-ink': readableAccentInk(preview.primaryColor),
            '--secondary': preview.secondaryColor,
            background: `linear-gradient(118deg, ${preview.primaryColor} 0%, color-mix(in srgb, ${preview.primaryColor} 48%, ${preview.secondaryColor}) 52%, ${preview.secondaryColor} 100%)`,
          } as CSSProperties}>
            <div className="appearance-preview-content">
              <span className="appearance-preview-mark"><Sparkles size={14} /></span>
              <strong>AI Workbench</strong>
              <small>Primária + secundária</small>
            </div>
          </div>
        </div>
      )}
      <div className="appearance-save-actions">
        <button className="appearance-reset" type="button" onClick={resetDraft}>Restaurar padrão</button>
        <button className="primary-button" type="button" onClick={saveDraft}><Check size={14} /> Salvar aparência</button>
      </div>
    </div>
  );
}

const modes: Array<{ id: ChatMode; label: string; short: string; description: string }> = [
  { id: 'auto', label: 'Automático', short: 'Auto', description: 'A IA escolhe o modo mais adequado para cada pedido' },
  { id: 'general', label: 'Código Geral', short: 'Código', description: 'TypeScript, Python, SQL e web' },
  { id: 'stormworks', label: 'Lua · Stormworks', short: 'Stormworks', description: 'Lua vanilla · revisão e validação de código' },
  { id: 'image', label: 'Gerar Imagem', short: 'Imagem', description: 'Criação visual a partir de descrições' },
  { id: 'personality', label: 'Personalidade', short: 'Persona', description: 'Converse com o estilo e personalidade que você definir' },
];

function formatDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function getDefaultFile(language: string) {
  const map: Record<string, string> = {
    ts: 'src/generated.ts', typescript: 'src/generated.ts', tsx: 'src/Generated.tsx',
    js: 'src/generated.js', javascript: 'src/generated.js', py: 'generated.py', python: 'generated.py',
    lua: 'script.lua', sql: 'query.sql', html: 'index.html', css: 'styles.css', json: 'config.json',
    bash: 'script.sh', sh: 'script.sh',
  };
  return map[language.toLowerCase()] ?? 'generated-code.txt';
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [loginUsername, setLoginUsername] = useState(ALLOWED_USERNAME);
  const [loginPassword, setLoginPassword] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [view, setView] = useState<'chat' | 'lua-validator'>('chat');
  const [mode, setMode] = useState<ChatMode>('auto');
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [effortByMode, setEffortByMode] = useState<EffortSettings>(() => loadEffortSettings());
  const [draft, setDraft] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appearance, setAppearance] = useState<AppearanceSettings>(() => loadAppearanceSettings());
  const [githubStatus, setGithubStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading');
  const [apiProbes, setApiProbes] = useState<ApiProbe[]>([]);
  const [apiTestBusy, setApiTestBusy] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [githubBusy, setGithubBusy] = useState(false);
  const [saveModal, setSaveModal] = useState<{ code: string; language: string } | null>(null);
  const [repo, setRepo] = useState('');
  const [filePath, setFilePath] = useState('');
  const [commitMessage, setCommitMessage] = useState('Adicionar código gerado');
  const [saveBusy, setSaveBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [welcomeTime, setWelcomeTime] = useState(() => new Date());

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const currentMode = modes.find((item) => item.id === mode) ?? modes[0];
  const welcomeCopy = getWelcomeCopy(session?.user ?? null, welcomeTime);

  useEffect(() => {
    const timer = window.setInterval(() => setWelcomeTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(EFFORT_STORAGE_KEY, JSON.stringify(effortByMode));
    } catch {
      // As preferências continuam ativas durante esta sessão.
    }
  }, [effortByMode]);

  useEffect(() => {
    const root = document.documentElement;
    const pageWidths: Record<AppearanceSettings['pageWidth'], string> = {
      compact: '680px',
      standard: '850px',
      wide: '1120px',
      full: '1440px',
    };
    root.style.setProperty('--accent', appearance.primaryColor);
    root.style.setProperty('--accent-ink', readableAccentInk(appearance.primaryColor));
    root.style.setProperty('--secondary', appearance.secondaryColor);
    root.style.setProperty('--content-width', pageWidths[appearance.pageWidth]);
    try {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
    } catch {
      // O tema continua aplicado na sessão atual mesmo se o navegador bloquear o armazenamento local.
    }
  }, [appearance]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3200);
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setAuthReady(true);
      return;
    }
    let mounted = true;
    let rejectingUnauthorized = false;
    const hasPasswordSetupFlag = new URLSearchParams(window.location.search).get('setup_password') === '1';
    if (hasPasswordSetupFlag) setRecoveryMode(true);
    const rejectUnauthorized = () => {
      if (rejectingUnauthorized) return;
      rejectingUnauthorized = true;
      setAuthError('Acesso negado. Esta aplicação aceita somente a conta pessoal autorizada.');
      setSession(null);
      // Não aguarde uma chamada Supabase dentro do callback de auth.
      window.setTimeout(() => { void client.auth.signOut(); }, 0);
    };
    client.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session && !isAllowedAccount(data.session.user)) rejectUnauthorized();
      else {
        setSession(data.session);
        if (hasPasswordSetupFlag && !data.session) {
          setRecoveryMode(false);
          setAuthError('O link de recuperação expirou ou não é válido. Solicite outro link.');
        }
      }
      setAuthReady(true);
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      if (nextSession && !isAllowedAccount(nextSession.user)) {
        rejectUnauthorized();
        return;
      }
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      if (nextSession) setAuthError('');
      setSession(nextSession);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const loadConversations = useCallback(async () => {
    if (!supabase || !session?.user) return;
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', session.user.id)
      .order('updated_at', { ascending: false });
    if (error) {
      showToast(`Erro ao carregar conversas: ${error.message}`);
      return;
    }
    setConversations((data ?? []) as Conversation[]);
  }, [session?.user, showToast]);

  useEffect(() => {
    if (!session?.user) {
      setConversations([]);
      setMessages([]);
      setActiveId(null);
      setGithubStatus('disconnected');
      return;
    }
    void loadConversations();
  }, [session?.user, loadConversations]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!supabase) return;
    setLoadingMessages(true);
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) showToast(`Erro ao carregar mensagens: ${error.message}`);
    else setMessages((data ?? []) as ChatMessage[]);
    setLoadingMessages(false);
  }, [showToast]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isNearBottom) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, sending, isNearBottom]);

  async function handlePasswordLogin(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setAuthBusy(true);
    setAuthError('');
    setAuthNotice('');
    if (loginUsername.trim().toLowerCase() !== ALLOWED_USERNAME) {
      setAuthError('Usuário ou senha incorretos.');
      setAuthBusy(false);
      return;
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: ALLOWED_EMAIL,
        password: loginPassword,
      });
      if (error) throw error;
      if (!isAllowedAccount(data.user)) {
        await supabase.auth.signOut();
        throw new Error('Esta conta não tem autorização para acessar o Workbench.');
      }
      setLoginPassword('');
      setSession(data.session);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Não foi possível entrar. Confira usuário e senha.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function requestPasswordReset() {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthError('');
    setAuthNotice('');
    try {
      const redirectUrl = new URL(window.location.href);
      redirectUrl.searchParams.set('setup_password', '1');
      const { error } = await supabase.auth.resetPasswordForEmail(ALLOWED_EMAIL, { redirectTo: redirectUrl.toString() });
      if (error) throw error;
      setAuthNotice('Se essa conta já existe, um link para definir a senha foi enviado ao e-mail autorizado.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Não foi possível solicitar a redefinição da senha.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function updateRecoveryPassword(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setAuthError('');
    setAuthNotice('');
    if (newPassword.length < 8) {
      setAuthError('Use uma senha com pelo menos 8 caracteres.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setAuthError('As senhas não conferem.');
      return;
    }
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setNewPasswordConfirm('');
      setRecoveryMode(false);
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('setup_password');
      window.history.replaceState({}, '', cleanUrl.toString());
      setAuthNotice('Senha atualizada. Seu espaço pessoal está pronto.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Não foi possível atualizar a senha.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSettingsOpen(false);
    setSidebarOpen(false);
  }

  async function createConversation(): Promise<Conversation | null> {
    if (!supabase || !session?.user) return null;
    const { data, error } = await supabase.from('conversations').insert({
      user_id: session.user.id,
      title: 'Nova conversa',
      mode,
    }).select('*').single();
    if (error) {
      showToast(`Não foi possível criar a conversa: ${error.message}`);
      return null;
    }
    const created = data as Conversation;
    setConversations((previous) => [created, ...previous]);
    setActiveId(created.id);
    setMessages([]);
    setView('chat');
    setSidebarOpen(false);
    return created;
  }

  async function selectConversation(conversation: Conversation) {
    setView('chat');
    setActiveId(conversation.id);
    setMode(conversation.mode);
    setSidebarOpen(false);
    await loadMessages(conversation.id);
  }

  async function removeConversation(event: MouseEvent, conversation: Conversation) {
    event.stopPropagation();
    if (!supabase || !window.confirm(`Excluir a conversa “${conversation.title}”?`)) return;
    const { error } = await supabase.from('conversations').delete().eq('id', conversation.id);
    if (error) {
      showToast(`Não foi possível excluir: ${error.message}`);
      return;
    }
    setConversations((previous) => previous.filter((item) => item.id !== conversation.id));
    if (activeId === conversation.id) {
      setActiveId(null);
      setMessages([]);
    }
    showToast('Conversa excluída.');
  }

  async function changeMode(nextMode: ChatMode) {
    setView('chat');
    setMode(nextMode);
    if (supabase && activeId) {
      const { error } = await supabase.from('conversations').update({ mode: nextMode }).eq('id', activeId);
      if (error) showToast(`Não foi possível salvar o modo: ${error.message}`);
      else setConversations((items) => items.map((item) => item.id === activeId ? { ...item, mode: nextMode } : item));
    }
  }

  async function persistMessage(conversationId: string, role: 'user' | 'assistant', content: string) {
    if (!supabase || !session?.user) throw new Error('Sessão do Supabase indisponível.');
    const { data, error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      user_id: session.user.id,
      role,
      content,
    }).select('*').single();
    if (error) throw error;
    return data as ChatMessage;
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const prompt = draft.trim();
    if (!prompt || sending || !supabase || !session?.user) return;
    setDraft('');
    setSending(true);
    let conversationId = activeId;
    let wasNew = false;
    try {
      if (!conversationId) {
        const created = await createConversation();
        if (!created) throw new Error('Não foi possível criar uma conversa.');
        conversationId = created.id;
        wasNew = true;
      }

      const userMessage = await persistMessage(conversationId, 'user', prompt);
      const priorMessages = wasNew ? [] : messages;
      const nextMessages = [...priorMessages, userMessage];
      setMessages(nextMessages);

      if (priorMessages.length === 0 || conversations.find((item) => item.id === conversationId)?.title === 'Nova conversa') {
        const title = prompt.replace(/\s+/g, ' ').slice(0, 54) || 'Nova conversa';
        await supabase.from('conversations').update({ title, updated_at: new Date().toISOString() }).eq('id', conversationId);
      }

      const history = nextMessages.map((item) => ({ role: item.role, content: item.content }));
      const { data, error } = await supabase.functions.invoke('chat-ai', {
        body: { mode, effortByMode, messages: history },
      });
      if (error) {
        const details = typeof data?.error === 'string' ? data.error : error.message;
        throw new Error(details || 'Falha ao chamar chat-ai.');
      }
      const resolvedMode = typeof data?.selected_mode === 'string' ? data.selected_mode : mode;
      const modeNotice = mode === 'auto'
        ? `> **Modo automático:** ${modes.find((item) => item.id === resolvedMode)?.label ?? 'Código Geral'}\n\n`
        : '';
      if (data?.image_url && typeof data.image_url === 'string') {
        const imageMarkdown = `${modeNotice}![Imagem gerada](${data.image_url})`;
        const assistantMessage = await persistMessage(conversationId, 'assistant', imageMarkdown);
        setMessages((items) => [...items, assistantMessage]);
      } else {
        if (!data?.answer || typeof data.answer !== 'string') throw new Error(data?.error ?? 'Resposta inválida do servidor de IA.');
        const assistantMessage = await persistMessage(conversationId, 'assistant', modeNotice + data.answer);
        setMessages((items) => [...items, assistantMessage]);
      }
      await loadConversations();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ocorreu um erro ao enviar sua mensagem.';
      showToast(message);
      setDraft(prompt);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  async function testAllApis() {
    if (!supabase || apiTestBusy) return;
    setApiTestBusy(true);
    const probes: ApiProbe[] = [
      { id: 'database', title: 'Supabase · Banco e RLS', status: 'running', detail: 'Consultando conversas com a sessão atual…' },
      { id: 'general', title: 'Código Geral · Groq', status: 'idle', detail: 'Aguardando teste contextual.' },
      { id: 'stormworks', title: 'Stormworks Lua · Groq + análise local', status: 'idle', detail: 'Aguardando teste contextual.' },
      { id: 'image', title: 'Geração de imagens · Pollinations', status: 'idle', detail: 'Aguardando teste contextual. Pode consumir créditos.' },
      { id: 'personality', title: 'Personalidade · OpenRouter', status: 'idle', detail: 'Aguardando teste contextual.' },
      { id: 'github', title: 'GitHub · Edge Function', status: 'idle', detail: 'Aguardando verificação de conexão.' },
    ];
    setApiProbes(probes);
    const updateProbe = (id: string, status: ApiProbe['status'], detail: string) => {
      setApiProbes((current) => current.map((item) => item.id === id ? { ...item, status, detail } : item));
    };

    try {
      const { error } = await supabase.from('conversations').select('id').limit(1);
      if (error) throw error;
      updateProbe('database', 'ok', 'Supabase respondeu e a leitura respeitou as políticas RLS da sessão.');
    } catch (error) {
      updateProbe('database', 'error', error instanceof Error ? error.message : 'Falha ao consultar o banco.');
    }

    const invokeChat = async (
      id: string,
      modeToTest: ChatMode,
      messagesToSend: Array<{ role: 'user' | 'assistant'; content: string }>,
      checkAnswer?: (answer: string) => boolean,
      contextLabel = 'histórico enviado'
    ) => {
      updateProbe(id, 'running', 'Enviando conversa de teste com mensagens anteriores…');
      try {
        const { data, error } = await supabase!.functions.invoke('chat-ai', { body: { mode: modeToTest, messages: messagesToSend } });
        if (error) throw new Error(typeof data?.error === 'string' ? data.error : error.message);
        if (typeof data?.error === 'string') throw new Error(data.error);
        if (modeToTest === 'image') {
          if (typeof data?.image_url !== 'string' || !data.image_url.startsWith('https://')) throw new Error('O provedor não retornou uma URL de imagem válida.');
          updateProbe(id, 'ok', 'Pollinations respondeu com uma URL HTTPS; o pedido foi enviado junto com o contexto anterior. A imagem precisa ser aberta para inspeção visual.');
          return;
        }
        const answer = typeof data?.answer === 'string' ? data.answer : '';
        if (!answer.trim()) throw new Error('A API respondeu sem texto.');
        if (checkAnswer && !checkAnswer(answer)) throw new Error('A API respondeu, mas não recuperou o dado de contexto solicitado no teste.');
        updateProbe(id, 'ok', 'Resposta recebida e validada com ' + contextLabel + '.');
      } catch (error) {
        updateProbe(id, 'error', error instanceof Error ? error.message : 'Falha na chamada do provedor.');
      }
    };

    await invokeChat('general', 'general', [
      { role: 'user', content: 'Guarde para a próxima mensagem: código de contexto LAGOA-VERDE-91. O backend deste app é Supabase e o site usa GitHub Pages.' },
      { role: 'assistant', content: 'Entendido. Vou manter o código e a informação do backend no contexto.' },
      { role: 'user', content: 'Qual é o código de contexto e qual backend este app usa? Responda diretamente.' },
    ], (answer) => answer.includes('LAGOA-VERDE-91') && /supabase/i.test(answer));

    await invokeChat('stormworks', 'stormworks', [
      { role: 'user', content: 'Requisito para o microcontrolador: leia input.getNumber(7) e envie o valor para output.setNumber(8, valor). Use Stormworks Lua vanilla.' },
      { role: 'assistant', content: 'Entendido: entrada numérica 7 e saída numérica 8.' },
      { role: 'user', content: 'Agora gere o código completo, com onTick(), transferindo o valor da entrada 7 para a saída 8. Não mude os canais.' },
    ], (answer) => {
      const block = answer.match(/\x60{3}(?:lua)?[ \t]*\r?\n([\s\S]*?)\x60{3}/i)?.[1] ?? '';
      return Boolean(block) && Array.from(block).length <= 4096
        && /input\.getNumber\s*\(\s*7\s*\)/i.test(block)
        && /output\.setNumber\s*\(\s*8\s*,/i.test(block);
    }, 'mensagens anteriores + conferência dos canais 7 e 8 e limite de 4.096 caracteres');

    await invokeChat('image', 'image', [
      { role: 'user', content: 'O personagem para manter nas próximas imagens é um robô amarelo pequeno com uma antena azul.' },
      { role: 'assistant', content: 'Entendido. Vou manter o robô amarelo e a antena azul.' },
      { role: 'user', content: 'Gere uma imagem desse mesmo robô dentro de uma oficina escura, com iluminação cinematográfica.' },
    ]);

    await invokeChat('personality', 'personality', [
      { role: 'user', content: 'Neste teste, use o jeito de um narrador de nave espacial e guarde o código HELIO-ALFA-7.' },
      { role: 'assistant', content: 'Comando recebido, tripulante. Contexto armazenado.' },
      { role: 'user', content: 'Qual código foi armazenado? Responda com o código exato.' },
    ], (answer) => answer.includes('HELIO-ALFA-7'));

    updateProbe('github', 'running', 'Consultando o estado da Edge Function do GitHub…');
    try {
      const { data, error } = await supabase.functions.invoke('github-integration', { body: { action: 'status' } });
      if (error) throw new Error(typeof data?.error === 'string' ? data.error : error.message);
      if (typeof data?.connected !== 'boolean') throw new Error(data?.error ?? 'Resposta inesperada da integração GitHub.');
      if (data.connected && data.valid === false) throw new Error(data.error ?? 'O token salvo foi recusado pelo GitHub. Reconecte a integração.');
      updateProbe('github', 'ok', data.connected
        ? 'Edge Function respondeu e o token foi validado pelo GitHub' + (data.login ? ' (' + data.login + ').' : '.')
        : 'Edge Function respondeu; nenhum token GitHub está conectado. A gravação de commits não foi testada.');
    } catch (error) {
      updateProbe('github', 'error', error instanceof Error ? error.message : 'Falha na integração GitHub.');
    }
    setApiTestBusy(false);
  }

  async function openSettings() {
    setSettingsOpen(true);
    setGithubStatus('loading');
    if (!supabase) return;
    const { data, error } = await supabase.functions.invoke('github-integration', { body: { action: 'status' } });
    setGithubStatus(!error && data?.connected && data?.valid !== false ? 'connected' : 'disconnected');
  }

  async function saveGithubToken(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !githubToken.trim()) return;
    setGithubBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('github-integration', {
        body: { action: 'set_token', token: githubToken.trim() },
      });
      if (error) throw new Error(data?.error ?? error.message);
      setGithubToken('');
      setGithubStatus('connected');
      showToast('Token do GitHub salvo com criptografia.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível salvar o token.');
    } finally {
      setGithubBusy(false);
    }
  }

  async function removeGithubToken() {
    if (!supabase || !window.confirm('Remover a conexão com o GitHub?')) return;
    setGithubBusy(true);
    const { data, error } = await supabase.functions.invoke('github-integration', { body: { action: 'remove_token' } });
    setGithubBusy(false);
    if (error) showToast(data?.error ?? error.message);
    else {
      setGithubStatus('disconnected');
      showToast('Token removido.');
    }
  }

  function openSaveCode(code: string, language: string) {
    setSaveModal({ code, language });
    setFilePath(getDefaultFile(language));
    setCommitMessage('Adicionar código gerado');
  }

  async function saveCodeToGithub(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !saveModal) return;
    setSaveBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('github-integration', {
        body: {
          action: 'save_file',
          repository: repo,
          path: filePath,
          content: saveModal.code,
          commitMessage,
        },
      });
      if (error) throw new Error(data?.error ?? error.message);
      setSaveModal(null);
      showToast(data?.html_url ? `Arquivo salvo: ${data.html_url}` : 'Commit realizado no GitHub.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Falha ao salvar no GitHub.');
    } finally {
      setSaveBusy(false);
    }
  }

  const groupedConversations = useMemo(() => conversations, [conversations]);
  const activeConversation = conversations.find((item) => item.id === activeId);

  if (!isSupabaseConfigured) {
    return <SetupScreen />;
  }

  if (!authReady) {
    return <div className="boot-screen"><div className="brand-mark"><Sparkles size={20} /></div><span>Preparando seu espaço…</span></div>;
  }

  if (recoveryMode) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand-mark brand-mark--large"><Sparkles size={23} /></div>
          <div className="auth-eyebrow">AI WORKBENCH · PRIVATE</div>
          <h1>Definir sua senha.</h1>
          <p className="auth-subtitle">Crie uma senha para sua conta pessoal.</p>
          {authError && <div className="form-error auth-error-box">{authError}</div>}
          <form className="auth-form" onSubmit={(event) => { void updateRecoveryPassword(event); }}>
            <label>Nova senha<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
            <label>Confirmar senha<input type="password" value={newPasswordConfirm} onChange={(event) => setNewPasswordConfirm(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
            <button className="primary-button auth-submit" type="submit" disabled={authBusy}>{authBusy ? 'Salvando…' : 'Salvar senha'}</button>
          </form>
          <div className="auth-footnote">A senha é armazenada e verificada pelo Supabase Auth, nunca no código do site.</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand-mark brand-mark--large"><Sparkles size={23} /></div>
          <div className="auth-eyebrow">AI WORKBENCH · PRIVATE</div>
          <h1>Seu espaço pessoal.</h1>
          <p className="auth-subtitle">Entre para abrir suas conversas, ferramentas de código e integração GitHub.</p>
          {authError && <div className="form-error auth-error-box">{authError}</div>}
          {authNotice && <div className="form-notice">{authNotice}</div>}
          <form className="auth-form" onSubmit={(event) => { void handlePasswordLogin(event); }}>
            <label>Usuário<input type="text" value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} autoComplete="username" spellCheck={false} required /></label>
            <label>Senha<input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} autoComplete="current-password" required /></label>
            <button className="primary-button auth-submit" type="submit" disabled={authBusy}>{authBusy ? 'Entrando…' : 'Entrar'}</button>
          </form>
          <div className="auth-switch"><span>Primeiro acesso ou esqueceu a senha?</span><button type="button" onClick={() => { void requestPasswordReset(); }} disabled={authBusy}>Definir / redefinir senha</button></div>
          <div className="auth-footnote">Acesso privado para <strong>loren</strong>. Conversas e configurações ficam protegidas pela autenticação e pelo banco de dados.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell" style={{ "--accent": appearance.primaryColor, "--accent-ink": readableAccentInk(appearance.primaryColor), "--secondary": appearance.secondaryColor } as CSSProperties}>
      {sidebarOpen && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar-top">
          <div className="brand-lockup">
            <div className="brand-mark"><Sparkles size={18} /></div>
            <span>workbench<span className="brand-period">.</span></span>
          </div>
          <button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><X size={18} /></button>
          <button className="new-chat-button" onClick={() => { setView('chat'); void createConversation(); }}>
            <Plus size={17} /><span>Novo chat</span><span className="shortcut">⌘ K</span>
          </button>
        </div>

        <div className="sidebar-section-label">RECENTES</div>
        <div className="conversation-list">
          {groupedConversations.length === 0 ? (
            <div className="empty-history">Suas conversas aparecerão aqui.</div>
          ) : groupedConversations.map((conversation) => (
            <button
              key={conversation.id}
              className={`conversation-item ${activeId === conversation.id ? 'conversation-item--active' : ''}`}
              onClick={() => { void selectConversation(conversation); }}
            >
              <MessageSquare size={15} />
              <span className="conversation-title">{conversation.title}</span>
              <span className="conversation-date">{formatDate(conversation.updated_at)}</span>
              <span className="conversation-delete" onClick={(event) => { void removeConversation(event, conversation); }} role="button" aria-label="Excluir conversa"><Trash2 size={13} /></span>
            </button>
          ))}
        </div>

        <div className="sidebar-section-label tool-section-label">FERRAMENTAS</div>
        <div className="tool-navigation">
          <button className={`tool-nav-item ${view === 'lua-validator' ? 'tool-nav-item--active' : ''}`} onClick={() => { setView('lua-validator'); setSidebarOpen(false); }}>
            <Wrench size={15} /><span>Validador Lua</span><span className="tool-nav-tag">LOCAL</span>
          </button>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-plan"><span className="status-dot" /> Espaço pessoal <span className="free-label">FREE</span></div>
          <button className="settings-button" onClick={() => { void openSettings(); }}>
            <div className="avatar">{session.user.email?.slice(0, 1).toUpperCase() ?? 'U'}</div>
            <span className="user-email">{session.user.email}</span>
            <Settings2 size={16} />
          </button>
          <button className="logout-button" onClick={() => { void signOut(); }}><LogOut size={15} /> Sair da conta</button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Menu size={19} /></button>
            <div className="workspace-label"><span className="workspace-kicker">{view === 'lua-validator' ? 'FERRAMENTA LOCAL' : 'WORKSPACE'}</span><span className="workspace-name">{view === 'lua-validator' ? 'Validador Lua' : activeConversation?.title ?? 'Novo projeto'}</span></div>
          </div>
          <div className="topbar-right">
            <span className="secure-label"><span className="secure-dot" /> CONECTADO</span>
            <button className="topbar-tool-button" onClick={() => setView(view === 'chat' ? 'lua-validator' : 'chat')} title={view === 'chat' ? 'Abrir Validador Lua' : 'Voltar ao chat'}>{view === 'chat' ? <><Wrench size={14} /> Validador Lua</> : <><MessageSquare size={14} /> Voltar ao chat</>}</button>
            <button className="topbar-avatar" onClick={() => { void openSettings(); }} title="Configurações">{session.user.email?.slice(0, 1).toUpperCase() ?? 'U'}</button>
          </div>
        </header>

        {view === 'lua-validator' ? <LuaValidator /> : <>
        <div className="chat-scroll" ref={scrollRef} onScroll={(event) => {
          const el = event.currentTarget;
          setIsNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 140);
        }}>
          {loadingMessages ? (
            <div className="chat-loading"><span className="spinner" /> Carregando conversa…</div>
          ) : messages.length === 0 ? (
            <div className="welcome-screen">
              <div className="welcome-icon"><Sparkles size={22} /></div>
              <div className="welcome-overline">SEU AMBIENTE DE CRIAÇÃO</div>
              <h1>{welcomeCopy.title}</h1>
              <p>{welcomeCopy.subtitle}</p>
              <div className="welcome-motivation">{welcomeCopy.encouragement}</div>
              <div className="suggestion-grid">
                <button className="suggestion-card" onClick={() => { void changeMode('general'); setDraft('Crie uma aplicação web moderna com React e TypeScript para '); inputRef.current?.focus(); }}>
                  <span className="suggestion-icon suggestion-icon--code"><Code2 size={17} /></span>
                  <strong>Construir uma aplicação</strong><span>React, APIs, banco de dados e mais</span>
                </button>
                <button className="suggestion-card" onClick={() => { void changeMode('stormworks'); setDraft('Crie um microcontrolador Stormworks Lua que '); inputRef.current?.focus(); }}>
                  <span className="suggestion-icon suggestion-icon--lua"><Bot size={17} /></span>
                  <strong>Programar no Stormworks</strong><span>Lua vanilla dentro do limite de 4.096</span>
                </button>
                <button className="suggestion-card" onClick={() => { void changeMode('image'); setDraft('Uma cidade futurista sob chuva, iluminação cinematográfica'); inputRef.current?.focus(); }}>
                  <span className="suggestion-icon suggestion-icon--image"><ImageIcon size={17} /></span>
                  <strong>Gerar uma imagem</strong><span>Transforme uma descrição em visual</span>
                </button>
                <button className="suggestion-card" onClick={() => { void changeMode('personality'); setDraft('Quero que você converse comigo com uma personalidade '); inputRef.current?.focus(); }}>
                  <span className="suggestion-icon suggestion-icon--persona"><MessageCircleHeart size={17} /></span>
                  <strong>Definir personalidade</strong><span>Escolha tom, jeito de falar e personagem</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="messages-container">
              {messages.map((message) => (
                <article key={message.id} className={`message-row message-row--${message.role}`}>
                  <div className={`message-avatar ${message.role === 'assistant' ? 'message-avatar--assistant' : ''}`}>
                    {message.role === 'assistant' ? <Sparkles size={15} /> : (session.user.email?.slice(0, 1).toUpperCase() ?? 'U')}
                  </div>
                  <div className="message-body">
                    <div className="message-author">{message.role === 'assistant' ? 'Workbench' : 'Você'}<span>{formatDate(message.created_at)}</span></div>
                    <MarkdownMessage content={message.content} mode={mode} onSaveCode={openSaveCode} onToast={showToast} />
                  </div>
                </article>
              ))}
              {sending && (
                <article className="message-row message-row--assistant">
                  <div className="message-avatar message-avatar--assistant"><Sparkles size={15} /></div>
                  <div className="message-body"><div className="message-author">Workbench<span>gerando</span></div><div className="typing-indicator"><i /><i /><i /></div></div>
                </article>
              )}
            </div>
          )}
        </div>

        {!isNearBottom && messages.length > 0 && <button className="scroll-bottom" onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}><ArrowDown size={15} /></button>}

        <footer className="composer-area">
          <form className="composer" onSubmit={(event) => { void sendMessage(event); }}>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder={mode === 'image' ? 'Descreva a imagem que você quer criar…' : mode === 'stormworks' ? 'Descreva seu microcontrolador Stormworks…' : mode === 'personality' ? 'Descreva a personalidade, personagem ou estilo de conversa…' : 'Pergunte ou descreva o que você quer construir…'}
              rows={1}
              disabled={sending}
            />
            <div className="composer-bottom">
              <div className="composer-hints">
                <span className="hint-chip"><Zap size={12} /> {mode === 'image' ? 'Gerador de imagens' : mode === 'stormworks' ? 'Geração + revisão Lua' : mode === 'personality' ? 'Personalidade' : mode === 'auto' ? 'Seleção automática' : 'Código geral'}</span>
                <span className="keyboard-hint">Enter para enviar · Shift + Enter para nova linha</span>
              </div>
              <div className="composer-actions">
                <div className="chat-mode-control">
                  <button className="chat-mode-trigger" type="button" onClick={() => setModeMenuOpen((open) => !open)} aria-expanded={modeMenuOpen} aria-label="Configurar modo e esforço da IA">
                    <SlidersHorizontal size={14} /><span>{currentMode.short}</span><ChevronDown size={13} />
                  </button>
                  {modeMenuOpen && (
                    <div className="chat-mode-menu">
                      <div className="chat-menu-heading">Modo de trabalho</div>
                      <div className="chat-mode-options">
                        {modes.map((item) => {
                          const Icon = item.id === 'auto' ? Sparkles : item.id === 'general' ? Code2 : item.id === 'stormworks' ? Bot : item.id === 'image' ? ImageIcon : MessageCircleHeart;
                          return (
                            <button key={item.id} type="button" className={'chat-mode-option' + (mode === item.id ? ' chat-mode-option--active' : '')} onClick={() => { void changeMode(item.id); setModeMenuOpen(false); }}>
                              <Icon size={15} />
                              <span><strong>{item.label}</strong><small>{item.description}</small></span>
                              {mode === item.id && <Check size={15} />}
                            </button>
                          );
                        })}
                      </div>
                      <div className="chat-menu-divider" />
                      <div className="chat-menu-heading">Nível de esforço por modo</div>
                      {([
                        ['general', 'Código Geral'],
                        ['stormworks', 'Stormworks Lua'],
                        ['personality', 'Personalidade'],
                      ] as const).map(([effortMode, label]) => (
                        <div className="effort-setting-row" key={effortMode}>
                          <span className="effort-setting-label">{label}</span>
                          <div className="effort-segment-group" role="group" aria-label={'Esforço ' + label}>
                            {([
                              ['low', 'Baixo'],
                              ['medium', 'Médio'],
                              ['ultra', 'Ultra'],
                            ] as const).map(([level, levelLabel]) => (
                              <button key={level} type="button" className={'effort-segment' + (effortByMode[effortMode] === level ? ' effort-segment--active' : '')} aria-pressed={effortByMode[effortMode] === level} onClick={() => setEffortByMode((previous) => ({ ...previous, [effortMode]: level }))}>{levelLabel}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div className="effort-setting-row effort-setting-row--note">
                        <span className="effort-setting-label">Imagem</span><small>O gerador visual controla a qualidade; não há código para revisar.</small>
                      </div>
                      <p className="chat-menu-note">Médio e Ultra fazem rodadas adicionais de revisão e simulação de casos. A execução real depende do ambiente onde o código será usado.</p>
                    </div>
                  )}
                </div>
                <button className="send-button" type="submit" disabled={!draft.trim() || sending} aria-label="Enviar mensagem">
                  {sending ? <span className="send-spinner" /> : <ArrowUp size={18} />}
                </button>
              </div>
            </div>
          </form>
          <div className="disclaimer">A IA pode cometer erros. Revise o código antes de usar em projetos importantes.</div>
        </footer>
        </>}
      </main>

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="modal-card settings-modal">
            <div className="modal-header"><div><span className="modal-eyebrow">PREFERÊNCIAS</span><h2>Configurações</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)}><X size={18} /></button></div>
            <AppearanceSettingsPanel value={appearance} onSave={(next) => { setAppearance(next); showToast('Aparência salva.'); }} />

            <div className="settings-section downloads-section">
              <div className="settings-section-title"><Download size={17} /> Downloads</div>
              <p>Instale o AI Workbench no seu dispositivo. No Linux, escolha o formato recomendado para sua distribuição.</p>
              <div className="download-options">
                <a className="download-option" href="https://github.com/lorenzosella99/LuaWorks-Studio/releases/latest/download/AI-Workbench-Android.apk">
                  <span className="download-option-icon"><Smartphone size={17} /></span>
                  <span><strong>Android · APK</strong><small>Instalação em celulares e tablets Android</small></span><Download size={15} />
                </a>
                <a className="download-option download-option--recommended" href="https://github.com/lorenzosella99/LuaWorks-Studio/releases/latest/download/AI-Workbench-Linux-x86_64.AppImage">
                  <span className="download-option-icon"><Monitor size={17} /></span>
                  <span><strong>Linux · AppImage</strong><small>Ubuntu GNOME, Fedora, Zorin, Debian e outras distribuições x86_64</small></span><Download size={15} />
                </a>
                <a className="download-option" href="https://github.com/lorenzosella99/LuaWorks-Studio/releases/latest/download/AI-Workbench-Ubuntu-Debian.deb">
                  <span className="download-option-icon"><Package size={17} /></span>
                  <span><strong>Linux · DEB</strong><small>Ubuntu, Debian, Zorin OS e derivados</small></span><Download size={15} />
                </a>
                <a className="download-option" href="https://github.com/lorenzosella99/LuaWorks-Studio/releases/latest/download/AI-Workbench-Fedora-openSUSE.rpm">
                  <span className="download-option-icon"><Package size={17} /></span>
                  <span><strong>Linux · RPM</strong><small>Fedora, openSUSE e distribuições compatíveis</small></span><Download size={15} />
                </a>
                <a className="download-option" href="https://github.com/lorenzosella99/LuaWorks-Studio/releases/latest/download/AI-Workbench-Linux-Portable.tar.gz">
                  <span className="download-option-icon"><Download size={17} /></span>
                  <span><strong>Linux · Portátil TAR.GZ</strong><small>Para instalação manual em outros ambientes Linux</small></span><Download size={15} />
                </a>
              </div>
              <p className="download-footnote">Os pacotes Linux são para computadores x86_64. O AppImage é a opção mais simples para a maioria dos desktops.</p>
            </div>
            <div className="settings-section">
              <div className="settings-section-title"><Zap size={17} /> Diagnóstico das APIs</div>
              <p>Teste o banco e os quatro modos de IA enviando mensagens anteriores para conferir se cada modo respeita o contexto da conversa.</p>
              <button className="primary-button api-test-button" type="button" onClick={() => { void testAllApis(); }} disabled={apiTestBusy}>
                {apiTestBusy ? 'Testando integrações…' : 'Testar todas as APIs'}
              </button>
              <div className="api-test-warning">O teste de imagens pode consumir créditos do provedor. Os testes usam solicitações reais e só começam quando você clicar.</div>
              {apiProbes.length > 0 && <div className="api-test-list">
                {apiProbes.map((probe) => (
                  <div className="api-test-row" key={probe.id}>
                    <span className={'api-test-dot api-test-dot--' + probe.status} />
                    <div><strong>{probe.title}</strong><span>{probe.detail}</span></div>
                    <small>{probe.status === 'running' ? 'Testando' : probe.status === 'ok' ? 'OK' : probe.status === 'error' ? 'Falhou' : 'Pendente'}</small>
                  </div>
                ))}
              </div>}
            </div>
            <div className="settings-section">
              <div className="settings-section-title"><Github size={17} /> Integração com GitHub</div>
              <p>Conecte um Personal Access Token para salvar blocos de código diretamente nos seus repositórios.</p>
              <div className="connection-state">
                <span className={`connection-indicator ${githubStatus === 'connected' ? 'connection-indicator--on' : ''}`} />
                {githubStatus === 'loading' ? 'Verificando conexão…' : githubStatus === 'connected' ? 'GitHub conectado' : 'Nenhum token conectado'}
              </div>
              <form onSubmit={saveGithubToken} className="settings-form">
                <label>Personal Access Token<input type="password" value={githubToken} onChange={(event) => setGithubToken(event.target.value)} placeholder={githubStatus === 'connected' ? 'Cole um novo token para substituir' : 'github_pat_…'} autoComplete="off" /></label>
                <button className="primary-button" type="submit" disabled={!githubToken.trim() || githubBusy}>{githubBusy ? 'Conectando…' : 'Conectar GitHub'}</button>
              </form>
              {githubStatus === 'connected' && <button className="text-danger-button" onClick={() => { void removeGithubToken(); }} disabled={githubBusy}>Remover token salvo</button>}
              <div className="security-note"><span className="security-lock">⌑</span> O token é criptografado no servidor com AES-GCM. Ele não fica no localStorage nem é enviado de volta ao navegador.</div>
              <div className="github-help">Crie um token fine-grained com acesso ao repositório desejado e permissão <strong>Contents: Read and write</strong>. Para salvar em `.github/workflows`, adicione também a permissão Workflows.</div>
            </div>
            <div className="settings-footer"><span>Conta conectada</span><strong>{session.user.email}</strong></div>
          </section>
        </div>
      )}

      {saveModal && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSaveModal(null); }}>
          <section className="modal-card save-modal">
            <div className="modal-header"><div><span className="modal-eyebrow">GITHUB COMMIT</span><h2>Salvar código</h2></div><button className="icon-button" onClick={() => setSaveModal(null)}><X size={18} /></button></div>
            <div className="save-code-preview"><Code2 size={16} /><span>{saveModal.language || 'código'}</span><span>{Array.from(saveModal.code).length.toLocaleString('pt-BR')} caracteres</span></div>
            <form onSubmit={saveCodeToGithub} className="settings-form">
              <label>Repositório (owner/repo)<input value={repo} onChange={(event) => setRepo(event.target.value)} placeholder="usuario/meu-projeto" required /></label>
              <label>Caminho do arquivo<input value={filePath} onChange={(event) => setFilePath(event.target.value)} placeholder="src/arquivo.ts" required /></label>
              <label>Mensagem do commit<input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder="Adicionar código gerado" required /></label>
              <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setSaveModal(null)}>Cancelar</button><button className="primary-button" type="submit" disabled={saveBusy || !repo.trim() || !filePath.trim()}>{saveBusy ? 'Enviando…' : <><Github size={15} /> Criar commit</>}</button></div>
            </form>
            <p className="modal-footnote">Se o arquivo já existir, o Workbench busca o SHA atual e cria um novo commit de atualização.</p>
          </section>
        </div>
      )}

      {toast && <div className="toast"><Check size={15} />{toast}</div>}
    </div>
  );
}

function SetupScreen() {
  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="brand-mark brand-mark--large"><Sparkles size={23} /></div>
        <span className="auth-eyebrow">CONFIGURAÇÃO NECESSÁRIA</span>
        <h1>Conecte seu projeto Supabase.</h1>
        <p>Crie um arquivo <code>.env</code> na raiz do projeto e informe a URL e a chave pública do Supabase.</p>
        <pre className="setup-code">VITE_SUPABASE_URL=https://seu-projeto.supabase.co{ '\n' }VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publica</pre>
        <p className="setup-small">Use a chave anon/publishable. Nunca coloque a service_role no frontend.</p>
      </div>
    </div>
  );
}
