/*
 * Serula Nesting Pro
 * DXF ortak veri tipleri
 *
 * Bu dosyada çizim yapılmaz.
 * DXF'ten okunan bilgilerin uygulama içinde
 * nasıl saklanacağını tanımlar.
 */

/* =========================================================
   TEMEL NOKTA
========================================================= */

export interface DxfPoint {
  x: number;
  y: number;
  z?: number;
}

/* =========================================================
   RENK
========================================================= */

export interface DxfColor {
  /*
   * DXF ACI renk numarası.
   * Örnek:
   * 1 = Red
   * 2 = Yellow
   * 3 = Green
   * ...
   */
  aci?: number;

  /*
   * DXF TrueColor değeri.
   * 24-bit RGB bilgisi olabilir.
   */
  trueColor?: number;

  /*
   * Tarayıcıda kullanılacak gerçek renk.
   * Örnek: #ff0000
   */
  hex?: string;

  /*
   * Rengin nereden geldiğini saklarız.
   *
   * entity:
   * Çizginin kendi rengi.
   *
   * layer:
   * Bağlı olduğu layer'ın rengi.
   *
   * default:
   * DXF'te renk bulunamadı.
   */
  source:
    | "entity"
    | "layer"
    | "default";
}

/* =========================================================
   DESTEKLENEN DXF ENTITY TÜRLERİ
========================================================= */

export type SupportedDxfEntityType =
  | "LINE"
  | "ARC"
  | "CIRCLE"
  | "ELLIPSE"
  | "SPLINE"
  | "LWPOLYLINE"
  | "POLYLINE";

/* =========================================================
   HAM DXF ENTITY
========================================================= */

export interface SerulaDxfEntity {
  id: string;

  type: string;

  layer: string;

  color: DxfColor;

  /* ---------- SPLINE ---------- */

  degreeOfSplineCurve?: number;

  controlPoints?: DxfPoint[];

  knotValues?: number[];

  weights?: number[];

  fitPoints?: DxfPoint[];

  /* ---------- LINE ---------- */

  start?: DxfPoint;

  end?: DxfPoint;

  /* ---------- POLYLINE ---------- */

  vertices?: DxfPoint[];

  closed?: boolean;

  /*
   * LWPOLYLINE içindeki bulge değerleri
   * daha sonra yayları doğru hesaplamak
   * için kullanılacak.
   */
  bulges?: number[];

  /* ---------- ARC / CIRCLE ---------- */

  center?: DxfPoint;

  radius?: number;

  startAngle?: number;

  endAngle?: number;

  /* ---------- ELLIPSE ---------- */

  majorAxisEndPoint?: DxfPoint;

  axisRatio?: number;

  startParameter?: number;

  endParameter?: number;

  /*
   * Orijinal parser verisini gerekirse
   * kaybetmeden saklayabilmek için.
   */
  raw?: unknown;
}

/* =========================================================
   HESAPLANMIŞ GEOMETRİ
========================================================= */

export interface SerulaCurve {
  id: string;

  entityId: string;

  entityType: string;

  layer: string;

  color: DxfColor;

  /*
   * SPLINE / ARC / POLYLINE gibi geometriler
   * nesting motorunda kullanılmadan önce
   * yeterli hassasiyetle noktalara çevrilebilir.
   */
  points: DxfPoint[];

  closed: boolean;
}

/* =========================================================
   BOUNDING BOX
========================================================= */

export interface GeometryBounds {
  minX: number;
  minY: number;

  maxX: number;
  maxY: number;

  width: number;
  height: number;
}

/* =========================================================
   KONTUR
========================================================= */

export type ContourRole =
  | "outer"
  | "hole"
  | "unknown";

export interface SerulaContour {
  id: string;

  /*
   * Dış sınır mı, iç boşluk mu?
   */
  role: ContourRole;

  curves: SerulaCurve[];

  points: DxfPoint[];

  closed: boolean;

  bounds: GeometryBounds;

  /*
   * İşaretli alan.
   * Daha sonra outer/hole tespitinde
   * ve nesting hesaplarında kullanılabilir.
   */
  signedArea?: number;

  absoluteArea?: number;
}

/* =========================================================
   NESTING PARÇASI
========================================================= */

export interface NestingPart {
  id: string;

  name: string;

  /*
   * Bir parçanın bir dış konturu vardır.
   */
  outerContour: SerulaContour;

  /*
   * Parçanın içindeki delikler / kesimler.
   * Birden fazla olabilir.
   */
  holes: SerulaContour[];

  bounds: GeometryBounds;

  /*
   * Kullanıcının nesting için istediği adet.
   *
   * Örnek:
   * 0  = kullanma
   * 7  = 7 tane yerleştir
   * 15 = 15 tane yerleştir
   */
  quantity: number;

  /*
   * Parçanın DXF'teki ana layer bilgisi.
   */
  layer?: string;

  /*
   * Görsel veya işlem gruplaması için
   * ana renk bilgisi.
   */
  color?: DxfColor;

  /*
   * İleride yön kısıtlaması için.
   *
   * Örnek:
   * [0]
   * [0, 180]
   * [0, 90, 180, 270]
   */
  allowedRotations?: number[];

  /*
   * Malzemenin esneme/yön bilgisine göre
   * parçanın serbest döndürülüp
   * döndürülemeyeceği.
   */
  lockDirection?: boolean;
}

/* =========================================================
   DXF DOKÜMANI
========================================================= */

export interface SerulaDxfDocument {
  fileName: string;

  entities: SerulaDxfEntity[];

  curves: SerulaCurve[];

  contours: SerulaContour[];

  parts: NestingPart[];

  bounds?: GeometryBounds;

  statistics: {
    totalEntities: number;

    splineCount: number;

    lineCount: number;

    arcCount: number;

    circleCount: number;

    ellipseCount: number;

    polylineCount: number;

    unsupportedCount: number;
  };
}