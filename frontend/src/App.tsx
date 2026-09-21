import {
  useCallback,
  useRef,
  useState,
} from "react";

import DxfParser from "dxf-parser";

import DxfViewer from "./dxf/DxfViewer";
import { normalizeDxfEntities } from "./dxf/dxfNormalizer";
import type { SerulaDxfEntity } from "./dxf/dxfTypes";

import "./App.css";

function App() {
  const [navigation, setNavigation] = useState<{ panel: "viewer" | "settings" | "parts" | "export"; token: number }>({ panel: "viewer", token: 0 });
  const navigate = (panel: typeof navigation.panel) => setNavigation({ panel, token: Date.now() });
  const fileInputRef =
    useRef<HTMLInputElement>(null);

  const [fileName, setFileName] =
    useState("");

  const [entities, setEntities] =
    useState<SerulaDxfEntity[]>([]);

  const [error, setError] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(false);

  /*
   * =========================================================
   * DXF METNİNİ OKU
   * =========================================================
   */

  const parseDxfText = useCallback(
    (
      text: string,
      name: string,
    ) => {
      const parser =
        new DxfParser();

      const dxf =
        parser.parseSync(text);

      if (!dxf) {
        throw new Error(
          "DXF dosyası okunamadı.",
        );
      }

      const normalizedEntities =
        normalizeDxfEntities(dxf);

      setFileName(name);
      setEntities(
        normalizedEntities,
      );
      setError("");
    },
    [],
  );

  /*
   * =========================================================
   * DOSYA SEÇ
   * =========================================================
   */

  const handleSelectFile =
    () => {
      fileInputRef.current?.click();
    };

  /*
   * =========================================================
   * MANUEL DXF YÜKLE
   * =========================================================
   */

  const handleFileChange =
    async (
      event: React.ChangeEvent<HTMLInputElement>,
    ) => {
      const file =
        event.target.files?.[0];

      if (!file) {
        return;
      }

      if (
        !file.name
          .toLowerCase()
          .endsWith(".dxf")
      ) {
        setError(
          "Lütfen geçerli bir DXF dosyası seçin.",
        );

        event.target.value = "";

        return;
      }

      try {
        setIsLoading(true);
        setError("");

        const text =
          await file.text();

        parseDxfText(
          text,
          file.name,
        );
      } catch (err) {
        console.error(
          "DXF okuma hatası:",
          err,
        );

        setFileName("");
        setEntities([]);

        setError(
          err instanceof Error
            ? err.message
            : "DXF dosyası okunurken bilinmeyen bir hata oluştu.",
        );
      } finally {
        setIsLoading(false);

        event.target.value = "";
      }
    };

  /*
   * =========================================================
   * İSTATİSTİKLER
   * =========================================================
   */

  const splineCount =
    entities.filter(
      (entity) =>
        entity.type ===
        "SPLINE",
    ).length;

  const lineCount =
    entities.filter(
      (entity) =>
        entity.type ===
        "LINE",
    ).length;

  const arcCount =
    entities.filter(
      (entity) =>
        entity.type ===
        "ARC",
    ).length;

  const circleCount =
    entities.filter(
      (entity) =>
        entity.type ===
        "CIRCLE",
    ).length;

  const polylineCount =
    entities.filter(
      (entity) =>
        entity.type ===
          "POLYLINE" ||
        entity.type ===
          "LWPOLYLINE",
    ).length;

  const layers =
    Array.from(
      new Set(
        entities.map(
          (entity) =>
            entity.layer,
        ),
      ),
    );

  const colors =
    Array.from(
      new Set(
        entities
          .map(
            (entity) =>
              entity.color.hex,
          )
          .filter(
            (
              color,
            ): color is string =>
              Boolean(color),
          ),
      ),
    );

  /*
   * =========================================================
   * UI
   * =========================================================
   */

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-mark">
            S
          </div>

          <div>
            <strong>
              Serula
            </strong>

            <span>
              Nesting Pro
            </span>
          </div>
        </div>

        <nav className="navigation">
          <button className={navigation.panel === "viewer" ? "nav-item active" : "nav-item"} onClick={() => navigate("viewer")}>
            <span>⌂</span>
            DXF Viewer
          </button>

          <button
            className="nav-item"
            onClick={
              handleSelectFile
            }
          >
            <span>＋</span>
            DXF Yükle
          </button>

          <button className={navigation.panel === "parts" ? "nav-item active" : "nav-item"} onClick={() => navigate("parts")}>
            <span>▱</span>
            Parçalar
          </button>

          <button className="nav-item" onClick={() => navigate("viewer")}>
            <span>◫</span>
            Nesting
          </button>

          <button className={navigation.panel === "settings" ? "nav-item active" : "nav-item"} onClick={() => navigate("settings")}>
            <span>⚙</span>
            Ayarlar
          </button>
          <button className={navigation.panel === "export" ? "nav-item active" : "nav-item"} onClick={() => navigate("export")}><span>↗</span>Dışa aktar</button>
        </nav>

        <div className="sidebar-footer">
          <span>
            Serula Nesting Pro
          </span>

          <small>
            DXF Engine
          </small>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h1>
              DXF Görüntüleyici
            </h1>

            <p>
              Geometri, layer ve
              renk kontrolü
            </p>
          </div>

          <button
            className="new-project-button"
            onClick={
              handleSelectFile
            }
            disabled={
              isLoading
            }
          >
            {isLoading
              ? "DXF Okunuyor..."
              : "＋ DXF Seç"}
          </button>

          <input
            ref={
              fileInputRef
            }
            type="file"
            accept=".dxf"
            onChange={
              handleFileChange
            }
            style={{
              display:
                "none",
            }}
          />
        </header>

        {error && (
          <div
            style={{
              padding:
                "16px 18px",

              marginBottom:
                "20px",

              borderRadius:
                "16px",

              background:
                "rgba(255, 80, 80, 0.10)",

              border:
                "1px solid rgba(200, 40, 40, 0.15)",

              color:
                "#b42318",

              fontWeight:
                600,
            }}
          >
            Hata: {error}
          </div>
        )}

        {entities.length ===
          0 &&
          !error && (
            <section className="welcome-card">
              <div className="welcome-text">
                <span className="eyebrow">
                  SERULA DXF ENGINE
                </span>

                <h2>
                  DXF dosyanızı
                  <br />
                  görüntüleyin.
                </h2>

                <p>
                  DXF geometrisi,
                  eğriler, layer
                  bilgileri ve
                  renkler korunarak
                  Serula geometri
                  motoruna
                  aktarılacaktır.
                </p>

                <button
                  className="primary-button"
                  onClick={
                    handleSelectFile
                  }
                  disabled={
                    isLoading
                  }
                >
                  {isLoading
                    ? "DXF Okunuyor..."
                    : "DXF Dosyası Seç"}
                </button>
              </div>

              <div className="visual-card">
                <div
                  style={{
                    textAlign:
                      "center",

                    color:
                      "#999",
                  }}
                >
                  {isLoading
                    ? "DXF okunuyor..."
                    : "Başlamak için DXF dosyası seçin."}
                </div>
              </div>
            </section>
          )}

        {entities.length >
          0 && (
          <>
            <div
              style={{
                display:
                  "flex",

                gap:
                  "10px",

                flexWrap:
                  "wrap",

                marginBottom:
                  "16px",
              }}
            >
              <InfoCard
                title="Dosya"
                value={
                  fileName
                }
              />

              <InfoCard
                title="Entity"
                value={
                  entities.length
                }
              />

              <InfoCard
                title="SPLINE"
                value={
                  splineCount
                }
              />

              <InfoCard
                title="LINE"
                value={
                  lineCount
                }
              />

              <InfoCard
                title="ARC"
                value={
                  arcCount
                }
              />

              <InfoCard
                title="CIRCLE"
                value={
                  circleCount
                }
              />

              <InfoCard
                title="POLYLINE"
                value={
                  polylineCount
                }
              />

              <InfoCard
                title="Layer"
                value={
                  layers.length
                }
              />

              <InfoCard
                title="Renk"
                value={
                  colors.length
                }
              />
            </div>

            {colors.length >
              0 && (
              <div
                style={{
                  display:
                    "flex",

                  alignItems:
                    "center",

                  gap:
                    "8px",

                  flexWrap:
                    "wrap",

                  marginBottom:
                    "16px",

                  padding:
                    "10px 14px",

                  borderRadius:
                    "14px",

                  background:
                    "rgba(255,255,255,0.65)",

                  border:
                    "1px solid rgba(255,255,255,0.8)",
                }}
              >
                <span
                  style={{
                    fontSize:
                      "12px",

                    color:
                      "#777",

                    marginRight:
                      "4px",
                  }}
                >
                  DXF Renkleri
                </span>

                {colors.map(
                  (
                    color,
                  ) => (
                    <div
                      key={
                        color
                      }
                      title={
                        color
                      }
                      style={{
                        width:
                          "22px",

                        height:
                          "22px",

                        borderRadius:
                          "7px",

                        background:
                          color,

                        border:
                          "1px solid rgba(0,0,0,0.15)",

                        boxShadow:
                          "0 2px 6px rgba(0,0,0,0.08)",
                      }}
                    />
                  ),
                )}
              </div>
            )}

            <DxfViewer navigation={navigation}
              entities={
                entities
              }
            />
          </>
        )}
      </main>
    </div>
  );
}

/*
 * =========================================================
 * INFO CARD
 * =========================================================
 */

type InfoCardProps = {
  title: string;
  value:
    | string
    | number;
};

function InfoCard({
  title,
  value,
}: InfoCardProps) {
  return (
    <div
      style={{
        padding:
          "9px 13px",

        borderRadius:
          "13px",

        background:
          "rgba(255,255,255,0.72)",

        border:
          "1px solid rgba(255,255,255,0.85)",

        boxShadow:
          "0 5px 15px rgba(0,0,0,0.03)",

        fontSize:
          "12px",
      }}
    >
      <span
        style={{
          color:
            "#888",

          marginRight:
            "6px",
        }}
      >
        {title}:
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}

export default App;
