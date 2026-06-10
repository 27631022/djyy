// earcut 3.x 不带类型定义,本地声明(Babylon CreateText 注入用)
declare module 'earcut' {
  export default function earcut(
    vertices: ArrayLike<number>,
    holes?: ArrayLike<number>,
    dimensions?: number,
  ): number[];
}
