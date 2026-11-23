export type LocalFile = { id: string; name: string; content: string; updatedAt: string; language: string };
export type LocalVersion = { id: string; fileId: string; fileName: string; content: string; createdAt: string };
export type KnowledgeDoc = { id: string; name: string; content: string; addedAt: string };
const FILES_KEY = 'aw-local-files-v1';
const VERSIONS_KEY = 'aw-local-versions-v1';
const KNOWLEDGE_KEY = 'aw-knowledge-v1';
function read<T>(key: string, fallback: T): T { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
function write<T>(key: string, value: T) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
export const getFiles = () => read<LocalFile[]>(FILES_KEY, []);
export const saveFile = (file: LocalFile) => { const files = getFiles(); const next = [file, ...files.filter(item => item.id !== file.id)]; write(FILES_KEY, next); return next; };
export const removeFile = (id: string) => { const next = getFiles().filter(file => file.id !== id); write(FILES_KEY, next); return next; };
export const getVersions = () => read<LocalVersion[]>(VERSIONS_KEY, []);
export const addVersion = (version: LocalVersion) => { const next = [version, ...getVersions()].slice(0, 200); write(VERSIONS_KEY, next); return next; };
export const getKnowledge = () => read<KnowledgeDoc[]>(KNOWLEDGE_KEY, []);
export const saveKnowledge = (doc: KnowledgeDoc) => { const next = [doc, ...getKnowledge().filter(item => item.id !== doc.id)]; write(KNOWLEDGE_KEY, next); return next; };
export const removeKnowledge = (id: string) => { const next = getKnowledge().filter(item => item.id !== id); write(KNOWLEDGE_KEY, next); return next; };
export function makeId() { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2); }
export function downloadText(name: string, content: string) { const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }
