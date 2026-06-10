import type { Mesh, Scene } from '@babylonjs/core';

/**
 * WebXR(VR):floorMeshes 即得地面瞬移;非安全上下文/无 XR 设备优雅降级(不出按钮)。
 * 局域网 IP + HTTP 下浏览器不暴露 navigator.xr —— 内网 TLS 是 P7 项。
 */
export async function setupXR(scene: Scene, floor: Mesh): Promise<void> {
  if (!('xr' in navigator) || !window.isSecureContext) {
    console.info('[展厅] 非安全上下文或无 WebXR,VR 入口隐藏');
    return;
  }
  try {
    await scene.createDefaultXRExperienceAsync({ floorMeshes: [floor] });
  } catch (e) {
    console.warn('[展厅] WebXR 初始化失败(无设备时正常):', e);
  }
}
