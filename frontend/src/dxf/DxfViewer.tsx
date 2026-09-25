import { prepareGeometry } from './geometryDiagnostics';
import { selectSheet } from '../nesting/sheetResult';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  DxfPoint,
  GeometryBounds,
  NestingPart,
  SerulaCurve,
  SerulaDxfEntity,
} from "./dxfTypes";

import {
  getCurveStatistics,
} from "./curveEngine";

import {
  calculateGeometryBounds,
  detectContours,
  getContourStatistics,
  pointInPolygon,
} from "./contourEngine";

import {
  createPartsFromContours,
} from "./partEngine";

import {
  DEFAULT_NESTING_SETTINGS,
  transformNestingPoint,
  type NestingPlacement,
  type NestingResult,
  type NestingSettings,
} from "../nesting/nestingEngine";

import type {
  NestingWorkerRequest,
  NestingWorkerResponse,
} from "../nesting/nesting.worker";

/* =========================================================
   TYPES
========================================================= */

import NestingControls, { type WorkspacePanel } from "./NestingControls";
import { createJobGeometry } from "./jobGeometry";
import { exportLayout } from "./nestingExport";

type DxfViewerProps = {
  entities: SerulaDxfEntity[];
  fileName: string;
  savedLayout?: SavedLayout | null;
  navigation?: { panel: WorkspacePanel | "viewer"; token: number };
};
export type SavedLayout = { settings: NestingSettings; spacing: number; quantities: Record<string, number>; result: NestingResult | null; transforms: Record<string, DxfPoint> };

type ViewState = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

type PartTransform = {
  x: number;
  y: number;
};

type DragState = {
  partId: string;
  lastWorldX: number;
  lastWorldY: number;
};

type SimulationSpeed =
  | "slow"
  | "normal"
  | "fast";

/* =========================================================
   CONSTANTS
========================================================= */

const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 850;

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 100;


const SIMULATION_SPEEDS: Record<
  SimulationSpeed,
  number
> = {
  slow: 500,
  normal: 180,
  fast: 60,
};

/* =========================================================
   BOUNDS
========================================================= */

function calculateAllBounds(
  curves: SerulaCurve[],
): GeometryBounds | null {
  const points = curves.flatMap(
    (curve) => curve.points,
  );

  return calculateGeometryBounds(
    points,
  );
}

/* =========================================================
   FIT VIEW
========================================================= */

function createFitView(
  bounds: GeometryBounds,
  canvasWidth: number,
  canvasHeight: number,
): ViewState {
  const padding = 70;

  const geometryWidth =
    Math.max(
      bounds.width,
      0.001,
    );

  const geometryHeight =
    Math.max(
      bounds.height,
      0.001,
    );

  const availableWidth =
    Math.max(
      canvasWidth -
        padding * 2,
      1,
    );

  const availableHeight =
    Math.max(
      canvasHeight -
        padding * 2,
      1,
    );

  const scale =
    Math.min(
      availableWidth /
        geometryWidth,

      availableHeight /
        geometryHeight,
    );

  const centerX =
    (bounds.minX +
      bounds.maxX) /
    2;

  const centerY =
    (bounds.minY +
      bounds.maxY) /
    2;

  return {
    scale,

    offsetX:
      canvasWidth / 2 -
      centerX * scale,

    offsetY:
      canvasHeight / 2 +
      centerY * scale,
  };
}

/* =========================================================
   VIEWER
========================================================= */

export default function DxfViewer({
  entities, navigation, fileName, savedLayout,
}: DxfViewerProps) {
  const canvasRef =
    useRef<HTMLCanvasElement>(
      null,
    );

  const simulationTimerRef =
    useRef<number | null>(
      null,
    );

  const nestingWorkerRef =
    useRef<Worker | null>(null);

  const [isNesting, setIsNesting] =
    useState(false);

  const [nestingError, setNestingError] =
    useState<string | null>(null);

  const [partSpacing, setPartSpacing] =
    useState(savedLayout?.spacing ?? 0.3);
  const [operatorSettings, setOperatorSettings] = useState<NestingSettings>(savedLayout?.settings ?? { ...DEFAULT_NESTING_SETTINGS });
  const [workerGeneration, setWorkerGeneration] = useState(0);
  const [autoSimulation, setAutoSimulation] = useState(true);
  const [panel, setPanel] = useState<WorkspacePanel>("settings");
  const [quantities, setQuantities] = useState<Record<string, number>>(savedLayout?.quantities ?? {});
  const previousEntities = useRef(entities);
  const previousSettings = useRef({ operatorSettings, partSpacing, quantities });
  const [lastNavigation, setLastNavigation] = useState(navigation);
  if (navigation !== lastNavigation) {
    setLastNavigation(navigation);
    if (navigation?.token && navigation.panel !== "viewer") setPanel(navigation.panel);
  }
  useEffect(() => {
    if (entities.length > 0) {
      handleAutoNesting();
    }
  }, [entities]);

  const [view, setView] =
    useState<ViewState>({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });

  const [
    transforms,
    setTransforms,
  ] = useState<
    Record<
      string,
      PartTransform
    >
  >(savedLayout?.transforms ?? {});

  const [
    selectedPartId,
    setSelectedPartId,
  ] = useState<
    string | null
  >(null);

  const [
    dragState,
    setDragState,
  ] = useState<
    DragState | null
  >(null);

  const [
    isPanning,
    setIsPanning,
  ] = useState(false);

  const [
    fullNestingResult,
    setNestingResult,
  ] = useState<
    NestingResult | null
  >(savedLayout?.result ?? null);
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [searchStatus, setSearchStatus] = useState('');
  const nestingResult = useMemo(() => fullNestingResult ? selectSheet(fullNestingResult, selectedSheet) : null, [fullNestingResult, selectedSheet]);


  /* =======================================================
     SIMULATION STATE
  ======================================================= */

  const [
    visiblePlacementCount,
    setVisiblePlacementCount,
  ] = useState(savedLayout?.result?.placedCount ?? 0);

  const [
    isSimulating,
    setIsSimulating,
  ] = useState(false);

  const [
    isSimulationPaused,
    setIsSimulationPaused,
  ] = useState(false);

  const [
    simulationSpeed,
    setSimulationSpeed,
  ] =
    useState<SimulationSpeed>(
      "normal",
    );

  const lastPanMouse =
    useRef({
      x: 0,
      y: 0,
    });

  /* =======================================================
     GEOMETRY
  ======================================================= */

  const geometry = useMemo(() => prepareGeometry(entities, operatorSettings.curveTolerance ?? 0.1), [entities, operatorSettings.curveTolerance]);
  const sourceCurves = geometry.curves;
  const contours = useMemo(() => detectContours(sourceCurves), [sourceCurves]);
  const catalogue = useMemo(() => createPartsFromContours(contours), [contours]);
  const { parts, curves, curvePartMap } = useMemo(() => createJobGeometry(catalogue, sourceCurves, quantities), [catalogue, sourceCurves, quantities]);
  useEffect(() => {
    const onDelete = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' || !selectedPartId) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest('input, textarea, select, [contenteditable="true"]') || target.isContentEditable)) return;
      event.preventDefault();
      setQuantities(current => ({ ...current, [selectedPartId]: 0 }));
      setSelectedPartId(null);
    };
    window.addEventListener('keydown', onDelete);
    return () => window.removeEventListener('keydown', onDelete);
  }, [selectedPartId]);

  /* =======================================================
     PART MAP
  ======================================================= */

  const partMap =
    useMemo(() => {
      const map =
        new Map<
          string,
          NestingPart
        >();

      for (
        const part of parts
      ) {
        map.set(
          part.id,
          part,
        );
      }

      return map;
    }, [parts]);

  /* =======================================================
     CURVE -> PART
  ======================================================= */

  /* =======================================================
     STATISTICS
  ======================================================= */

  const curveStatistics =
    useMemo(
      () =>
        getCurveStatistics(
          curves,
        ),
      [curves],
    );

  const contourStatistics =
    useMemo(
      () =>
        getContourStatistics(
          contours,
        ),
      [contours],
    );

  const partStatistics =
    useMemo(
      () => ({ totalParts: parts.length, totalHoles: parts.reduce((sum, part) => sum + part.holes.length, 0), attachedCurves: curvePartMap.size }),
      [
        parts,
        curvePartMap,
      ],
    );

  const originalBounds =
    useMemo(
      () =>
        calculateAllBounds(
          curves,
        ),
      [curves],
    );

  /* =======================================================
     NESTING WORKER
  ======================================================= */

  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(
      new URL(
        "../nesting/nesting.worker.ts",
        import.meta.url,
      ),
      { type: "module" },
    );
    } catch (error) {
      const timer = window.setTimeout(() => {
        setNestingError(error instanceof Error ? error.message : "Yerleşim işlemi başlatılamadı.");
        setIsNesting(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    nestingWorkerRef.current = worker;

    worker.onmessage = (
      event: MessageEvent<NestingWorkerResponse>,
    ) => {
      const response = event.data;
      if (response.type === 'NESTING_PROGRESS') {
        setNestingResult(response.progress.result);
        setVisiblePlacementCount(response.progress.result.placedCount);
        setSearchStatus(`${response.progress.phase} · ${(response.progress.elapsedMs / 1000).toFixed(1)} sn · ${response.progress.result.placedCount}/${response.progress.result.totalCount} parça · ${response.progress.iterations} arama · ${response.progress.penaltyUpdates} ceza güncellemesi`);
        return;
      }


      if (response.type === "NESTING_ERROR") {
        setIsNesting(false);
        setNestingError(response.message);
        return;
      }

      setTransforms({});
      setSelectedPartId(null);
      setDragState(null);
      setNestingResult(response.result);
      setSearchStatus(`${response.phase} · ${(response.duration / 1000).toFixed(1)} sn · bağımsız doğrulama tamamlandı`);
      setVisiblePlacementCount(autoSimulation ? 0 : response.result.placedCount);
      setIsSimulationPaused(false);
      setIsSimulating(autoSimulation && response.result.placedCount > 0);
      setIsNesting(false);
      setNestingError(null);
    };

    worker.onerror = (event) => {
      event.preventDefault();
      setIsNesting(false);
      setNestingError(
        event.message ||
          "Yerleşim hesaplanırken bir hata oluştu.",
      );
    };
    worker.onmessageerror = () => {
      setIsNesting(false);
      setNestingError("Yerleşim sonucu okunamadı. Yeniden deneyin.");
    };

    return () => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      nestingWorkerRef.current = null;
    };
  }, [entities, workerGeneration, autoSimulation]);

  /* =======================================================
     NEW DXF RESET
  ======================================================= */

  useEffect(() => {
    if (previousEntities.current === entities) return;
    previousEntities.current = entities;
    setTransforms({});

    setSelectedPartId(
      null,
    );

    setDragState(null);

    setNestingResult(
      null,
    );

    setNestingError(null);
    setIsNesting(false);

    setVisiblePlacementCount(
      0,
    );

    setIsSimulating(
      false,
    );

    setIsSimulationPaused(
      false,
    );
    setQuantities({});
  }, [entities]);

  /* =======================================================
     VISIBLE PLACEMENTS
  ======================================================= */

  useEffect(() => {
    const previous = previousSettings.current;
    if (previous.operatorSettings === operatorSettings && previous.partSpacing === partSpacing && previous.quantities === quantities) return;
    previousSettings.current = { operatorSettings, partSpacing, quantities };
    setNestingResult(null); setVisiblePlacementCount(0); setIsSimulating(false);
    setIsSimulationPaused(false); setTransforms({}); setSelectedPartId(null); setNestingError(null);
  }, [operatorSettings, partSpacing, quantities]);

  const visiblePlacements =
    useMemo(() => {
      if (
        !nestingResult
      ) {
        return [];
      }

      const placed =
        nestingResult.placements.filter(
          (placement) =>
            placement.placed,
        );

      if (
        !isSimulating &&
        visiblePlacementCount >=
          placed.length
      ) {
        return placed;
      }

      return placed.slice(
        0,
        visiblePlacementCount,
      );
    }, [
      nestingResult,
      visiblePlacementCount,
      isSimulating,
    ]);

  /* =======================================================
     PLACEMENT MAP
  ======================================================= */

  const placementMap =
    useMemo(() => {
      const map =
        new Map<
          string,
          NestingPlacement
        >();

      for (
        const placement of
          visiblePlacements
      ) {
        if (
          !map.has(
            placement.partId,
          )
        ) {
          map.set(
            placement.partId,
            placement,
          );
        }
      }

      return map;
    }, [
      visiblePlacements,
    ]);

  /* =======================================================
     SIMULATION
  ======================================================= */

  useEffect(() => {
    if (
      simulationTimerRef.current !==
      null
    ) {
      window.clearTimeout(
        simulationTimerRef.current,
      );

      simulationTimerRef.current =
        null;
    }

    if (
      !nestingResult ||
      !isSimulating ||
      isSimulationPaused
    ) {
      return;
    }

    const placedCount =
      nestingResult.placements.filter(
        (placement) =>
          placement.placed,
      ).length;

    if (visiblePlacementCount >= placedCount) return;

    simulationTimerRef.current = window.setTimeout(() => {
      const next = Math.min(visiblePlacementCount + 1, placedCount);
      setVisiblePlacementCount(next);
      if (next >= placedCount) {
        setIsSimulating(false);
        setIsSimulationPaused(false);
      }
    }, SIMULATION_SPEEDS[simulationSpeed]);

    return () => {
      if (
        simulationTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          simulationTimerRef.current,
        );

        simulationTimerRef.current =
          null;
      }
    };
  }, [
    nestingResult,
    isSimulating,
    isSimulationPaused,
    visiblePlacementCount,
    simulationSpeed,
  ]);

  /* =======================================================
     DISPLAY POINT
  ======================================================= */

  const getDisplayPoint =
    useCallback(
      (
        point: {
          x: number;
          y: number;
        },
        partId?: string,
      ) => {
        if (!partId) {
          return {
            x: point.x,
            y: point.y,
          };
        }

        const part =
          partMap.get(
            partId,
          );

        const placement =
          placementMap.get(
            partId,
          );

        if (
          part &&
          placement
        ) {
          const nestedPoint =
            transformNestingPoint(
              point,
              part,
              placement,
            );

          const manual =
            transforms[
              partId
            ] ?? {
              x: 0,
              y: 0,
            };

          return {
            x:
              nestedPoint.x +
              manual.x,

            y:
              nestedPoint.y +
              manual.y,
          };
        }

        const transform =
          transforms[
            partId
          ] ?? {
            x: 0,
            y: 0,
          };

        return {
          x:
            point.x +
            transform.x,

          y:
            point.y +
            transform.y,
        };
      },
      [
        partMap,
        placementMap,
        transforms,
      ],
    );

  /* =======================================================
     DISPLAY BOUNDS
  ======================================================= */

  const displayBounds =
    useMemo(() => {
      if (
        nestingResult
      ) {
        return {
          minX: 0,
          minY: 0,

          maxX:
            nestingResult.materialWidth,

          maxY:
            nestingResult.materialHeight,

          width:
            nestingResult.materialWidth,

          height:
            nestingResult.materialHeight,
        };
      }

      return originalBounds;
    }, [
      nestingResult,
      originalBounds,
    ]);

  /* =======================================================
     FIT SCREEN
  ======================================================= */

  const fitToScreen =
    useCallback(() => {
      const canvas =
        canvasRef.current;

      if (
        !canvas ||
        !displayBounds
      ) {
        return;
      }

      setView(
        createFitView(
          displayBounds,
          canvas.width,
          canvas.height,
        ),
      );
    }, [
      displayBounds,
    ]);

  useEffect(() => {
    fitToScreen();
  }, [
    fitToScreen,
  ]);

  /* =======================================================
     COORDINATES
  ======================================================= */

  const worldToScreen =
    useCallback(
      (
        x: number,
        y: number,
      ) => ({
        x:
          x * view.scale +
          view.offsetX,

        y:
          view.offsetY -
          y * view.scale,
      }),
      [view],
    );

  const screenToWorld =
    useCallback(
      (
        x: number,
        y: number,
      ) => ({
        x:
          (x -
            view.offsetX) /
          view.scale,

        y:
          (view.offsetY -
            y) /
          view.scale,
      }),
      [view],
    );

  /* =======================================================
     PART POLYGON
  ======================================================= */

  const getDisplayedOuterPoints =
    useCallback(
      (
        part: NestingPart,
      ) =>
        part.outerContour.points.map(
          (point) =>
            getDisplayPoint(
              point,
              part.id,
            ),
        ),
      [
        getDisplayPoint,
      ],
    );

  /* =======================================================
     HIT TEST
  ======================================================= */

  const findPartAtWorldPoint =
    useCallback(
      (
        worldX: number,
        worldY: number,
      ): NestingPart | null => {
        const sorted =
          [...parts].sort(
            (a, b) =>
              a.bounds.width *
                a.bounds.height -
              b.bounds.width *
                b.bounds.height,
          );

        for (
          const part of
            sorted
        ) {
          if (
            nestingResult &&
            !placementMap.has(
              part.id,
            )
          ) {
            continue;
          }

          const polygon =
            getDisplayedOuterPoints(
              part,
            );

          if (
            polygon.length <
            3
          ) {
            continue;
          }

          if (
            pointInPolygon(
              {
                x: worldX,
                y: worldY,
              },
              polygon,
            )
          ) {
            return part;
          }
        }

        return null;
      },
      [
        parts,
        nestingResult,
        placementMap,
        getDisplayedOuterPoints,
      ],
    );

  /* =======================================================
     DRAW SHEET
  ======================================================= */

  const drawSheet =
    useCallback(
      (
        ctx: CanvasRenderingContext2D,
      ) => {
        if (
          !nestingResult
        ) {
          return;
        }

        const bottomLeft =
          worldToScreen(
            0,
            0,
          );

        const topRight =
          worldToScreen(
            nestingResult.materialWidth,
            nestingResult.materialHeight,
          );

        const width =
          topRight.x -
          bottomLeft.x;

        const height =
          bottomLeft.y -
          topRight.y;

        ctx.save();

        ctx.shadowColor =
          "rgba(0,0,0,0.14)";

        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 5;

        ctx.fillStyle =
          "#ffffff";

        ctx.fillRect(
          bottomLeft.x,
          topRight.y,
          width,
          height,
        );

        ctx.restore();

        ctx.save();

        ctx.strokeStyle =
          "rgba(0,0,0,0.30)";

        ctx.lineWidth = 2;

        ctx.strokeRect(
          bottomLeft.x,
          topRight.y,
          width,
          height,
        );

        const margin =
          nestingResult.margin;

        const marginBottomLeft =
          worldToScreen(
            margin,
            margin,
          );

        const marginTopRight =
          worldToScreen(
            nestingResult.materialWidth -
              margin,

            nestingResult.materialHeight -
              margin,
          );

        ctx.setLineDash([
          7,
          5,
        ]);

        ctx.strokeStyle =
          "rgba(0,122,255,0.28)";

        ctx.lineWidth = 1;

        ctx.strokeRect(
          marginBottomLeft.x,
          marginTopRight.y,

          marginTopRight.x -
            marginBottomLeft.x,

          marginBottomLeft.y -
            marginTopRight.y,
        );

        ctx.setLineDash([]);

        ctx.restore();
      },
      [
        nestingResult,
        worldToScreen,
      ],
    );

  /* =======================================================
     DRAW
  ======================================================= */

  useEffect(() => {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    const ctx =
      canvas.getContext(
        "2d",
      );

    if (!ctx) {
      return;
    }

    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height,
    );

    ctx.fillStyle =
      "#f3f3f5";

    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height,
    );

    /* GRID */

    const gridSize =
      25 * view.scale;

    if (
      gridSize >= 10 &&
      gridSize <= 200
    ) {
      ctx.beginPath();

      ctx.strokeStyle =
        "rgba(0,0,0,0.04)";

      ctx.lineWidth = 1;

      const startX =
        ((view.offsetX %
          gridSize) +
          gridSize) %
        gridSize;

      const startY =
        ((view.offsetY %
          gridSize) +
          gridSize) %
        gridSize;

      for (
        let x = startX;
        x < canvas.width;
        x += gridSize
      ) {
        ctx.moveTo(
          x,
          0,
        );

        ctx.lineTo(
          x,
          canvas.height,
        );
      }

      for (
        let y = startY;
        y < canvas.height;
        y += gridSize
      ) {
        ctx.moveTo(
          0,
          y,
        );

        ctx.lineTo(
          canvas.width,
          y,
        );
      }

      ctx.stroke();
    }

    drawSheet(ctx);

    ctx.lineJoin =
      "round";

    ctx.lineCap =
      "round";

    /* CURVES */

    for (
      const curve of
        curves
    ) {
      if (
        curve.points.length <
        2
      ) {
        continue;
      }

      const partId =
        curvePartMap.get(
          curve.id,
        );

      if (
        nestingResult &&
        partId &&
        !placementMap.has(
          partId,
        )
      ) {
        continue;
      }

      const selected =
        partId ===
        selectedPartId;

      const firstPoint =
        getDisplayPoint(
          curve.points[0],
          partId,
        );

      const firstScreen =
        worldToScreen(
          firstPoint.x,
          firstPoint.y,
        );

      ctx.beginPath();

      ctx.moveTo(
        firstScreen.x,
        firstScreen.y,
      );

      for (
        let i = 1;
        i <
        curve.points.length;
        i++
      ) {
        const point =
          getDisplayPoint(
            curve.points[i],
            partId,
          );

        const screen =
          worldToScreen(
            point.x,
            point.y,
          );

        ctx.lineTo(
          screen.x,
          screen.y,
        );
      }

      if (
        curve.closed
      ) {
        ctx.closePath();
      }

      ctx.strokeStyle =
        curve.color.hex ??
        "#111111";

      ctx.lineWidth =
        selected
          ? 2.8
          : 1.5;

      ctx.stroke();
    }

    /* LABELS */

    parts.forEach(
      (
        part,
      ) => {
        if (
          nestingResult &&
          !placementMap.has(
            part.id,
          )
        ) {
          return;
        }

        const center = {
          x:
            (part.bounds.minX +
              part.bounds.maxX) /
            2,

          y:
            (part.bounds.minY +
              part.bounds.maxY) /
            2,
        };

        const displayCenter =
          getDisplayPoint(
            center,
            part.id,
          );

        const screen =
          worldToScreen(
            displayCenter.x,
            displayCenter.y,
          );

        const sourceIndex = catalogue.findIndex(source => source.outerContour.id === part.outerContour.id);
        const copy = part.id.split(':copy-')[1];
        const label = `P${sourceIndex + 1}${copy ? `·${Number(copy) + 1}` : ''}`;

        ctx.save();

        ctx.font =
          "600 12px Arial";

        ctx.textAlign =
          "center";

        ctx.textBaseline =
          "middle";

        const metrics =
          ctx.measureText(
            label,
          );

        const boxWidth =
          metrics.width +
          12;

        const boxHeight =
          22;

        ctx.fillStyle =
          part.id ===
          selectedPartId
            ? "rgba(220,235,255,0.96)"
            : "rgba(255,255,255,0.88)";

        ctx.strokeStyle =
          part.id ===
          selectedPartId
            ? "rgba(0,100,255,0.7)"
            : "rgba(0,0,0,0.13)";

        ctx.lineWidth =
          part.id ===
          selectedPartId
            ? 2
            : 1;

        ctx.beginPath();

        ctx.roundRect(
          screen.x -
            boxWidth / 2,

          screen.y -
            boxHeight / 2,

          boxWidth,
          boxHeight,
          6,
        );

        ctx.fill();
        ctx.stroke();

        ctx.fillStyle =
          "#111";

        ctx.fillText(
          label,
          screen.x,
          screen.y,
        );

        ctx.restore();
      },
    );
  }, [
    curves,
    catalogue,
    parts,
    curvePartMap,
    placementMap,
    nestingResult,
    selectedPartId,
    view,
    worldToScreen,
    getDisplayPoint,
    drawSheet,
  ]);

  /* =======================================================
     MOUSE
  ======================================================= */

  const getCanvasMousePosition =
    (
      event: React.MouseEvent<HTMLCanvasElement>,
    ) => {
      const canvas =
        canvasRef.current;

      if (!canvas) {
        return null;
      }

      const rect =
        canvas.getBoundingClientRect();

      return {
        x:
          (event.clientX -
            rect.left) *
          (canvas.width /
            rect.width),

        y:
          (event.clientY -
            rect.top) *
          (canvas.height /
            rect.height),
      };
    };

  const handleMouseDown = (
    event: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    if (
      event.button !== 0
    ) {
      return;
    }

    const mouse =
      getCanvasMousePosition(
        event,
      );

    if (!mouse) {
      return;
    }

    const world =
      screenToWorld(
        mouse.x,
        mouse.y,
      );

    const part =
      findPartAtWorldPoint(
        world.x,
        world.y,
      );

    if (part) {
      setSelectedPartId(
        part.id,
      );

      setDragState({
        partId:
          part.id,

        lastWorldX:
          world.x,

        lastWorldY:
          world.y,
      });

      return;
    }

    setSelectedPartId(
      null,
    );

    setIsPanning(
      true,
    );

    lastPanMouse.current = {
      x:
        event.clientX,

      y:
        event.clientY,
    };
  };

  const handleMouseMove = (
    event: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    if (dragState) {
      const mouse =
        getCanvasMousePosition(
          event,
        );

      if (!mouse) {
        return;
      }

      const world =
        screenToWorld(
          mouse.x,
          mouse.y,
        );

      const deltaX =
        world.x -
        dragState.lastWorldX;

      const deltaY =
        world.y -
        dragState.lastWorldY;

      setTransforms(
        (current) => {
          const old =
            current[
              dragState.partId
            ] ?? {
              x: 0,
              y: 0,
            };

          return {
            ...current,

            [dragState.partId]: {
              x:
                old.x +
                deltaX,

              y:
                old.y +
                deltaY,
            },
          };
        },
      );

      setDragState({
        partId:
          dragState.partId,

        lastWorldX:
          world.x,

        lastWorldY:
          world.y,
      });

      return;
    }

    if (!isPanning) {
      return;
    }

    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    const rect =
      canvas.getBoundingClientRect();

    const scaleX =
      canvas.width /
      rect.width;

    const scaleY =
      canvas.height /
      rect.height;

    const deltaX =
      (event.clientX -
        lastPanMouse.current.x) *
      scaleX;

    const deltaY =
      (event.clientY -
        lastPanMouse.current.y) *
      scaleY;

    lastPanMouse.current = {
      x:
        event.clientX,

      y:
        event.clientY,
    };

    setView(
      (current) => ({
        ...current,

        offsetX:
          current.offsetX +
          deltaX,

        offsetY:
          current.offsetY +
          deltaY,
      }),
    );
  };

  const stopDragging =
    () => {
      setDragState(
        null,
      );

      setIsPanning(
        false,
      );
    };

  /* =======================================================
     ZOOM
  ======================================================= */

  const handleWheel = (
    event: React.WheelEvent<HTMLCanvasElement>,
  ) => {
    event.preventDefault();

    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    const rect =
      canvas.getBoundingClientRect();

    const mouseX =
      (event.clientX -
        rect.left) *
      (canvas.width /
        rect.width);

    const mouseY =
      (event.clientY -
        rect.top) *
      (canvas.height /
        rect.height);

    setView(
      (current) => {
        const factor =
          event.deltaY < 0
            ? 1.12
            : 1 / 1.12;

        const newScale =
          Math.min(
            MAX_ZOOM,
            Math.max(
              MIN_ZOOM,
              current.scale *
                factor,
            ),
          );

        const worldX =
          (mouseX -
            current.offsetX) /
          current.scale;

        const worldY =
          (current.offsetY -
            mouseY) /
          current.scale;

        return {
          scale:
            newScale,

          offsetX:
            mouseX -
            worldX *
              newScale,

          offsetY:
            mouseY +
            worldY *
              newScale,
        };
      },
    );
  };

  const zoomIn =
    () => {
      setView(
        (current) => ({
          ...current,

          scale:
            Math.min(
              MAX_ZOOM,
              current.scale *
                1.2,
            ),
        }),
      );
    };

  const zoomOut =
    () => {
      setView(
        (current) => ({
          ...current,

          scale:
            Math.max(
              MIN_ZOOM,
              current.scale /
                1.2,
            ),
        }),
      );
    };

  /* =======================================================
     RESET
  ======================================================= */

  const resetManualTransforms =
    () => {
      setTransforms({});

      setSelectedPartId(
        null,
      );

      setDragState(
        null,
      );
    };

  /* =======================================================
     AUTO NESTING + SIMULATION
  ======================================================= */

  const handleAutoNesting = useCallback(
    (requestedParts: NestingPart[] = parts) => {
      const worker =
        nestingWorkerRef.current;

      if (!worker || isNesting) {
        return;
      }

      if (geometry.issues.some(issue => issue.blocking)) { setNestingError("Geçersiz konturları düzeltmeden yerleştirme başlatılamaz."); return; }
      setSelectedSheet(0); setSearchStatus("Başlatılıyor…");
      setNestingError(null);
      setIsNesting(true);
      setIsSimulating(false);
      setIsSimulationPaused(false);
      setVisiblePlacementCount(0);

      const request: NestingWorkerRequest = {
        type: "RUN_NESTING",
        parts: requestedParts,
        settings: {
          ...operatorSettings,
          spacing: partSpacing,
        },
      };

      try {
        console.log("NESTING STARTING WITH SETTINGS:", {
          ...operatorSettings,
          spacing: partSpacing,
          partsCount: requestedParts.length
        });
        worker.postMessage(request);
      } catch (error) {
        setIsNesting(false);
        setNestingError(error instanceof Error ? error.message : "Yerleşim başlatılamadı.");
      }
    },
    [parts, nestingWorkerRef, isNesting, geometry, operatorSettings, partSpacing]
  );

  /* =======================================================
     RESET NESTING
  ======================================================= */

  const handleResetNesting =
    () => {
      nestingWorkerRef.current?.terminate();
      nestingWorkerRef.current = null;
      setWorkerGeneration(current => current + 1);
      setIsNesting(false);
      if (
        simulationTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          simulationTimerRef.current,
        );

        simulationTimerRef.current =
          null;
      }

      setNestingResult(
        null,
      );

      setNestingError(null);

      setVisiblePlacementCount(
        0,
      );

      setIsSimulating(
        false,
      );

      setIsSimulationPaused(
        false,
      );

      setTransforms({});

      setSelectedPartId(
        null,
      );

      setDragState(
        null,
      );
    };

  /* =======================================================
     PAUSE / RESUME
  ======================================================= */

  const toggleSimulation =
    () => {
      if (
        !nestingResult
      ) {
        return;
      }

      const total =
        nestingResult.placements.filter(
          (placement) =>
            placement.placed,
        ).length;

      if (
        visiblePlacementCount >=
        total
      ) {
        /*
         * Simülasyonu yeniden başlat.
         */
        setVisiblePlacementCount(
          0,
        );

        setIsSimulationPaused(
          false,
        );

        setIsSimulating(
          true,
        );

        return;
      }

      if (
        isSimulationPaused
      ) {
        setIsSimulationPaused(
          false,
        );

        setIsSimulating(
          true,
        );
      } else {
        setIsSimulationPaused(
          true,
        );
      }
    };

  /* =======================================================
     SIMULATION INFO
  ======================================================= */

  const simulationTotal =
    nestingResult
      ? nestingResult.placements.filter(
          (placement) =>
            placement.placed,
        ).length
      : 0;

  const simulationFinished =
    Boolean(
      nestingResult &&
        visiblePlacementCount >=
          simulationTotal &&
        simulationTotal > 0,
    );

  const progress =
    simulationTotal > 0
      ? Math.min(
          100,
          (visiblePlacementCount /
            simulationTotal) *
            100,
        )
      : 0;

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div className="viewer-shell"
      style={{
        width: "100%",

        borderRadius:
          "22px",

        overflow:
          "hidden",

        border:
          "1px solid rgba(0,0,0,0.08)",

        background:
          "#fff",

        boxShadow:
          "0 15px 45px rgba(0,0,0,0.06)",
      }}
    >
      {/* TOOLBAR */}
      <NestingControls panel={panel} onPanel={setPanel} settings={operatorSettings} onSettings={setOperatorSettings}
        spacing={partSpacing} onSpacing={setPartSpacing} autoSimulation={autoSimulation} onAutoSimulation={setAutoSimulation}
        parts={catalogue} quantities={quantities} onQuantity={(id, value) => setQuantities(current => ({ ...current, [id]: value }))}
        onAllQuantities={value => setQuantities(Object.fromEntries(catalogue.map(part => [part.id, value])))} busy={isNesting}
        onFull={id => {
          const selected = catalogue.find(part => part.id === id);
          if (!selected || operatorSettings.materialType !== 'sheet') return;
          const usableWidth = operatorSettings.sheetWidth - 2 * operatorSettings.margin;
          const usableHeight = operatorSettings.sheetHeight - 2 * operatorSettings.margin;
          const pitchWidth = selected.bounds.width + partSpacing;
          const pitchHeight = selected.bounds.height + partSpacing;
          const estimate = Math.min(1000, Math.max(1, Math.max(
            Math.floor((usableWidth + partSpacing) / pitchWidth) * Math.floor((usableHeight + partSpacing) / pitchHeight),
            Math.floor((usableWidth + partSpacing) / pitchHeight) * Math.floor((usableHeight + partSpacing) / pitchWidth),
          )));
          const nextQuantities = Object.fromEntries(catalogue.map(part => [part.id, part.id === id ? estimate : 0]));
          setQuantities(nextQuantities);
          handleAutoNesting(createJobGeometry(catalogue, sourceCurves, nextQuantities).parts);
        }}
        canExport={Boolean(nestingResult?.placedCount)} unplacedCount={nestingResult?.unplacedCount ?? 0} onExport={format => {
          if (!nestingResult) return;
          try { exportLayout(format, nestingResult, parts, curves, curvePartMap, entities, transforms, { ...operatorSettings, spacing: partSpacing }, (fullNestingResult?.sheetCount ?? 1)>1 ? `${fileName.replace(/\.dxf$/i,'')} plaka-${selectedSheet+1}.dxf` : fileName); setNestingError(null); }
          catch (error) { setNestingError(error instanceof Error ? error.message : "Dışa aktarma başarısız."); }
        }} />
      {geometry.issues.length > 0 && <details className="geometry-issues"><summary>{geometry.issues.length} geometri bildirimi — açık eğriler parça değildir</summary><ul>{geometry.issues.map((issue,i)=><li key={i}>{issue.entityId}: {issue.message}</li>)}</ul></details>}
      {searchStatus && <p role="status" aria-live="polite">{searchStatus}</p>}
      {isNesting && <><progress aria-label="Yerleştirme ilerlemesi" max={fullNestingResult?.totalCount || 1} value={fullNestingResult?.placedCount || 0} /><button type="button" onClick={() => { nestingWorkerRef.current?.postMessage({type:'STOP_NESTING'} satisfies NestingWorkerRequest); setSearchStatus('Durduruluyor; en iyi geçerli sonuç korunuyor…'); }}>Durdur ve en iyi sonucu koru</button></>}
      {fullNestingResult && <p>Toplam: {fullNestingResult.placedCount}/{fullNestingResult.totalCount} parça · Yerleşmeyen: {fullNestingResult.unplacedCount} · {operatorSettings.materialType === 'sheet' ? `${fullNestingResult.sheetCount ?? 1} plaka` : `${fullNestingResult.materialHeight.toFixed(1)} mm rulo`} · Fire: %{(100-fullNestingResult.efficiency).toFixed(1)}{fullNestingResult.unplacedCount > 0 ? ' — eksik yerleşim' : ''}</p>}
      {(fullNestingResult?.sheetCount ?? 0)>1 && <label>Görüntülenecek / DXF kaydedilecek plaka <select aria-label="Plaka seçimi" disabled={isNesting} value={Math.min(selectedSheet,(fullNestingResult?.sheetCount??1)-1)} onChange={e=>{setSelectedSheet(Number(e.target.value));setTransforms({});setIsSimulating(false);setVisiblePlacementCount(fullNestingResult?.placedCount??0);}}>{fullNestingResult?.sheets?.map(sheet=><option key={sheet.index} value={sheet.index}>Plaka {sheet.index+1} · {sheet.placedCount} parça</option>)}</select></label>}

      <div className="viewer-toolbar"
        style={{
          minHeight:
            "70px",

          display:
            "flex",

          alignItems:
            "center",

          justifyContent:
            "space-between",

          gap: "12px",

          padding:
            "9px 12px",

          background:
            "rgba(255,255,255,0.94)",

          borderBottom:
            "1px solid rgba(0,0,0,0.07)",
        }}
      >
        <div
          style={{
            display:
              "flex",

            gap: "7px",

            alignItems:
              "center",

            flexWrap:
              "wrap",
          }}
        >
          <button
            type="button"
            onClick={
              () => handleAutoNesting()
            }
            disabled={isNesting || parts.length === 0 || geometry.issues.some(issue => issue.blocking)}
            style={{
              ...primaryButtonStyle,
              opacity: isNesting ? 0.65 : 1,
              cursor: isNesting ? "wait" : "pointer",
            }}
          >
            {isNesting
              ? "Hesaplanıyor…"
              : "◫ Otomatik Yerleşim"}
          </button>



          {nestingResult && (
            <button type="button" className="quick-export" disabled={isNesting} onClick={() => {
              try { exportLayout('dxf', nestingResult, parts, curves, curvePartMap, entities, transforms, { ...operatorSettings, spacing: partSpacing }, (fullNestingResult?.sheetCount ?? 1)>1 ? `${fileName.replace(/\.dxf$/i,'')} plaka-${selectedSheet+1}.dxf` : fileName); setNestingError(null); }
              catch (error) { setNestingError(error instanceof Error ? error.message : 'Dışa aktarma başarısız.'); }
            }}>↓ DXF Kaydet</button>
          )}

          {nestingResult && (
            <>
              <button
                type="button"
                onClick={
                  toggleSimulation
                }
                style={
                  simulationButtonStyle
                }
              >
                {simulationFinished
                  ? "▶ Simülasyonu Tekrarla"
                  : isSimulationPaused
                    ? "▶ Devam Et"
                    : "⏸ Duraklat"}
              </button>

              <select
                value={
                  simulationSpeed
                }
                onChange={(
                  event,
                ) =>
                  setSimulationSpeed(
                    event.target
                      .value as SimulationSpeed,
                  )
                }
                style={
                  selectStyle
                }
              >
                <option value="slow">
                  Yavaş
                </option>

                <option value="normal">
                  Normal
                </option>

                <option value="fast">
                  Hızlı
                </option>
              </select>

              <button
                type="button"
                onClick={
                  handleResetNesting
                }
                style={
                  toolbarButtonStyle
                }
              >
                Yerleşimi Sıfırla
              </button>
            </>
          )}

          <button
            type="button"
            onClick={
              resetManualTransforms
            }
            style={
              toolbarButtonStyle
            }
          >
            Taşımayı Sıfırla
          </button>

          <button
            type="button"
            onClick={
              fitToScreen
            }
            style={
              toolbarButtonStyle
            }
          >
            Ekrana Sığdır
          </button>

          <button
            type="button"
            onClick={
              zoomIn
            }
            style={
              squareButtonStyle
            }
          >
            +
          </button>

          <button
            type="button"
            onClick={
              zoomOut
            }
            style={
              squareButtonStyle
            }
          >
            −
          </button>
        </div>

        <div
          style={{
            display:
              "flex",

            alignItems:
              "center",

            gap: "9px",

            flexWrap:
              "wrap",

            justifyContent:
              "flex-end",

            fontSize:
              "11px",

            color:
              "#777",
          }}
        >
          <Statistic
            label="Parça"
            value={
              partStatistics.totalParts
            }
          />

          <Statistic
            label="Dış"
            value={
              contourStatistics.outer
            }
          />

          <Statistic
            label="İç"
            value={
              contourStatistics.holes
            }
          />

          <Statistic
            label="Açık"
            value={
              curveStatistics.open
            }
          />

          <Statistic
            label="Bağlı"
            value={
              partStatistics.attachedCurves
            }
          />

          <Statistic
            label="Yakınlaştırma"
            value={`${Math.round(
              view.scale *
                100,
            )}%`}
          />
        </div>
      </div>

      {nestingError && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(255,59,48,0.08)",
            color: "#b42318",
            borderBottom: "1px solid rgba(255,59,48,0.16)",
            fontSize: "12px",
            fontWeight: 600,
          }}
        >
          Yerleşim hatası: {nestingError}
        </div>
      )}

      {/* SIMULATION PANEL */}

      {nestingResult && (
        <>
          <div
            style={{
              display:
                "flex",

              alignItems:
                "center",

              justifyContent:
                "space-between",

              gap: "16px",

              padding:
                "10px 15px 8px",

              background:
                "rgba(0,122,255,0.055)",
            }}
          >
            <div>
              <strong
                style={{
                  fontSize:
                    "13px",
                }}
              >
                {simulationFinished
                  ? "✓ Yerleşim tamamlandı"
                  : isSimulationPaused
                    ? "Simülasyon duraklatıldı"
                    : `Yerleştiriliyor: ${visiblePlacementCount} / ${simulationTotal}`}
              </strong>
            </div>

            <div
              style={{
                fontSize:
                  "12px",

                color:
                  "#666",
              }}
            >
              %{progress.toFixed(
                0,
              )}
            </div>
          </div>

          {/* PROGRESS BAR */}

          <div
            style={{
              height:
                "5px",

              width:
                "100%",

              background:
                "rgba(0,122,255,0.10)",
            }}
          >
            <div
              style={{
                height:
                  "100%",

                width:
                  `${progress}%`,

                background:
                  "#007aff",

                transition:
                  "width 120ms ease",

                borderRadius:
                  "0 999px 999px 0",
              }}
            />
          </div>

          <section className="result-dashboard" aria-label="Yerleşim sonucu">
            <div className="result-metrics">
              <div><span>Yerleşen / toplam</span><strong>{nestingResult.placedCount}<small> / {nestingResult.totalCount}</small></strong></div>
              <div><span>Kullanılan yükseklik</span><strong>{nestingResult.usedHeight.toFixed(1)}<small> mm</small></strong></div>
              <div><span>Malzeme verimi</span><strong>%{nestingResult.efficiency.toFixed(1)}</strong></div>
              <div title="Net parça alanı / kullanılan tam genişlikteki şerit alanı. Kalan şerit dahil değildir."><span>Yerleşim doluluğu</span><strong>%{(100 * nestingResult.usedArea / Math.max(1, nestingResult.materialWidth * (nestingResult.usedHeight + nestingResult.margin))).toFixed(1)}</strong></div>
              <div><span>Yerleşemeyen</span><strong className={nestingResult.unplacedCount ? "has-unplaced" : "all-placed"}>{nestingResult.unplacedCount}<small> parça</small></strong></div>
            </div>
            <div className="result-details">
              <ResultItem label={operatorSettings.materialType === "roll" ? "Rulo" : "Plaka"} value={nestingResult.materialWidth.toFixed(1) + " × " + nestingResult.materialHeight.toFixed(1) + " mm"} />
              <ResultItem label="Gösterilen" value={visiblePlacementCount + " / " + simulationTotal} />
              <ResultItem label="Kullanılan genişlik" value={nestingResult.usedWidth.toFixed(1) + " mm"} />
              <ResultItem label="Parça alanı" value={(nestingResult.usedArea / 1e6).toFixed(4) + " m²"} />
              <ResultItem label="Malzeme alanı" value={(nestingResult.materialArea / 1e6).toFixed(4) + " m²"} />
              {operatorSettings.materialType === 'sheet' && <ResultItem label="Kalan şerit" value={Math.max(0, nestingResult.materialHeight - nestingResult.usedHeight - nestingResult.margin).toFixed(1) + " mm"} />}
            </div>
          </section>
        </>
      )}

      {/* CANVAS */}

      <div className="viewer-canvas-frame">
        <div className="viewer-dimensions" aria-label="Malzeme ölçüleri">
          {operatorSettings.materialType === 'roll' ? `Rulo: ${operatorSettings.rollWidth} mm` : `Plaka: ${operatorSettings.sheetWidth} × ${operatorSettings.sheetHeight} mm`}
        </div>
      <canvas
        ref={
          canvasRef
        }

        width={
          CANVAS_WIDTH
        }

        height={
          CANVAS_HEIGHT
        }

        onWheel={
          handleWheel
        }

        onMouseDown={
          handleMouseDown
        }

        onMouseMove={
          handleMouseMove
        }

        onMouseUp={
          stopDragging
        }

        onMouseLeave={
          stopDragging
        }

        style={{
          display:
            "block",

          width:
            "100%",

          height:
            "auto",

          cursor:
            dragState
              ? "grabbing"
              : "grab",

          touchAction:
            "none",

          userSelect:
            "none",
        }}
      />
      </div>
    </div>
  );
}

/* =========================================================
   STATISTIC
========================================================= */

type StatisticProps = {
  label: string;

  value:
    | string
    | number;
};

function Statistic({
  label,
  value,
}: StatisticProps) {
  return (
    <span>
      {label}:{" "}

      <strong
        style={{
          color:
            "#222",
        }}
      >
        {value}
      </strong>
    </span>
  );
}

/* =========================================================
   RESULT ITEM
========================================================= */

type ResultItemProps = {
  label: string;

  value:
    | string
    | number;
};

function ResultItem({
  label,
  value,
}: ResultItemProps) {
  return (
    <span>
      <span
        style={{
          color:
            "#777",
        }}
      >
        {label}:{" "}
      </span>

      <strong
        style={{
          color:
            "#111",
        }}
      >
        {value}
      </strong>
    </span>
  );
}

/* =========================================================
   STYLES
========================================================= */

const primaryButtonStyle: React.CSSProperties = {
  border:
    "1px solid rgba(0,100,255,0.15)",

  borderRadius:
    "11px",

  padding:
    "9px 14px",

  background:
    "linear-gradient(180deg, #1687ff 0%, #0071e3 100%)",

  color:
    "#ffffff",

  cursor:
    "pointer",

  fontWeight:
    700,

  boxShadow:
    "0 4px 12px rgba(0,113,227,0.20)",
};

const simulationButtonStyle: React.CSSProperties = {
  border:
    "1px solid rgba(0,122,255,0.18)",

  borderRadius:
    "10px",

  padding:
    "8px 11px",

  background:
    "rgba(0,122,255,0.08)",

  color:
    "#0066cc",

  cursor:
    "pointer",

  fontWeight:
    700,
};

const toolbarButtonStyle: React.CSSProperties = {
  border:
    "1px solid rgba(0,0,0,0.08)",

  borderRadius:
    "10px",

  padding:
    "8px 11px",

  background:
    "#ffffff",

  cursor:
    "pointer",

  fontWeight:
    600,
};

const squareButtonStyle: React.CSSProperties = {
  border:
    "1px solid rgba(0,0,0,0.08)",

  borderRadius:
    "10px",

  width:
    "38px",

  height:
    "36px",

  background:
    "#ffffff",

  cursor:
    "pointer",

  fontSize:
    "18px",
};

const selectStyle: React.CSSProperties = {
  height:
    "36px",

  border:
    "1px solid rgba(0,0,0,0.08)",

  borderRadius:
    "10px",

  padding:
    "0 10px",

  background:
    "#ffffff",

  color:
    "#222",

  cursor:
    "pointer",

  fontWeight:
    600,

  outline:
    "none",
};
