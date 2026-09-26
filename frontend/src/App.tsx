﻿import { useRef, useState } from 'react';
import DxfParser from 'dxf-parser';
import DxfViewer, { type SavedLayout } from './dxf/DxfViewer';
import { normalizeDxfEntities } from './dxf/dxfNormalizer';
import type { SerulaDxfEntity } from './dxf/dxfTypes';
import logoImg from '../../logo.png';
import './App.css';

function App() {
  const [navigation, setNavigation] = useState<{ panel: 'viewer' | 'settings' | 'parts' | 'export'; token: number }>({ panel: 'viewer', token: 0 });
  const navigate = (panel: typeof navigation.panel) => setNavigation({ panel, token: Date.now() });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [loadVersion, setLoadVersion] = useState(0);
  const [entities, setEntities] = useState<SerulaDxfEntity[]>([]);
  const [savedLayout, setSavedLayout] = useState<SavedLayout | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const loadDxf = (text: string, name: string, id: string, layout: SavedLayout | null) => {
    const parsed = new DxfParser().parseSync(text);
    if (!parsed) throw new Error('DXF dosyası okunamadı.');
    const nextEntities = normalizeDxfEntities(parsed);
    setSavedLayout(layout);
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
  return <div className="app">
    <aside className="sidebar">
      <div className="logo">
        <img
          src={logoImg}
          alt="Serula Logo"
          className="logo-img"
          style={{ width: '32px', height: '32px', marginRight: '10px', objectFit: 'contain', borderRadius: '50%', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
        />
        <div><strong>Serula</strong><span>Nesting Pro</span></div>
      </div>
      <nav className="navigation">
        <button className={navigation.panel === 'viewer' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('viewer')}>Çalışma alanı</button>
        <button className="nav-item" onClick={() => fileInputRef.current?.click()}>DXF Yükle</button>
        <button className="nav-item primary" onClick={() => { if(entities.length) navigate('settings'); else fileInputRef.current?.click(); }}>Yerleşimi Başlat</button>
        <button className={navigation.panel === 'parts' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('parts')}>Parçalar</button>
        <button className={navigation.panel === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('settings')}>Ayarlar</button>
        <button className={navigation.panel === 'export' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('export')}>DXF Kaydet</button>
      </nav>
    </aside>
    <main className="main-content">
      <header className="topbar"><div className="topbar-title"></div><button className="new-project-button" disabled={isLoading} onClick={() => fileInputRef.current?.click()}>{isLoading ? 'İşleniyor…' : 'DXF Yükle'}</button><input ref={fileInputRef} type="file" accept=".dxf" onChange={handleFileChange} hidden /></header>
      {error && <div className="app-error" role="alert">{error}</div>}
      <DxfViewer key={`${projectId}:${loadVersion}`} navigation={navigation} fileName={fileName} entities={entities} savedLayout={savedLayout} />
    </main>
  </div>;
}
export default App;
