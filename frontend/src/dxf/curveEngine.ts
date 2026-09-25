import { adaptiveEntity, simplifyCurve } from './adaptiveGeometry.js';
import type {
  DxfPoint,
  SerulaCurve,
  SerulaDxfEntity,
} from "./dxfTypes";

/* =========================================================
   AYARLAR
========================================================= */

const SPLINE_SAMPLES = 300;
const ARC_SAMPLES = 100;
const CIRCLE_SAMPLES = 180;
const ELLIPSE_SAMPLES = 180;

const EPSILON = 1e-10;

/* =========================================================
   YARDIMCI FONKSİYONLAR
========================================================= */

function normalizeAngle(angle: number): number {
  if (Math.abs(angle) > Math.PI * 2 + 0.001) {
    return (angle * Math.PI) / 180;
  }

  return angle;
}

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
  tolerance = 0.01,
): boolean {
  return distance(a, b) <= tolerance;
}

/* =========================================================
   B-SPLINE BASIS
========================================================= */

function basisFunction(
  i: number,
  degree: number,
  t: number,
  knots: number[],
): number {
  if (degree === 0) {
    if (
      knots[i] <= t &&
      t < knots[i + 1]
    ) {
      return 1;
    }

    return 0;
  }

  let left = 0;
  let right = 0;

  const leftDenominator =
    knots[i + degree] - knots[i];

  const rightDenominator =
    knots[i + degree + 1] -
    knots[i + 1];

  if (
    Math.abs(leftDenominator) >
    EPSILON
  ) {
    left =
      ((t - knots[i]) /
        leftDenominator) *
      basisFunction(
        i,
        degree - 1,
        t,
        knots,
      );
  }

  if (
    Math.abs(rightDenominator) >
    EPSILON
  ) {
    right =
      ((knots[i + degree + 1] - t) /
        rightDenominator) *
      basisFunction(
        i + 1,
        degree - 1,
        t,
        knots,
      );
  }

  return left + right;
}

/* =========================================================
   SPLINE
========================================================= */

function evaluateSpline(
  entity: SerulaDxfEntity,
): DxfPoint[] {
  const controlPoints =
    entity.controlPoints;

  const knots =
    entity.knotValues;

  const degree =
    entity.degreeOfSplineCurve ?? 3;

  if (
    !controlPoints ||
    controlPoints.length < 2 ||
    !knots ||
    knots.length === 0
  ) {
    return [];
  }

  const weights =
    entity.weights &&
    entity.weights.length ===
      controlPoints.length
      ? entity.weights
      : controlPoints.map(() => 1);

  const start =
    knots[degree];

  const end =
    knots[
      knots.length -
        degree -
        1
    ];

  if (
    start === undefined ||
    end === undefined ||
    end <= start
  ) {
    return [];
  }

  const points: DxfPoint[] = [];

  for (
    let step = 0;
    step <= SPLINE_SAMPLES;
    step++
  ) {
    let t =
      start +
      ((end - start) * step) /
        SPLINE_SAMPLES;

    /*
     * Son knot değerinde recursive basis
     * sıfıra düşebildiği için çok küçük
     * miktar geri çekiyoruz.
     */
    if (step === SPLINE_SAMPLES) {
      t =
        end -
        Math.max(
          Math.abs(end - start) *
            1e-10,
          Number.EPSILON,
        );
    }

    let numeratorX = 0;
    let numeratorY = 0;
    let denominator = 0;

    for (
      let i = 0;
      i < controlPoints.length;
      i++
    ) {
      const basis =
        basisFunction(
          i,
          degree,
          t,
          knots,
        );

      const weight =
        weights[i] ?? 1;

      const weightedBasis =
        basis * weight;

      numeratorX +=
        controlPoints[i].x *
        weightedBasis;

      numeratorY +=
        controlPoints[i].y *
        weightedBasis;

      denominator += weightedBasis;
    }

    if (
      Math.abs(denominator) >
      EPSILON
    ) {
      const x =
        numeratorX / denominator;

      const y =
        numeratorY / denominator;

      if (
        Number.isFinite(x) &&
        Number.isFinite(y)
      ) {
        points.push({
          x,
          y,
        });
      }
    }
  }

  return points;
}

/* =========================================================
   LINE
========================================================= */

function evaluateLine(
  entity: SerulaDxfEntity,
): DxfPoint[] {
  if (
    entity.start &&
    entity.end
  ) {
    return [
      entity.start,
      entity.end,
    ];
  }

  if (
    entity.vertices &&
    entity.vertices.length >= 2
  ) {
    return [
      entity.vertices[0],
      entity.vertices[1],
    ];
  }

  return [];
}

/* =========================================================
   ARC
========================================================= */

function evaluateArc(
  entity: SerulaDxfEntity,
): DxfPoint[] {
  const center =
    entity.center;

  const radius =
    entity.radius;

  if (
    !center ||
    typeof radius !== "number"
  ) {
    return [];
  }

  const startAngle =
    normalizeAngle(
      entity.startAngle ?? 0,
    );

  let endAngle =
    normalizeAngle(
      entity.endAngle ??
        Math.PI * 2,
    );

  while (
    endAngle < startAngle
  ) {
    endAngle += Math.PI * 2;
  }

  const sweep =
    endAngle - startAngle;

  const samples =
    Math.max(
      12,
      Math.ceil(
        ARC_SAMPLES *
          (sweep /
            (Math.PI * 2)),
      ),
    );

  const points: DxfPoint[] = [];

  for (
    let i = 0;
    i <= samples;
    i++
  ) {
    const t =
      i / samples;

    const angle =
      startAngle +
      sweep * t;

    points.push({
      x:
        center.x +
        Math.cos(angle) *
          radius,

      y:
        center.y +
        Math.sin(angle) *
          radius,
    });
  }

  return points;
}

/* =========================================================
   CIRCLE
========================================================= */

function evaluateCircle(
  entity: SerulaDxfEntity,
): DxfPoint[] {
  const center =
    entity.center;

  const radius =
    entity.radius;

  if (
    !center ||
    typeof radius !== "number"
  ) {
    return [];
  }

  const points: DxfPoint[] = [];

  for (
    let i = 0;
    i < CIRCLE_SAMPLES;
    i++
  ) {
    const angle =
      (i / CIRCLE_SAMPLES) *
      Math.PI *
      2;

    points.push({
      x:
        center.x +
        Math.cos(angle) *
          radius,

      y:
        center.y +
        Math.sin(angle) *
          radius,
    });
  }

  return points;
}

/* =========================================================
   ELLIPSE
========================================================= */

function evaluateEllipse(
  entity: SerulaDxfEntity,
): DxfPoint[] {
  const center =
    entity.center;

  const majorAxis =
    entity.majorAxisEndPoint;

  const ratio =
    entity.axisRatio ?? 1;

  if (
    !center ||
    !majorAxis
  ) {
    return [];
  }

  const majorRadius =
    Math.hypot(
      majorAxis.x,
      majorAxis.y,
    );

  if (
    majorRadius <= EPSILON
  ) {
    return [];
  }

  const minorRadius =
    majorRadius * ratio;

  const rotation =
    Math.atan2(
      majorAxis.y,
      majorAxis.x,
    );

  const start =
    entity.startParameter ?? 0;

  let end =
    entity.endParameter ??
    Math.PI * 2;

  while (end < start) {
    end += Math.PI * 2;
  }

  const sweep =
    end - start;

  const samples =
    Math.max(
      24,
      Math.ceil(
        ELLIPSE_SAMPLES *
          (sweep /
            (Math.PI * 2)),
      ),
    );

  const cosRotation =
    Math.cos(rotation);

  const sinRotation =
    Math.sin(rotation);

  const points: DxfPoint[] = [];

  for (
    let i = 0;
    i <= samples;
    i++
  ) {
    const parameter =
      start +
      (sweep * i) / samples;

    const localX =
      majorRadius *
      Math.cos(parameter);

    const localY =
      minorRadius *
      Math.sin(parameter);

    points.push({
      x:
        center.x +
        localX * cosRotation -
        localY * sinRotation,

      y:
        center.y +
        localX * sinRotation +
        localY * cosRotation,
    });
  }

  return points;
}

/* =========================================================
   POLYLINE BULGE
========================================================= */

function evaluateBulgeSegment(
  start: DxfPoint,
  end: DxfPoint,
  bulge: number,
): DxfPoint[] {
  if (
    Math.abs(bulge) <= EPSILON
  ) {
    return [
      start,
      end,
    ];
  }

  const chord =
    distance(start, end);

  if (
    chord <= EPSILON
  ) {
    return [start];
  }

  /*
   * DXF:
   *
   * bulge = tan(theta / 4)
   */

  const theta =
    4 * Math.atan(bulge);

  const sinHalfTheta =
    Math.sin(theta / 2);

  if (
    Math.abs(sinHalfTheta) <=
    EPSILON
  ) {
    return [
      start,
      end,
    ];
  }

  const radius =
    Math.abs(
      chord /
        (2 * sinHalfTheta),
    );

  const midpointX =
    (start.x + end.x) / 2;

  const midpointY =
    (start.y + end.y) / 2;

  const chordAngle =
    Math.atan2(
      end.y - start.y,
      end.x - start.x,
    );

  const halfChord =
    chord / 2;

  const centerDistance =
    Math.sqrt(
      Math.max(
        0,
        radius * radius -
          halfChord * halfChord,
      ),
    );

  const side =
    bulge >= 0 ? 1 : -1;

  const centerX =
    midpointX -
    Math.sin(chordAngle) *
      centerDistance *
      side;

  const centerY =
    midpointY +
    Math.cos(chordAngle) *
      centerDistance *
      side;

  const startAngle =
    Math.atan2(
      start.y - centerY,
      start.x - centerX,
    );

  let endAngle =
    Math.atan2(
      end.y - centerY,
      end.x - centerX,
    );

  if (bulge > 0) {
    while (
      endAngle <= startAngle
    ) {
      endAngle +=
        Math.PI * 2;
    }
  } else {
    while (
      endAngle >= startAngle
    ) {
      endAngle -=
        Math.PI * 2;
    }
  }

  const sweep =
    endAngle - startAngle;

  const samples =
    Math.max(
      8,
      Math.ceil(
        Math.abs(sweep) /
          (Math.PI / 36),
      ),
    );

  const points: DxfPoint[] = [];

  for (
    let i = 0;
    i <= samples;
    i++
  ) {
    const angle =
      startAngle +
      (sweep * i) / samples;

    points.push({
      x:
        centerX +
        Math.cos(angle) *
          radius,

      y:
        centerY +
        Math.sin(angle) *
          radius,
    });
  }

  return points;
}

/* =========================================================
   POLYLINE
========================================================= */

function evaluatePolyline(
  entity: SerulaDxfEntity,
): DxfPoint[] {
  const vertices =
    entity.vertices;

  if (
    !vertices ||
    vertices.length < 2
  ) {
    return [];
  }

  const result: DxfPoint[] = [];

  const segmentCount =
    entity.closed
      ? vertices.length
      : vertices.length - 1;

  for (
    let i = 0;
    i < segmentCount;
    i++
  ) {
    const start =
      vertices[i];

    const end =
      vertices[
        (i + 1) %
          vertices.length
      ];

    const bulge =
      entity.bulges?.[i] ?? 0;

    const segment =
      evaluateBulgeSegment(
        start,
        end,
        bulge,
      );

    if (
      result.length > 0 &&
      segment.length > 0
    ) {
      segment.shift();
    }

    result.push(...segment);
  }

  return result;
}

/* =========================================================
   ENTITY -> POINTS
========================================================= */

function evaluateEntity(
  entity: SerulaDxfEntity,
): DxfPoint[] {
  switch (
    entity.type.toUpperCase()
  ) {
    case "SPLINE":
      return evaluateSpline(
        entity,
      );

    case "LINE":
      return evaluateLine(
        entity,
      );

    case "ARC":
      return evaluateArc(
        entity,
      );

    case "CIRCLE":
      return evaluateCircle(
        entity,
      );

    case "ELLIPSE":
      return evaluateEllipse(
        entity,
      );

    case "LWPOLYLINE":
    case "POLYLINE":
      return evaluatePolyline(
        entity,
      );

    default:
      return [];
  }
}

/* =========================================================
   CLOSED TESPİTİ
========================================================= */

function detectClosed(
  entity: SerulaDxfEntity,
  points: DxfPoint[],
): boolean {
  const type =
    entity.type.toUpperCase();

  /*
   * Circle her zaman kapalıdır.
   */
  if (type === "CIRCLE") {
    return true;
  }

  /*
   * DXF entity açıkça closed diyorsa
   * bunu kabul ediyoruz.
   */
  if (entity.closed === true) {
    return true;
  }

  /*
   * Tam ellipse kapalıdır.
   */
  if (type === "ELLIPSE") {
    const start =
      entity.startParameter ?? 0;

    const end =
      entity.endParameter ??
      Math.PI * 2;

    const sweep =
      Math.abs(end - start);

    if (
      Math.abs(
        sweep -
          Math.PI * 2,
      ) < 0.001
    ) {
      return true;
    }
  }

  /*
   * Özellikle SPLINE'larda parser'ın
   * closed bilgisi her zaman güvenilir
   * olmayabilir.
   *
   * İlk ve son noktalar birbirine
   * yeterince yakınsa kapalı kabul ediyoruz.
   */
  if (points.length >= 3) {
    return pointsEqual(
      points[0],
      points[
        points.length - 1
      ],
    );
  }

  return false;
}

/* =========================================================
   ENTITY -> SERULA CURVE
========================================================= */

function entityToCurve(
  entity: SerulaDxfEntity,
  tolerance?: number,
): SerulaCurve | null {
  const points =
    tolerance === undefined ? evaluateEntity(entity) : simplifyCurve(adaptiveEntity(entity, tolerance / 2) ?? evaluateEntity(entity), tolerance / 2);

  if (points.length < 2) {
    return null;
  }

  let closed =
    detectClosed(
      entity,
      points,
    );
  if (tolerance !== undefined && !entity.closed && !['CIRCLE', 'ELLIPSE'].includes(entity.type.toUpperCase())) {
    closed = points.length >= 3 && pointsEqual(points[0], points[points.length - 1], 1e-8);
  }

  return {
    id:
      `curve-${entity.id}`,
    approximationTolerance: tolerance,

    entityId:
      entity.id,

    entityType:
      entity.type.toUpperCase(),

    /*
     * KRİTİK:
     *
     * Entity'nin kendi layer bilgisi
     * aynen korunuyor.
     */
    layer:
      entity.layer,

    /*
     * KRİTİK:
     *
     * Renk burada yeniden hesaplanmıyor.
     *
     * dxfNormalizer tarafından belirlenen
     * renk aynen taşınıyor.
     *
     * Örneğin:
     *
     * kırmızı dış kontur
     *   └─ yeşil iç kontur
     *       └─ mavi başka geometri
     *
     * şeklindeki DXF yapısı renklerini
     * kaybetmez.
     */
    color: {
      ...entity.color,
    },

    points,

    closed,
  };
}

/* =========================================================
   PUBLIC API
========================================================= */

/*
 * Ana fonksiyon.
 *
 * DXF entity listesini SerulaCurve
 * listesine dönüştürür.
 *
 * Bundan sonra viewer, contour engine
 * ve nesting engine aynı curve verisini
 * kullanabilir.
 */

export function createCurvesFromEntities(
  entities: SerulaDxfEntity[],
  options: { tolerance?: number } = {},
): SerulaCurve[] {
  const curves: SerulaCurve[] = [];

  for (const entity of entities) {
    const curve =
      entityToCurve(entity, options.tolerance);

    if (curve) {
      curves.push(curve);
    }
  }

  return curves;
}

/* =========================================================
   İSTATİSTİK
========================================================= */

export function getCurveStatistics(
  curves: SerulaCurve[],
) {
  const closed =
    curves.filter(
      (curve) =>
        curve.closed,
    ).length;

  const open =
    curves.length - closed;

  const colors =
    new Set(
      curves.map(
        (curve) =>
          curve.color.hex ??
          "unknown",
      ),
    );

  const layers =
    new Set(
      curves.map(
        (curve) =>
          curve.layer,
      ),
    );

  return {
    total:
      curves.length,

    closed,

    open,

    colors:
      colors.size,

    layers:
      layers.size,
  };
}
