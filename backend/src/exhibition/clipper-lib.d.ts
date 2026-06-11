/**
 * clipper-lib(Angus Johnson Clipper 6.4.2 的 JS 移植)最小类型垫片 ——
 * 包无官方类型;只声明字体服务用到的 union / offset / 面积 API。
 */
declare module 'clipper-lib' {
  export interface IntPoint {
    X: number;
    Y: number;
  }
  export type Path = IntPoint[];
  export type Paths = Path[];

  export const PolyFillType: {
    pftEvenOdd: 0;
    pftNonZero: 1;
    pftPositive: 2;
    pftNegative: 3;
  };
  export const JoinType: { jtSquare: 0; jtRound: 1; jtMiter: 2 };
  export const EndType: {
    etOpenSquare: 0;
    etOpenRound: 1;
    etOpenButt: 2;
    etClosedLine: 3;
    etClosedPolygon: 4;
  };

  export const Clipper: {
    /** 对自身做 union(按 fillType 消重叠/自交),输出外圈 CCW(正面积)、孔 CW */
    SimplifyPolygons(polys: Paths, fillType: number): Paths;
    /** 清除近共线/重复点(distance 为坐标单位) */
    CleanPolygons(polys: Paths, distance: number): Paths;
    /** 有向面积(y 向上坐标系:CCW 为正) */
    Area(poly: Path): number;
  };

  export class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number);
    AddPaths(paths: Paths, joinType: number, endType: number): void;
    Execute(solution: Paths, delta: number): void;
  }
}
