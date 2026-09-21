import type {
  DxfColor,
  DxfPoint,
  SerulaDxfEntity,
} from "./dxfTypes";

/* =========================================================
   RAW DXF TYPES
========================================================= */

interface RawPoint {
  x?: number;
  y?: number;
  z?: number;
}

interface RawEntity {
  type?: string;
  layer?: string;

  color?: number;
  colorIndex?: number;
  colorNumber?: number;
  trueColor?: number;

  degreeOfSplineCurve?: number;

  controlPoints?: RawPoint[];
  knotValues?: number[];
  weights?: number[];
  fitPoints?: RawPoint[];

  start?: RawPoint;
  end?: RawPoint;

  vertices?: Array<
    RawPoint & {
      bulge?: number;
    }
  >;

  shape?: boolean;
  closed?: boolean;

  center?: RawPoint;
  radius?: number;

  startAngle?: number;
  endAngle?: number;

  majorAxisEndPoint?: RawPoint;
  axisRatio?: number;

  startParameter?: number;
  endParameter?: number;

  [key: string]: unknown;
}

interface RawLayer {
  name?: string;

  color?: number;
  colorIndex?: number;
  colorNumber?: number;
  trueColor?: number;

  [key: string]: unknown;
}

interface RawDxf {
  entities?: RawEntity[];

  header?: Record<
    string,
    unknown
  >;

  tables?: {
    layer?: {
      layers?:
        | Record<
            string,
            RawLayer
          >
        | RawLayer[];
    };

    [key: string]: unknown;
  };

  [key: string]: unknown;
}

/* =========================================================
   DXF UNITS
========================================================= */

/*
 * AutoCAD DXF $INSUNITS:
 *
 * 0  = Unitless
 * 1  = Inches
 * 2  = Feet
 * 3  = Miles
 * 4  = Millimeters
 * 5  = Centimeters
 * 6  = Meters
 * 7  = Kilometers
 * 8  = Microinches
 * 9  = Mils
 * 10 = Yards
 * 11 = Angstroms
 * 12 = Nanometers
 * 13 = Microns
 * 14 = Decimeters
 * 15 = Decameters
 * 16 = Hectometers
 * 17 = Gigameters
 * 18 = Astronomical units
 * 19 = Light years
 * 20 = Parsecs
 *
 * Serula Nesting Pro'nun iç çalışma birimi:
 *
 * MILLIMETER
 */

function getUnitScaleToMillimeters(
  insUnits: number,
): number {
  switch (insUnits) {
    case 1:
      // inch
      return 25.4;

    case 2:
      // foot
      return 304.8;

    case 3:
      // mile
      return 1609344;

    case 4:
      // millimeter
      return 1;

    case 5:
      // centimeter
      return 10;

    case 6:
      // meter
      return 1000;

    case 7:
      // kilometer
      return 1_000_000;

    case 8:
      // microinch
      return 0.0000254;

    case 9:
      // mil
      return 0.0254;

    case 10:
      // yard
      return 914.4;

    case 11:
      // angstrom
      return 0.0000001;

    case 12:
      // nanometer
      return 0.000001;

    case 13:
      // micron
      return 0.001;

    case 14:
      // decimeter
      return 100;

    case 15:
      // decameter
      return 10_000;

    case 16:
      // hectometer
      return 100_000;

    case 17:
      // gigameter
      return 1_000_000_000_000;

    case 18:
    case 19:
    case 20:
      /*
       * Teknik nesting dosyalarında pratik
       * olarak kullanılmayacak birimler.
       *
       * Geometrinin tamamen kaybolmasını
       * önlemek için şimdilik 1 bırakıyoruz.
       */
      return 1;

    case 0:
    default:
      /*
       * Unitless DXF:
       *
       * Otomatik tahmin yapmak tehlikelidir.
       * Şimdilik 1 DXF unit = 1 mm kabul edilir.
       *
       * İleride kullanıcıya:
       * mm / cm / inch seçimi sunacağız.
       */
      return 1;
  }
}

/* =========================================================
   HEADER VALUE
========================================================= */

function extractNumericValue(
  value: unknown,
): number | undefined {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string"
  ) {
    const parsed =
      Number(value);

    if (
      Number.isFinite(parsed)
    ) {
      return parsed;
    }
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const record =
      value as Record<
        string,
        unknown
      >;

    const possibleKeys = [
      "value",
      "code",
      "data",
    ];

    for (
      const key of possibleKeys
    ) {
      const candidate =
        extractNumericValue(
          record[key],
        );

      if (
        candidate !==
        undefined
      ) {
        return candidate;
      }
    }
  }

  return undefined;
}

function getInsUnits(
  dxf: RawDxf,
): number {
  const header =
    dxf.header;

  if (!header) {
    return 0;
  }

  /*
   * dxf-parser sürümüne göre header
   * anahtarı farklı şekilde gelebilir.
   */

  const direct =
    extractNumericValue(
      header["$INSUNITS"],
    );

  if (
    direct !== undefined
  ) {
    return direct;
  }

  const withoutDollar =
    extractNumericValue(
      header["INSUNITS"],
    );

  if (
    withoutDollar !==
    undefined
  ) {
    return withoutDollar;
  }

  /*
   * Son güvenlik:
   * key'i büyük/küçük harf bağımsız ara.
   */

  for (
    const [
      key,
      value,
    ] of Object.entries(
      header,
    )
  ) {
    const normalized =
      key
        .replace(
          "$",
          "",
        )
        .toUpperCase();

    if (
      normalized ===
      "INSUNITS"
    ) {
      const result =
        extractNumericValue(
          value,
        );

      if (
        result !==
        undefined
      ) {
        return result;
      }
    }
  }

  return 0;
}

/* =========================================================
   POINT NORMALIZATION
========================================================= */

function normalizePoint(
  point: RawPoint | undefined,
  scale: number,
): DxfPoint | undefined {
  if (!point) {
    return undefined;
  }

  const x =
    typeof point.x ===
    "number"
      ? point.x
      : 0;

  const y =
    typeof point.y ===
    "number"
      ? point.y
      : 0;

  const result: DxfPoint = {
    x: x * scale,
    y: y * scale,
  };

  if (
    typeof point.z ===
    "number"
  ) {
    result.z =
      point.z *
      scale;
  }

  return result;
}

function normalizePoints(
  points:
    | RawPoint[]
    | undefined,
  scale: number,
): DxfPoint[] | undefined {
  if (!points) {
    return undefined;
  }

  return points
    .map((point) =>
      normalizePoint(
        point,
        scale,
      ),
    )
    .filter(
      (
        point,
      ): point is DxfPoint =>
        Boolean(point),
    );
}

/* =========================================================
   COLOR
========================================================= */

function integerRgbToHex(
  value: number,
): string {
  const normalized =
    value & 0xffffff;

  return `#${normalized
    .toString(16)
    .padStart(6, "0")
    .toUpperCase()}`;
}

/*
 * AutoCAD temel ACI renkleri.
 */

const BASIC_ACI: Record<
  number,
  string
> = {
  1: "#FF0000",
  2: "#FFFF00",
  3: "#00FF00",
  4: "#00FFFF",
  5: "#0000FF",
  6: "#FF00FF",

  /*
   * ACI 7 AutoCAD'de arka plana göre
   * beyaz/siyah davranabilir.
   *
   * Serula açık arka plan kullandığı için
   * siyah çiziyoruz.
   */
  7: "#111111",

  8: "#808080",
  9: "#C0C0C0",
};

const ACI_GRAY: Record<
  number,
  string
> = {
  250: "#333333",
  251: "#505050",
  252: "#696969",
  253: "#828282",
  254: "#BEBEBE",
  255: "#FFFFFF",
};

/*
 * ACI 10-249 için yaklaşık AutoCAD paleti.
 */

const ACI_BASE_RGB: Array<
  [number, number, number]
> = [
  [255, 0, 0],
  [255, 63, 0],
  [255, 127, 0],
  [255, 191, 0],
  [255, 255, 0],
  [191, 255, 0],
  [127, 255, 0],
  [63, 255, 0],
  [0, 255, 0],
  [0, 255, 63],
  [0, 255, 127],
  [0, 255, 191],
  [0, 255, 255],
  [0, 191, 255],
  [0, 127, 255],
  [0, 63, 255],
  [0, 0, 255],
  [63, 0, 255],
  [127, 0, 255],
  [191, 0, 255],
  [255, 0, 255],
  [255, 0, 191],
  [255, 0, 127],
  [255, 0, 63],
];

const ACI_LEVELS = [
  1,
  0.65,
  0.5,
  0.3,
  0.15,
];

function rgbToHex(
  r: number,
  g: number,
  b: number,
): string {
  const toHex = (
    value: number,
  ) =>
    Math.max(
      0,
      Math.min(
        255,
        Math.round(value),
      ),
    )
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(
    r,
  )}${toHex(
    g,
  )}${toHex(
    b,
  )}`.toUpperCase();
}

function aciToHex(
  aci: number,
): string | undefined {
  const index =
    Math.abs(
      Math.trunc(aci),
    );

  if (
    BASIC_ACI[index]
  ) {
    return BASIC_ACI[index];
  }

  if (
    ACI_GRAY[index]
  ) {
    return ACI_GRAY[index];
  }

  if (
    index >= 10 &&
    index <= 249
  ) {
    const offset =
      index - 10;

    const hueIndex =
      Math.floor(
        offset / 10,
      );

    const shadeIndex =
      offset % 10;

    const base =
      ACI_BASE_RGB[
        Math.min(
          hueIndex,
          ACI_BASE_RGB.length -
            1,
        )
      ];

    /*
     * AutoCAD paletindeki açık/koyu
     * varyasyonları yaklaşık temsil ediyoruz.
     */

    const level =
      ACI_LEVELS[
        Math.min(
          Math.floor(
            shadeIndex /
              2,
          ),
          ACI_LEVELS.length -
            1,
        )
      ];

    const isLight =
      shadeIndex % 2 ===
      1;

    let r =
      base[0] *
      level;

    let g =
      base[1] *
      level;

    let b =
      base[2] *
      level;

    if (isLight) {
      r =
        r +
        (255 - r) *
          0.35;

      g =
        g +
        (255 - g) *
          0.35;

      b =
        b +
        (255 - b) *
          0.35;
    }

    return rgbToHex(
      r,
      g,
      b,
    );
  }

  return undefined;
}

/* =========================================================
   ACI
========================================================= */

function getAci(
  source:
    | RawEntity
    | RawLayer
    | undefined,
): number | undefined {
  if (!source) {
    return undefined;
  }

  if (
    typeof source.colorIndex ===
    "number"
  ) {
    return source.colorIndex;
  }

  if (
    typeof source.colorNumber ===
    "number"
  ) {
    return source.colorNumber;
  }

  return undefined;
}

/* =========================================================
   LAYERS
========================================================= */

function getLayerMap(
  dxf: RawDxf,
): Map<
  string,
  RawLayer
> {
  const result =
    new Map<
      string,
      RawLayer
    >();

  const layers =
    dxf.tables?.layer
      ?.layers;

  if (!layers) {
    return result;
  }

  if (
    Array.isArray(
      layers,
    )
  ) {
    for (
      const layer of layers
    ) {
      if (
        layer &&
        typeof layer.name ===
          "string"
      ) {
        result.set(
          layer.name,
          layer,
        );
      }
    }

    return result;
  }

  for (
    const [
      key,
      value,
    ] of Object.entries(
      layers,
    )
  ) {
    if (!value) {
      continue;
    }

    result.set(
      value.name ??
        key,
      value,
    );
  }

  return result;
}

/* =========================================================
   COLOR RESOLUTION
========================================================= */

function resolveColor(
  entity: RawEntity,
  layer:
    | RawLayer
    | undefined,
): DxfColor {
  /*
   * 1. Entity TrueColor
   */

  if (
    typeof entity.trueColor ===
      "number"
  ) {
    return {
      trueColor:
        entity.trueColor,

      hex:
        integerRgbToHex(
          entity.trueColor,
        ),

      source:
        "entity",
    };
  }

  /*
   * 2. Entity ACI
   */

  const entityAci =
    getAci(entity);

  if (
    entityAci !==
      undefined &&
    entityAci !== 0 &&
    entityAci !== 256
  ) {
    return {
      aci:
        entityAci,

      hex:
        aciToHex(
          entityAci,
        ) ??
        "#111111",

      source:
        "entity",
    };
  }

  /*
   * dxf-parser bazı sürümlerde entity.color
   * alanını çözülmüş RGB integer olarak verir.
   */

  if (
    typeof entity.color ===
      "number" &&
    entity.color > 255
  ) {
    return {
      trueColor:
        entity.color,

      hex:
        integerRgbToHex(
          entity.color,
        ),

      source:
        "entity",
    };
  }

  /*
   * 3. Layer TrueColor
   */

  if (
    layer &&
    typeof layer.trueColor ===
      "number"
  ) {
    return {
      trueColor:
        layer.trueColor,

      hex:
        integerRgbToHex(
          layer.trueColor,
        ),

      source:
        "layer",
    };
  }

  /*
   * 4. Layer ACI
   */

  const layerAci =
    getAci(layer);

  if (
    layerAci !==
      undefined &&
    layerAci !== 0 &&
    layerAci !== 256
  ) {
    return {
      aci:
        layerAci,

      hex:
        aciToHex(
          layerAci,
        ) ??
        "#111111",

      source:
        "layer",
    };
  }

  /*
   * dxf-parser resolved layer RGB
   */

  if (
    layer &&
    typeof layer.color ===
      "number" &&
    layer.color > 255
  ) {
    return {
      trueColor:
        layer.color,

      hex:
        integerRgbToHex(
          layer.color,
        ),

      source:
        "layer",
    };
  }

  /*
   * Entity.color bazen doğrudan
   * ACI 1-255 olarak gelebilir.
   */

  if (
    typeof entity.color ===
      "number" &&
    entity.color > 0 &&
    entity.color <= 255
  ) {
    return {
      aci:
        entity.color,

      hex:
        aciToHex(
          entity.color,
        ) ??
        "#111111",

      source:
        "entity",
    };
  }

  /*
   * Layer.color ACI olabilir.
   */

  if (
    layer &&
    typeof layer.color ===
      "number" &&
    Math.abs(
      layer.color,
    ) > 0 &&
    Math.abs(
      layer.color,
    ) <= 255
  ) {
    const aci =
      Math.abs(
        layer.color,
      );

    return {
      aci,

      hex:
        aciToHex(
          aci,
        ) ??
        "#111111",

      source:
        "layer",
    };
  }

  return {
    hex:
      "#111111",

    source:
      "default",
  };
}

/* =========================================================
   BOOLEAN / CLOSED
========================================================= */

function resolveClosed(
  entity: RawEntity,
): boolean | undefined {
  if (
    typeof entity.closed ===
    "boolean"
  ) {
    return entity.closed;
  }

  if (
    typeof entity.shape ===
    "boolean"
  ) {
    return entity.shape;
  }

  return undefined;
}

/* =========================================================
   NORMALIZE ENTITY
========================================================= */

function normalizeEntity(
  entity: RawEntity,
  index: number,
  layers: Map<
    string,
    RawLayer
  >,
  scale: number,
): SerulaDxfEntity {
  const layerName =
    typeof entity.layer ===
      "string" &&
    entity.layer.length >
      0
      ? entity.layer
      : "0";

  const layer =
    layers.get(
      layerName,
    );

  const vertices =
    entity.vertices
      ? entity.vertices
          .map(
            (vertex) =>
              normalizePoint(
                vertex,
                scale,
              ),
          )
          .filter(
            (
              point,
            ): point is DxfPoint =>
              Boolean(
                point,
              ),
          )
      : undefined;

  const bulges =
    entity.vertices
      ? entity.vertices.map(
          (vertex) =>
            typeof vertex.bulge ===
            "number"
              ? vertex.bulge
              : 0,
        )
      : undefined;

  return {
    id:
      `entity-${index}`,

    type:
      (
        entity.type ??
        "UNKNOWN"
      ).toUpperCase(),

    layer:
      layerName,

    color:
      resolveColor(
        entity,
        layer,
      ),

    /* SPLINE */

    degreeOfSplineCurve:
      typeof entity.degreeOfSplineCurve ===
      "number"
        ? entity.degreeOfSplineCurve
        : undefined,

    controlPoints:
      normalizePoints(
        entity.controlPoints,
        scale,
      ),

    /*
     * Knot values boyutsuz parametrelerdir.
     * Kesinlikle ölçeklenmez.
     */
    knotValues:
      entity.knotValues
        ? [
            ...entity.knotValues,
          ]
        : undefined,

    /*
     * NURBS weights de boyutsuzdur.
     */
    weights:
      entity.weights
        ? [
            ...entity.weights,
          ]
        : undefined,

    fitPoints:
      normalizePoints(
        entity.fitPoints,
        scale,
      ),

    /* LINE */

    start:
      normalizePoint(
        entity.start,
        scale,
      ),

    end:
      normalizePoint(
        entity.end,
        scale,
      ),

    /* POLYLINE */

    vertices,

    closed:
      resolveClosed(
        entity,
      ),

    /*
     * Bulge boyutsuz geometrik orandır.
     * Ölçeklenmez.
     */
    bulges,

    /* ARC / CIRCLE / ELLIPSE */

    center:
      normalizePoint(
        entity.center,
        scale,
      ),

    radius:
      typeof entity.radius ===
      "number"
        ? entity.radius *
          scale
        : undefined,

    /*
     * Açılar ölçeklenmez.
     */
    startAngle:
      typeof entity.startAngle ===
      "number"
        ? entity.startAngle
        : undefined,

    endAngle:
      typeof entity.endAngle ===
      "number"
        ? entity.endAngle
        : undefined,

    /*
     * ELLIPSE major axis bir vektördür.
     * Uzunluğu birim dönüşümünden etkilenir.
     */
    majorAxisEndPoint:
      normalizePoint(
        entity.majorAxisEndPoint,
        scale,
      ),

    /*
     * Axis ratio boyutsuzdur.
     */
    axisRatio:
      typeof entity.axisRatio ===
      "number"
        ? entity.axisRatio
        : undefined,

    /*
     * Ellipse parametreleri açı/parametre
     * değerleridir. Ölçeklenmez.
     */
    startParameter:
      typeof entity.startParameter ===
      "number"
        ? entity.startParameter
        : entity.type?.toUpperCase() === "ELLIPSE" ? entity.startAngle : undefined,

    endParameter:
      typeof entity.endParameter ===
      "number"
        ? entity.endParameter
        : entity.type?.toUpperCase() === "ELLIPSE" ? entity.endAngle : undefined,

    raw:
      entity,
  };
}

/* =========================================================
   MAIN
========================================================= */

export function normalizeDxfEntities(
  input: unknown,
): SerulaDxfEntity[] {
  const dxf =
    input as RawDxf;

  const rawEntities =
    Array.isArray(
      dxf.entities,
    )
      ? dxf.entities
      : [];

  const layers =
    getLayerMap(
      dxf,
    );

  /*
   * DXF birimini oku.
   */
  const insUnits =
    getInsUnits(
      dxf,
    );

  /*
   * Tüm geometriyi mm'ye çevir.
   */
  const unitScale =
    getUnitScaleToMillimeters(
      insUnits,
    );

  const normalized =
    rawEntities.map(
      (
        entity,
        index,
      ) =>
        normalizeEntity(
          entity,
          index,
          layers,
          unitScale,
        ),
    );

  /*
   * Debug bilgisi.
   *
   * Daha sonra production sürümünde
   * kaldırılabilir.
   */

  console.log(
    "Serula DXF Unit:",
    {
      insUnits,
      scaleToMillimeters:
        unitScale,
    },
  );

  console.table(
    normalized.map(
      (entity) => ({
        type:
          entity.type,

        layer:
          entity.layer,

        color:
          entity.color.hex,

        colorSource:
          entity.color.source,
      }),
    ),
  );

  return normalized;
}
