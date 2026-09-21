import type {
  DxfPoint,
  GeometryBounds,
  NestingPart,
  SerulaContour,
  SerulaCurve,
} from "./dxfTypes";

import {
  pointInPolygon,
} from "./contourEngine";

/* =========================================================
   AYARLAR
========================================================= */

const TOLERANCE = 0.01;

/* =========================================================
   BOUNDS
========================================================= */

function boundsContains(
  outer: GeometryBounds,
  inner: GeometryBounds,
): boolean {
  return (
    inner.minX >=
      outer.minX - TOLERANCE &&
    inner.maxX <=
      outer.maxX + TOLERANCE &&
    inner.minY >=
      outer.minY - TOLERANCE &&
    inner.maxY <=
      outer.maxY + TOLERANCE
  );
}

/* =========================================================
   TEST NOKTASI
========================================================= */

function getTestPoint(
  contour: SerulaContour,
): DxfPoint {
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
   CONTOUR CONTAINMENT
========================================================= */

function contourContainsContour(
  outer: SerulaContour,
  inner: SerulaContour,
): boolean {
  if (
    outer.id === inner.id
  ) {
    return false;
  }

  if (
    !boundsContains(
      outer.bounds,
      inner.bounds,
    )
  ) {
    return false;
  }

  const point =
    getTestPoint(inner);

  return pointInPolygon(
    point,
    outer.points,
  );
}

/* =========================================================
   CURVE TEST NOKTASI
========================================================= */

function getCurveTestPoints(
  curve: SerulaCurve,
): DxfPoint[] {
  if (
    curve.points.length === 0
  ) {
    return [];
  }

  if (
    curve.points.length === 1
  ) {
    return [
      curve.points[0],
    ];
  }

  const first =
    curve.points[0];

  const last =
    curve.points[
      curve.points.length - 1
    ];

  const middle =
    curve.points[
      Math.floor(
        curve.points.length / 2,
      )
    ];

  return [
    first,
    middle,
    last,
  ];
}

/* =========================================================
   CURVE PARÇANIN İÇİNDE Mİ?
========================================================= */

/*
 * Bu fonksiyon özellikle senin söylediğin durum için:
 *
 * KIRMIZI DIŞ KONTUR
 *
 *      YEŞİL ÇİZGİ
 *      SİYAH İŞARET
 *      MAVİ ÇİZGİ
 *
 * İç çizgiler kapalı olmak zorunda değil.
 *
 * Eğer geometri dış konturun içindeyse
 * o parçaya ait kabul edilebilir.
 */

export function curveBelongsToPart(
  curve: SerulaCurve,
  outerContour: SerulaContour,
): boolean {
  /*
   * Dış konturun kendi curve'ü ise
   * zaten parçaya aittir.
   */
  if (
    outerContour.curves.some(
      (outerCurve) =>
        outerCurve.id ===
        curve.id,
    )
  ) {
    return true;
  }

  const testPoints =
    getCurveTestPoints(
      curve,
    );

  if (
    testPoints.length === 0
  ) {
    return false;
  }

  /*
   * Üç test noktasından en az ikisi
   * parçanın içindeyse bu curve'ü
   * parçaya bağlıyoruz.
   */

  let insideCount = 0;

  for (
    const point of testPoints
  ) {
    if (
      pointInPolygon(
        point,
        outerContour.points,
      )
    ) {
      insideCount++;
    }
  }

  return (
    insideCount >=
    Math.ceil(
      testPoints.length / 2,
    )
  );
}

/* =========================================================
   DIRECT HOLES
========================================================= */

/*
 * Bir dış konturun içindeki her hole'u
 * doğrudan ona bağlamıyoruz.
 *
 * Örneğin:
 *
 * OUTER A
 *   HOLE A
 *     OUTER B
 *       HOLE B
 *
 * HOLE B, OUTER A'nın değil,
 * OUTER B'nin deliğidir.
 *
 * Bu nedenle hole'un içinde bulunduğu
 * en küçük OUTER'ı buluyoruz.
 */

function findDirectHoles(
  outerContour: SerulaContour,
  allContours: SerulaContour[],
): SerulaContour[] {
  const holes =
    allContours.filter(
      (contour) =>
        contour.role === "hole" &&
        contourContainsContour(
          outerContour,
          contour,
        ),
    );

  return holes.filter(
    (hole) => {
      /*
       * Hole ile bizim outer arasında
       * daha küçük başka bir OUTER
       * bulunuyorsa bu hole doğrudan
       * bizim değildir.
       */

      const intermediateOuter =
        allContours.some(
          (candidate) => {
            if (
              candidate.role !==
              "outer"
            ) {
              return false;
            }

            if (
              candidate.id ===
              outerContour.id
            ) {
              return false;
            }

            if (
              candidate.id ===
              hole.id
            ) {
              return false;
            }

            const candidateArea =
              candidate.absoluteArea ??
              0;

            const outerArea =
              outerContour.absoluteArea ??
              0;

            const holeArea =
              hole.absoluteArea ??
              0;

            if (
              candidateArea >=
                outerArea ||
              candidateArea <=
                holeArea
            ) {
              return false;
            }

            return (
              contourContainsContour(
                outerContour,
                candidate,
              ) &&
              contourContainsContour(
                candidate,
                hole,
              )
            );
          },
        );

      return !intermediateOuter;
    },
  );
}

/* =========================================================
   PART NAME
========================================================= */

function createPartName(
  index: number,
  outerContour: SerulaContour,
): string {
  const layer =
    outerContour.curves[0]?.layer;

  if (
    layer &&
    layer !== "0"
  ) {
    return `${layer} - Parça ${
      index + 1
    }`;
  }

  return `Parça ${index + 1}`;
}

/* =========================================================
   OUTER CONTOUR -> NESTING PART
========================================================= */

function createPart(
  outerContour: SerulaContour,
  contours: SerulaContour[],
  index: number,
): NestingPart {
  const holes =
    findDirectHoles(
      outerContour,
      contours,
    );

  const primaryCurve =
    outerContour.curves[0];

  return {
    id: `part-${index}`,

    name:
      createPartName(
        index,
        outerContour,
      ),

    outerContour,

    holes,

    bounds:
      outerContour.bounds,

    /*
     * Şimdilik her parça ilk açıldığında
     * 1 adet.
     *
     * Daha sonra kullanıcı bunu:
     * 2, 4, 8, 10...
     * şeklinde değiştirebilecek.
     */
    quantity: 1,

    layer:
      primaryCurve?.layer,

    color:
      primaryCurve
        ? {
            ...primaryCurve.color,
          }
        : undefined,

    /*
     * Şimdilik standart rotasyonlar.
     *
     * Sonra ayakkabı parçalarında:
     * yön kilidi / damar yönü /
     * esneme yönü gibi kurallar
     * buraya bağlanacak.
     */
    allowedRotations: undefined,

    lockDirection: false,
  };
}

/* =========================================================
   PUBLIC API
========================================================= */

/*
 * Contour listesinden gerçek
 * NestingPart listesi oluşturur.
 */

export function createPartsFromContours(
  contours: SerulaContour[],
): NestingPart[] {
  const outerContours =
    contours
      .filter(
        (contour) =>
          contour.role ===
          "outer",
      )
      .sort(
        (a, b) =>
          (b.absoluteArea ?? 0) -
          (a.absoluteArea ?? 0),
      );

  return outerContours.map(
    (
      outerContour,
      index,
    ) =>
      createPart(
        outerContour,
        contours,
        index,
      ),
  );
}

/* =========================================================
   PARÇAYA AİT TÜM CURVE'LER
========================================================= */

/*
 * Bu fonksiyon çok önemli.
 *
 * Bir parçanın sadece dış konturunu ve
 * deliklerini değil, içindeki açık veya
 * farklı renkli çizgileri de bulur.
 *
 * Böylece nesting sırasında:
 *
 * kırmızı dış çizgi
 * + yeşil iç çizgi
 * + siyah işaret
 *
 * TEK PARÇA olarak hareket ettirilebilir.
 */

export function getCurvesForPart(
  part: NestingPart,
  allCurves: SerulaCurve[],
): SerulaCurve[] {
  return allCurves.filter(
    (curve) =>
      curveBelongsToPart(
        curve,
        part.outerContour,
      ),
  );
}

/* =========================================================
   PART STATISTICS
========================================================= */

export function getPartStatistics(
  parts: NestingPart[],
  allCurves: SerulaCurve[],
) {
  let holeCount = 0;
  let attachedCurveCount = 0;

  for (const part of parts) {
    holeCount +=
      part.holes.length;

    attachedCurveCount +=
      getCurvesForPart(
        part,
        allCurves,
      ).length;
  }

  return {
    totalParts:
      parts.length,

    totalHoles:
      holeCount,

    attachedCurves:
      attachedCurveCount,
  };
}
