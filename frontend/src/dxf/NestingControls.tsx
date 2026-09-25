import type { NestingPart } from './dxfTypes';
import { ANY_ROTATIONS, type NestingSettings } from '../nesting/nestingEngine';
import './NestingControls.css';

export type WorkspacePanel = 'settings' | 'parts' | 'export';

type Props = {
  panel: WorkspacePanel;
  onPanel: (panel: WorkspacePanel) => void;
  settings: NestingSettings;
  onSettings: (settings: NestingSettings) => void;
  spacing: number;
  onSpacing: (value: number) => void;
  autoSimulation: boolean;
  onAutoSimulation: (value: boolean) => void;
  parts: NestingPart[];
  quantities: Record<string, number>;
  onQuantity: (id: string, value: number) => void;
  onAllQuantities: (value: number) => void;
  busy: boolean;
  canExport: boolean;
  onFull: (id: string) => void;
  unplacedCount: number;
  onExport: (format: 'dxf') => void;
};

export default function NestingControls(props: Props) {
  const { settings, parts, quantities, panel } = props;
  const total = parts.reduce((sum, part) => sum + (quantities[part.id] ?? 1), 0);

  /* =====================================================
     SAYISAL GİRİŞ ALANI
  ===================================================== */
  const dimension = (
    key: 'sheetWidth' | 'sheetHeight' | 'rollWidth' | 'margin',
    title: string
  ) => (
    <label className="setting-field" key={key}>
      <span>{title}</span>
      <div className="unit-input">
        <input
          aria-label={key}
          type="number"
          min={key === 'margin' ? 0 : 1}
          step="0.1"
          value={settings[key]}
          onChange={(event) =>
            props.onSettings({ ...settings, [key]: Number(event.target.value) })
          }
        />
        <span>mm</span>
      </div>
    </label>
  );

  /* =====================================================
     SEKME BAŞLIKLARI
  ===================================================== */
  const tabs: { id: WorkspacePanel; label: string; icon: React.ReactNode }[] = [
    {
      id: 'settings',
      label: 'Yerleşim ayarları',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
    {
      id: 'parts',
      label: `Parçalar · ${total}`,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      ),
    },
    {
      id: 'export',
      label: 'DXF Kaydet',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      ),
    },
  ];

  return (
    <section className="nesting-controls" id="workspace-controls">
      {/* =================================================
          BAŞLIK
      ================================================= */}
      <header className="controls-heading">
        <div>
          <div className="section-kicker">Çalışma Alanı</div>
          <h2 style={{ color: '#ff0000' }}>Yerleşim v0.0.1</h2>
        </div>
        <span className="job-badge">
          <i />
          {total} parça
        </span>
      </header>

      {/* =================================================
          SEKMELER
      ================================================= */}
      <div className="controls-tabs" role="tablist" aria-label="Çalışma alanı">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-controls={`panel-${tab.id}`}
            aria-selected={panel === tab.id}
            onClick={() => props.onPanel(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${panel}`} aria-labelledby={`tab-${panel}`}>
        {/* =================================================
            AYARLAR
        ================================================= */}
        {panel === 'settings' && (
          <fieldset disabled={props.busy} className="settings-body">
            <div className="settings-grid">
              <label className="setting-field">
                <span>Malzeme tipi</span>
                <select
                  aria-label="Malzeme"
                  value={settings.materialType}
                  onChange={(event) =>
                    props.onSettings({
                      ...settings,
                      materialType: event.target.value as NestingSettings['materialType'],
                    })
                  }
                >
                  <option value="sheet">Plaka / Sheet</option>
                  <option value="roll">Rulo / Roll</option>
                </select>
              </label>

              {settings.materialType === 'sheet' ? (
                <>
                  {dimension('sheetWidth', 'Plaka genişliği')}
                  {dimension('sheetHeight', 'Plaka yüksekliği')}
                </>
              ) : (
                dimension('rollWidth', 'Rulo genişliği')
              )}

              {dimension('margin', 'Kenar payı')}

              <label className="setting-field">
                <span>Eğri toleransı (mm)</span>
                <input
                  aria-label="Eğri toleransı"
                  type="number"
                  min="0.001"
                  max="5"
                  step="0.01"
                  value={settings.curveTolerance ?? 0.1}
                  onChange={(event) =>
                    props.onSettings({
                      ...settings,
                      curveTolerance: Number(event.target.value),
                    })
                  }
                />
              </label>

              <label className="setting-field">
                <span>Arama süresi (saniye)</span>
                <input
                  aria-label="Arama süresi"
                  type="number"
                  min="1"
                  max="300"
                  step="1"
                  value={(settings.timeBudgetMs ?? 10000) / 1000}
                  onChange={(event) =>
                    props.onSettings({
                      ...settings,
                      timeBudgetMs: Number(event.target.value) * 1000,
                    })
                  }
                />
              </label>

              <label className="setting-field">
                <span>Parçalar arası mesafe</span>
                <div className="unit-input">
                  <input
                    aria-label="Parça Aralığı"
                    type="number"
                    min="0"
                    step="0.1"
                    value={props.spacing}
                    onChange={(event) => props.onSpacing(Number(event.target.value))}
                  />
                  <span>mm</span>
                </div>
              </label>

              <label className="setting-field">
                <span>Başlangıç köşesi</span>
                <select
                  aria-label="Başlangıç"
                  value={settings.startCorner}
                  onChange={(event) =>
                    props.onSettings({
                      ...settings,
                      startCorner: event.target.value as NestingSettings['startCorner'],
                    })
                  }
                >
                  <option value="bottom-left">↙ Sol alt</option>
                  <option value="bottom-right">↘ Sağ alt</option>
                  <option value="top-left">↖ Sol üst</option>
                  <option value="top-right">↗ Sağ üst</option>
                </select>
              </label>
            </div>

            <p>
              Parça aralığı toplam kesim mesafesidir; kerf ayrıca eklenmez. Eğri
              toleransı kadar güvenlik payı her kontur çevresinde korunur. Aynalama
              yapılmaz.
            </p>

            <div className="settings-footer">
              <div className="rotation-group">
                <span id="rotation-label">İzin verilen dönüşler</span>
                <div role="radiogroup" aria-labelledby="rotation-label">
                  {[
                    { label: '0°', angles: [0], hint: 'Yalnızca 0°; yön değişmez' },
                    { label: '0°–90°', angles: [0, 90], hint: '0° veya 90°' },
                    { label: 'Any', angles: ANY_ROTATIONS, hint: '5° örnekleme, iyi açılar çevresinde 1° ince arama' },
                  ].map((mode) => (
                    <label
                      key={mode.label}
                      title={mode.hint}
                      className={
                        settings.rotations.length === mode.angles.length
                          ? 'rotation-chip selected'
                          : 'rotation-chip'
                      }
                    >
                      <input
                        name="rotation-mode"
                        aria-label={mode.label}
                        type="radio"
                        checked={settings.rotations.length === mode.angles.length}
                        onChange={() =>
                          props.onSettings({ ...settings, rotations: [...mode.angles] })
                        }
                      />
                      {mode.label}
                    </label>
                  ))}
                </div>
                <small className="rotation-description">
                  {settings.rotations.length === ANY_ROTATIONS.length
                    ? '5° örnekleme, iyi açılar çevresinde 1° ince arama; süreyle sınırlı'
                    : settings.rotations.length === 2
                      ? 'Yalnızca 0° ve 90°'
                      : 'Parçalar döndürülmez'}
                </small>
              </div>

              <label className="simulation-switch">
                <input
                  type="checkbox"
                  checked={props.autoSimulation}
                  onChange={(event) => props.onAutoSimulation(event.target.checked)}
                />
                <span>
                  <strong>Yerleşimi adım adım göster</strong>
                  <small>Hesaplama sonrası otomatik simülasyon</small>
                </span>
              </label>
            </div>
          </fieldset>
        )}

        {/* =================================================
            PARÇALAR
        ================================================= */}
        {panel === 'parts' && (
          <div className="parts-body">
            <div className="panel-description">
              <div>
                <h3>Kesim adetleri</h3>
                <p>Her kalıbın adedini belirleyin. 0 olan parçalar yerleşime alınmaz.</p>
              </div>
              <div className="bulk-actions">
                <button disabled={props.busy} onClick={() => props.onAllQuantities(1)}>
                  Hepsi 1 adet
                </button>
                <button disabled={props.busy} onClick={() => props.onAllQuantities(0)}>
                  Tümünü çıkar
                </button>
              </div>
            </div>

            <div className="part-catalogue">
              {parts.map((part, index) => {
                const quantity = quantities[part.id] ?? 1;
                const { minX, minY, width, height } = part.bounds;
                return (
                  <article
                    className={`part-card ${quantity === 0 ? 'excluded' : ''}`}
                    key={part.id}
                  >
                    <div className="part-thumbnail">
                      <svg
                        viewBox={`${minX - 8} ${minY - 8} ${width + 16} ${height + 16}`}
                        aria-label={`P${index + 1} önizleme`}
                      >
                        <polygon
                          points={part.outerContour.points
                            .map((p) => `${p.x},${p.y}`)
                            .join(' ')}
                          fill="#e8eefc"
                          stroke="#5174b9"
                          strokeWidth="1.5"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    </div>

                    <div className="part-card-info">
                      <strong>P{index + 1}</strong>
                      <small>
                        {width.toFixed(1)} × {height.toFixed(1)} mm
                      </small>
                      <span>{quantity === 0 ? 'Yerleşim dışında' : `${quantity} adet`}</span>
                    </div>

                    <button
                      className="full-button"
                      disabled={props.busy}
                      onClick={() => props.onFull(part.id)}
                    >
                      Full · Plakayı doldur
                    </button>

                    <div className="quantity-stepper">
                      <button
                        aria-label={`P${index + 1} azalt`}
                        disabled={props.busy || quantity === 0}
                        onClick={() => props.onQuantity(part.id, quantity - 1)}
                      >
                        −
                      </button>
                      <input
                        aria-label={`P${index + 1} adet`}
                        type="number"
                        min="0"
                        max="1000"
                        value={quantity}
                        disabled={props.busy}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (Number.isInteger(value) && value >= 0 && value <= 1000) {
                            props.onQuantity(part.id, value);
                          }
                        }}
                      />
                      <button
                        aria-label={`P${index + 1} artır`}
                        disabled={props.busy || quantity === 1000}
                        onClick={() => props.onQuantity(part.id, quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {/* =================================================
            EXPORT
        ================================================= */}
        {panel === 'export' && (
          <div className="export-body">
            <div className="panel-description">
              <div>
                <h3>Dışa aktarma</h3>
                <p>
                  {props.canExport
                    ? props.unplacedCount > 0
                      ? `${props.unplacedCount} parça yerleşemedi. Yine de kaydedebilirsiniz.`
                      : 'Yerleşim hazır. DXF olarak indirin.'
                    : 'Önce yerleşimi hesaplayın.'}
                </p>
              </div>
            </div>

            <div className="export-grid">
              <button
                type="button"
                className="export-card"
                disabled={!props.canExport || props.busy}
                onClick={() => props.onExport('dxf')}
              >
                <div className="format-icon">DXF</div>
                <strong>DXF olarak kaydet</strong>
                <small>
                  AutoCAD uyumlu DXF dosyası. Kesim makineleriyle uyumludur.
                </small>
                <span className="download-label">↓ İndir</span>
              </button>

              {props.unplacedCount > 0 && (
                <div className="export-card" style={{ cursor: 'default', opacity: 0.85 }}>
                  <div className="format-icon" style={{ background: '#fef3c7', color: '#b45309' }}>
                    ⚠
                  </div>
                  <strong>Eksik yerleşim</strong>
                  <small>
                    {props.unplacedCount} parça plakaya sığmadı. Plaka ölçülerini
                    büyütmeyi veya parça aralığını azaltmayı deneyin.
                  </small>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}