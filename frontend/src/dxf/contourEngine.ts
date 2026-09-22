import type {
  DxfPoint,
  GeometryBounds,
  SerulaContour,
  SerulaCurve,
} from "./dxfTypes";

/* =========================================================
   AYARLAR
========================================================= */

/*
 * İki noktanın aynı kabul edilebilmesi için tolerans.
 * DXF dosyalarında çok küçük ondalık farklar olabilir.
 */
const POINT_TOLERANCE = 0.01;

/*
 * Alanı bundan küçük konturları geçersiz sayıyoruz.
 * Çok küçük / bozuk geometrilerin parça sanılmasını önler.
 */
const MIN_CONTOUR_AREA = 0.0001;

/* =========================================================
   NOKTA YARDIMCILARI
========================================================= */

function distance(
  a: DxfPoint,
  b: DxfPoint,
): number {
  return Math.hypot(
    b.x - a.x,
    b.y - a.y,
  );
}

function pointsEqual(
  a: DxfPoint,
  b: DxfPoint,
  tolerance = POINT_TOLERANCE,
): boolean {
  return (
    distance(a, b) <=
    tolerance
  );
}

function clonePoint(
  point: DxfPoint,
): DxfPoint {
  return {
    x: point.x,
    y: point.y,

    ...(typeof point.z === "number"
      ? { z: point.z }
      : {}),
  };
}

/* =========================================================
   BOUNDS
========================================================= */

export function calculateGeometryBounds(
  points: DxfPoint[],
): GeometryBounds | null {
  if (points.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;

  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(
      minX,
      point.x,
    );

    minY = Math.min(
      minY,
      point.y,
    );

    maxX = Math.max(
      maxX,
      point.x,
    );

    maxY = Math.max(
      maxY,
      point.y,
    );
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,

    width:
      maxX - minX,

    height:
      maxY - minY,
  };
}

/* =========================================================
   POLYGON AREA
========================================================= */

export function calculateSignedArea(
  points: DxfPoint[],
): number {
  if (points.length < 3) {
    return 0;
  }

  let area = 0;

  for (
    let i = 0;
    i < points.length;
    i++
  ) {
    const current =
      points[i];

    const next =
      points[
        (i + 1) %
          points.length
      ];

    area +=
      current.x * next.y -
      next.x * current.y;
  }

  return area / 2;
}

export function calculateAbsoluteArea(
  points: DxfPoint[],
): number {
  return Math.abs(
    calculateSignedArea(
      points,
    ),
  );
}

/* =========================================================
   POINT IN POLYGON
========================================================= */

/*
 * Bir nokta kapalı polygon'un içinde mi?
 *
 * Ray-casting algoritması kullanıyoruz.
 */
export function pointInPolygon(
  point: DxfPoint,
  polygon: DxfPoint[],
): boolean {
  if (polygon.length < 3) {
    return false;
  }

  let inside = false;

  for (
    let i = 0,
      j = polygon.length - 1;
    i < polygon.length;
    j = i++
  ) {
    const pi =
      polygon[i];

    const pj =
      polygon[j];

    const intersects =
      pi.y > point.y !==
        pj.y > point.y &&
      point.x <
        ((pj.x - pi.x) *
          (point.y - pi.y)) /
          (pj.y -
            pi.y +
            Number.EPSILON) +
          pi.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

/* =========================================================
   BOUNDS CONTAINMENT
========================================================= */

function boundsContains(
  outer: GeometryBounds,
  inner: GeometryBounds,
): boolean {
  return (
    inner.minX >=
      outer.minX -
        POINT_TOLERANCE &&

    inner.maxX <=
      outer.maxX +
        POINT_TOLERANCE &&

    inner.minY >=
      outer.minY -
        POINT_TOLERANCE &&

    inner.maxY <=
      outer.maxY +
        POINT_TOLERANCE
  );
}

/* =========================================================
   CURVE -> CLOSED POINTS
========================================================= */

function normalizeClosedPoints(
  points: DxfPoint[],
  tolerance = POINT_TOLERANCE,
): DxfPoint[] {
  if (points.length < 3) {
    return [];
  }

  const result =
    points.map(
      clonePoint,
    );

  /*
   * İlk ve son nokta aynıysa
   * polygon hesabında duplicate
   * noktaya ihtiyacımız yok.
   */
  if (
    result.length > 1 &&
    pointsEqual(
      result[0],
      result[
        result.length - 1
      ],
      tolerance,
    )
  ) {
    result.pop();
  }

  return result;
}

/* =========================================================
   TEK CURVE'DEN CONTOUR
========================================================= */

function curveToContour(
  curve: SerulaCurve,
  index: number,
): SerulaContour | null {
  /*
   * Şimdilik yalnızca gerçekten
   * kapalı curve'leri contour
   * kabul ediyoruz.
   */
  if (!curve.closed) {
    return null;
  }

  const points =
    normalizeClosedPoints(
      curve.points,
      curve.approximationTolerance === undefined ? POINT_TOLERANCE : 1e-8,
    );

  if (points.length < 3) {
    return null;
  }

  const bounds =
    calculateGeometryBounds(
      points,
    );

  if (!bounds) {
    return null;
  }

  const signedArea =
    calculateSignedArea(
      points,
    );

  const absoluteArea =
    Math.abs(
      signedArea,
    );

  if (
    absoluteArea <
    MIN_CONTOUR_AREA
  ) {
    return null;
  }

  return {
    id: `contour-${index}`,

    role: "unknown",

    /*
     * Curve nesnesini olduğu gibi
     * saklıyoruz.
     *
     * Böylece:
     * - renk
     * - layer
     * - entity id
     * - entity type
     *
     * KAYBOLMUYOR.
     */
    curves: [curve],

    points,

    closed: true,

    bounds,

    signedArea,
    absoluteArea,
  };
}

/* =========================================================
   CONTOUR İÇİN TEST NOKTASI
========================================================= */

function getContourTestPoint(
  contour: SerulaContour,
): DxfPoint {
  /*
   * Polygon'un ilk noktasını kullanmak yerine
   * bounds merkezini deniyoruz.
   *
   * Eğer merkez polygon içinde değilse
   * ilk noktaya yakın bir iç nokta
   * oluşturmaya çalışıyoruz.
   */

  const center: DxfPoint = {
    x:
      (contour.bounds.minX +
        contour.bounds.maxX) /
      2,

    y:
      (contour.bounds.minY +
        contour.bounds.maxY) /
      2,
  };

  if (
    pointInPolygon(
      center,
      contour.points,
    )
  ) {
    return center;
  }

  const first =
    contour.points[0];

  return {
    x:
      first.x * 0.99 +
      center.x * 0.01,

    y:
      first.y * 0.99 +
      center.y * 0.01,
  };
}

/* =========================================================
   CONTOUR DEPTH
========================================================= */

/*
 * Örnek:
 *
 * Büyük dış kontur      depth 0 = OUTER
 *
 *   iç delik            depth 1 = HOLE
 *
 *     deliğin içindeki
 *     ada               depth 2 = OUTER
 *
 *       onun deliği     depth 3 = HOLE
 *
 * Bu yöntem sayesinde:
 *
 * kırmızı dış konturun içinde
 * yeşil bir kontur olsa bile
 * renk üzerinden karar vermiyoruz.
 *
 * GEOMETRİ üzerinden karar veriyoruz.
 */

function calculateContourDepth(
  contour: SerulaContour,
  contours: SerulaContour[],
): number {
  const testPoint =
    getContourTestPoint(
      contour,
    );

  let depth = 0;

  for (
    const possibleParent of
      contours
  ) {
    if (
      possibleParent.id ===
      contour.id
    ) {
      continue;
    }

    /*
     * Parent mutlaka daha büyük olmalı.
     */
    if (
      (possibleParent.absoluteArea ??
        0) <=
      (contour.absoluteArea ??
        0)
    ) {
      continue;
    }

    /*
     * Önce ucuz bounds testi.
     */
    if (
      !boundsContains(
        possibleParent.bounds,
        contour.bounds,
      )
    ) {
      continue;
    }

    /*
     * Sonra gerçek polygon testi.
     */
    if (
      pointInPolygon(
        testPoint,
        possibleParent.points,
      )
    ) {
      depth++;
    }
  }

  return depth;
}

/* =========================================================
   ROLE TESPİTİ
========================================================= */

function classifyContours(
  contours: SerulaContour[],
): SerulaContour[] {
  return contours.map(
    (contour) => {
      const depth =
        calculateContourDepth(
          contour,
          contours,
        );

      /*
       * Çift depth = dış geometri
       * Tek depth = delik
       */

      const role =
        depth % 2 === 0
          ? "outer"
          : "hole";

      return {
        ...contour,
        role,
      };
    },
  );
}

/* =========================================================
   PUBLIC API
========================================================= */

/*
 * SerulaCurve[] alır.
 *
 * Sonuç:
 *
 * - kapalı konturlar
 * - outer / hole ayrımı
 * - bounds
 * - alan
 * - renk/layer bilgileri korunmuş curve'ler
 */
export function detectContours(
  curves: SerulaCurve[],
): SerulaContour[] {
  const contours =
    curves
      .map(
        (
          curve,
          index,
        ) =>
          curveToContour(
            curve,
            index,
          ),
      )
      .filter(
        (
          contour,
        ): contour is SerulaContour =>
          contour !== null,
      );

  return classifyContours(
    contours,
  );
}

/* =========================================================
   DEBUG / İSTATİSTİK
========================================================= */

export function getContourStatistics(
  contours: SerulaContour[],
) {
  const outer =
    contours.filter(
      (contour) =>
        contour.role ===
        "outer",
    );

  const holes =
    contours.filter(
      (contour) =>
        contour.role ===
        "hole",
    );

  return {
    total:
      contours.length,

    outer:
      outer.length,

    holes:
      holes.length,
  };
}
