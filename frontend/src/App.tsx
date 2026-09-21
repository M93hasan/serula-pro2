import { useEffect, useRef, useState } from 'react';
import DxfParser from 'dxf-parser';
import type { User } from 'firebase/auth';
import DxfViewer, { type SavedLayout } from './dxf/DxfViewer';
import { normalizeDxfEntities } from './dxf/dxfNormalizer';
import type { SerulaDxfEntity } from './dxf/dxfTypes';
import { cloudConfigured, googleSignIn, googleSignOut, listProjects, openProject, saveProject, watchUser, type SavedProject } from './cloud';
import { version } from '../package.json';
import './App.css';

function App() {
  const [navigation, setNavigation] = useState<{ panel: 'viewer' | 'settings' | 'parts' | 'export'; token: number }>({ panel: 'viewer', token: 0 });
  const navigate = (panel: typeof navigation.panel) => setNavigation({ panel, token: Date.now() });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [dxfText, setDxfText] = useState('');
  const [projectId, setProjectId] = useState('');
  const [loadVersion, setLoadVersion] = useState(0);
  const [entities, setEntities] = useState<SerulaDxfEntity[]>([]);
  const [savedLayout, setSavedLayout] = useState<SavedLayout | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => watchUser(setUser), []);
  useEffect(() => { if (user) void listProjects(user).then(setProjects).catch(e => setError(String(e))); }, [user]);
  const loadDxf = (text: string, name: string, id: string, layout: SavedLayout | null) => {
    const parsed = new DxfParser().parseSync(text);
    if (!parsed) throw new Error('DXF dosyası okunamadı.');
    const nextEntities = normalizeDxfEntities(parsed);
    setSavedLayout(layout);
    setDxfText(text);
    setFileName(name);
    setProjectId(id);
    setLoadVersion(value => value + 1);
    setEntities(nextEntities);
    setError('');
  };
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.dxf')) { setError('Lütfen DXF dosyası seçin.'); return; }
    try { setIsLoading(true); loadDxf(await file.text(), file.name, crypto.randomUUID(), null); }
    catch (e) { setError(e instanceof Error ? e.message : 'DXF okunamadı.'); }
    finally { setIsLoading(false); }
  };
  const handleOpen = async (project: SavedProject) => {
    if (!user) return;
    try { setIsLoading(true); loadDxf(await openProject(user, project.id), project.name, project.id, (project.layout ?? null) as SavedLayout | null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Proje açılamadı.'); }
    finally { setIsLoading(false); }
  };
  const handleSave = async (layout: SavedLayout) => {
    if (!user) { setError('Buluta kaydetmek için Google ile giriş yapın.'); return; }
    try {
      setIsLoading(true);
      await saveProject(user, projectId, fileName, dxfText, layout);
      setProjects(await listProjects(user));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Buluta kaydedilemedi.'); }
    finally { setIsLoading(false); }
  };
  return <div className="app">
    <aside className="sidebar">
      <div className="logo"><div className="logo-mark">S</div><div><strong>Serula</strong><span>Nesting Pro</span></div></div>
      <nav className="navigation">
        <button className={navigation.panel === 'viewer' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('viewer')}>Çalışma alanı</button>
        <button className="nav-item" onClick={() => fileInputRef.current?.click()}>DXF Yükle</button>
        <button className={navigation.panel === 'parts' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('parts')}>Parçalar</button>
        <button className={navigation.panel === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('settings')}>Ayarlar</button>
        <button className={navigation.panel === 'export' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('export')}>DXF Kaydet</button>
      </nav>
      <div className="sidebar-footer">{user ? <><span>{user.displayName || user.email}</span><button onClick={() => void googleSignOut()}>Çıkış yap</button></> : <button disabled={!cloudConfigured} onClick={() => void googleSignIn().catch(e => setError(String(e)))}>Google ile giriş</button>}</div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div className="topbar-title"><span className="version-badge">v{version}</span><h1>DXF Yerleşim</h1></div><button className="new-project-button" disabled={isLoading} onClick={() => fileInputRef.current?.click()}>{isLoading ? 'İşleniyor…' : 'DXF Yükle'}</button><input ref={fileInputRef} type="file" accept=".dxf" onChange={handleFileChange} hidden /></header>
      {error && <div className="app-error" role="alert">{error}</div>}
      {user && projects.length > 0 && <section className="cloud-projects" aria-label="Kayıtlı projeler"><strong>Bulut projelerim</strong><div>{projects.map(project => <button key={project.id} disabled={isLoading} onClick={() => void handleOpen(project)}>{project.name}</button>)}</div></section>}
      {entities.length ? <DxfViewer key={`${projectId}:${loadVersion}`} navigation={navigation} fileName={fileName} entities={entities} savedLayout={savedLayout} onCloudSave={user ? handleSave : undefined} /> : <section className="welcome-card"><div className="welcome-text"><h2>DXF dosyanızı yükleyin</h2><button className="primary-button" onClick={() => fileInputRef.current?.click()}>DXF Yükle</button></div></section>}
    </main>
  </div>;
}
export default App;
