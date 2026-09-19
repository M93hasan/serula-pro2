import type { NestingPart } from './dxfTypes';
import type { NestingSettings } from '../nesting/nestingEngine';
import './NestingControls.css';

export type WorkspacePanel = 'settings' | 'parts' | 'export';
type Props = {
  panel: WorkspacePanel; onPanel: (panel: WorkspacePanel) => void;
  settings: NestingSettings; onSettings: (settings: NestingSettings) => void;
  spacing: number; onSpacing: (value: number) => void;
  autoSimulation: boolean; onAutoSimulation: (value: boolean) => void;
  parts: NestingPart[]; quantities: Record<string, number>; onQuantity: (id: string, value: number) => void;
  onAllQuantities: (value: number) => void; busy: boolean; canExport: boolean;
  unplacedCount: number;
  onExport: (format: 'dxf' | 'svg' | 'json') => void;
};

export default function NestingControls(props: Props) {
  const { settings, parts, quantities, panel } = props;
  const total = parts.reduce((sum, part) => sum + (quantities[part.id] ?? 1), 0);
  const dimension = (key: 'sheetWidth' | 'sheetHeight' | 'rollWidth' | 'margin', title: string) => <label className="setting-field">
    <span>{title}</span><div className="unit-input"><input aria-label={key} type="number" min={key === 'margin' ? 0 : 1} step="0.1" value={settings[key]}
      onChange={event => props.onSettings({ ...settings, [key]: Number(event.target.value) })} /><span>mm</span></div>
  </label>;
  return <section className="nesting-controls" id="workspace-controls">
    <header className="controls-heading"><div><span className="section-kicker">ÜRETİM HAZIRLIĞI</span><h2>Yerleşim çalışma alanı</h2></div>
      <span className="job-badge"><i />{total} parça hazır</span></header>
    <div className="controls-tabs" role="tablist" aria-label="Çalışma alanı">
      {(['settings', 'parts', 'export'] as const).map(tab => <button key={tab} type="button" role="tab" id={`tab-${tab}`} aria-controls={`panel-${tab}`} aria-selected={panel === tab} onClick={() => props.onPanel(tab)}>
        {tab === 'settings' ? '⚙  Yerleşim ayarları' : tab === 'parts' ? `▱  Parçalar · ${total}` : '↗  Dışa aktar'}
      </button>)}
    </div>
    <div role="tabpanel" id={`panel-${panel}`} aria-labelledby={`tab-${panel}`}>
      {panel === 'settings' && <fieldset disabled={props.busy} className="settings-body">
        <div className="settings-grid">
          <label className="setting-field"><span>Malzeme tipi</span><select aria-label="Malzeme" value={settings.materialType} onChange={e => props.onSettings({ ...settings, materialType: e.target.value as NestingSettings['materialType'] })}>
            <option value="sheet">Plaka / Sheet</option><option value="roll">Rulo / Roll</option></select></label>
          {settings.materialType === 'sheet' ? <>{dimension('sheetWidth', 'Plaka genişliği')}{dimension('sheetHeight', 'Plaka yüksekliği')}</> : dimension('rollWidth', 'Rulo genişliği')}
          {dimension('margin', 'Kenar payı')}
          <label className="setting-field"><span>Parçalar arası mesafe</span><div className="unit-input"><input aria-label="Parça Aralığı" type="number" min="0" step="0.1" value={props.spacing} onChange={e => props.onSpacing(Number(e.target.value))} /><span>mm</span></div></label>
          <label className="setting-field"><span>Başlangıç köşesi</span><select aria-label="Başlangıç" value={settings.startCorner} onChange={e => props.onSettings({ ...settings, startCorner: e.target.value as NestingSettings['startCorner'] })}>
            <option value="bottom-left">↙ Sol alt</option><option value="bottom-right">↘ Sağ alt</option><option value="top-left">↖ Sol üst</option><option value="top-right">↗ Sağ üst</option></select></label>
        </div>
        <div className="settings-footer"><div className="rotation-group"><span>İzin verilen dönüşler</span><div>{[0, 90, 180, 270].map(r => <label key={r} className={settings.rotations.includes(r) ? 'rotation-chip selected' : 'rotation-chip'}>
          <input aria-label={`${r} derece`} type="checkbox" checked={settings.rotations.includes(r)} onChange={e => props.onSettings({ ...settings, rotations: e.target.checked ? [...settings.rotations, r].sort((a,b) => a-b) : settings.rotations.filter(a => a !== r) })} />{r}°</label>)}</div></div>
          <label className="simulation-switch"><input type="checkbox" checked={props.autoSimulation} onChange={e => props.onAutoSimulation(e.target.checked)} /><span><strong>Yerleşimi adım adım göster</strong><small>Hesaplama sonrası otomatik simülasyon</small></span></label>
        </div>
      </fieldset>}
      {panel === 'parts' && <div className="parts-body"><div className="panel-description"><div><h3>Kesim adetleri</h3><p>Her kalıbın adedini belirleyin. 0 olan parçalar yerleşime alınmaz.</p></div><div className="bulk-actions"><button disabled={props.busy} onClick={() => props.onAllQuantities(1)}>Hepsi 1 adet</button><button disabled={props.busy} onClick={() => props.onAllQuantities(0)}>Tümünü çıkar</button></div></div>
        <div className="part-catalogue">{parts.map((part, index) => {
          const quantity = quantities[part.id] ?? 1;
          const { minX, minY, width, height } = part.bounds;
          return <article className={`part-card ${quantity === 0 ? 'excluded' : ''}`} key={part.id}>
            <div className="part-thumbnail"><svg viewBox={`${minX-8} ${minY-8} ${width+16} ${height+16}`} aria-label={`P${index+1} önizleme`}><polygon points={part.outerContour.points.map(p => `${p.x},${p.y}`).join(' ')} fill="#e8eefc" stroke="#5174b9" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg></div>
            <div className="part-card-info"><strong>P{index+1}</strong><small>{width.toFixed(1)} × {height.toFixed(1)} mm</small><span>{quantity === 0 ? 'Yerleşim dışında' : `${quantity} adet`}</span></div>
            <div className="quantity-stepper"><button aria-label={`P${index+1} azalt`} disabled={props.busy || quantity === 0} onClick={() => props.onQuantity(part.id, quantity-1)}>−</button>
              <input aria-label={`P${index+1} adet`} type="number" min="0" max="100" value={quantity} disabled={props.busy} onChange={e => { const value=Number(e.target.value); if (Number.isInteger(value) && value>=0 && value<=100) props.onQuantity(part.id,value); }} />
              <button aria-label={`P${index+1} artır`} disabled={props.busy || quantity === 100} onClick={() => props.onQuantity(part.id,quantity+1)}>+</button></div>
          </article>;
        })}</div></div>}
      {panel === 'export' && <div className="export-body"><div className="panel-description"><div><h3>Yerleşimi dışa aktar</h3><p>{props.canExport ? props.unplacedCount ? `${props.unplacedCount} parça yerleşemedi. Dosyaya yalnızca yerleşen parçalar dahil edilir.` : 'Tam yerleşim ve tüm parça kopyaları dosyaya dahil edilir.' : 'Dışa aktarmak için önce bir yerleşim hesaplayın.'}</p></div><span className="format-unit">Ölçü birimi: mm</span></div>
        <div className="export-grid">{([
          ['dxf','DXF','Kesim ve CAD','Spline, yay, renk ve katmanlar korunur.'],
          ['svg','SVG','Vektörel önizleme','Ölçekli yerleşimi paylaşın veya yazdırın.'],
          ['json','JSON','Yerleşim verisi','Parça konumları, dönüşler ve sonuç özeti.'],
        ] as const).map(([format, title, subtitle, description]) => <button className="export-card" key={format} disabled={!props.canExport || props.busy} onClick={() => props.onExport(format)}><span className="format-icon">{title}</span><strong>{subtitle}</strong><small>{description}</small><span className="download-label">Dosyayı indir ↓</span></button>)}</div>
      </div>}
    </div>
  </section>;
}
