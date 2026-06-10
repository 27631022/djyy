# exhibition-client · 企业虚拟展厅 3D 客户端

独立 Babylon.js 工程(无 React)。开网址即进:第一人称漫游 + 点击看详情 + WebXR。
数据驱动:一个展厅 = 后端一份「已解析」JSON(`GET /api/halls/:id`),上传素材即上架。

## 启动

```bash
npm install
npm run dev        # http://localhost:5174/?hall=<展厅id>(缺省取第一个已发布厅)
npm run check      # tsc + eslint(门禁)
```

dev 经 vite proxy 把 `/api` 转给 `localhost:3001`(免 CORS);生产构建后与后端同域反代即可。

## 操作

- 桌面:WASD/方向键移动,点击画面锁定鼠标转视角(ESC 退出),点击展品看详情
- 移动:左下虚拟摇杆移动,拖屏转视角
- VR:安全上下文(localhost / HTTPS)下自动出现「进入 VR」按钮,地面传送

## 结构

```
src/
├── main.ts                  # 入口编排:取厅 → 引擎/场景 → 外壳 → 相机 → 组件 → XR
├── types.ts                 # 契约(与 backend/src/exhibition/exhibition.types.ts 同步!)
├── api/hallApi.ts           # /api/halls + /api/public/exhibition/font
├── theme/presets.ts         # 三套主题参数表(modern_light / party_red / dark_tech)
├── scene/                   # 引擎(DPR)、场景(IBL+后期)、外壳(墙/地/发光格栅吊顶)、PBR 材质工厂
├── fixtures/                # 7 种组件 builder + 精致占位 + 射灯光锥;fixtureFactory 分发
├── camera/                  # 第一人称(碰撞+重力+指针锁定)、移动端摇杆
├── interaction/             # 射线拾取 → HTML 详情浮层
├── ui/loadingScreen.ts      # 品牌化加载页
└── xr/webxrHelper.ts        # WebXR 优雅降级
public/env/studio.hdr        # 自托管 IBL 环境贴图(CC0,Polyhaven)
```

## 关键约定(踩坑记录)

- **PBR 颜色必须线性空间**:sRGB hex → `Color3.FromHexString(x).toLinearSpace()`,统一收在 `materialFactory.pbr()`,别绕过工厂直接建材质
- **fixture 朝向**:`rot` 0=朝-Y(平面图),面向=(sin rot, -cos rot);根节点 `rotation.y=-rot`、相机 `π-rot`
- **双面文字**:两块单面板背靠背,不用 DOUBLESIDE(背面镜像)
- **中文 3D 字**:`hallApi.font(去重字符)` → `CreateText + earcut`;字体子集由后端 opentype.js 实时产出
- **离线自托管**:无 CDN 出站;Draco/KTX2 解码器未配置(当前 .glb 不压缩;要支持压缩资产时自托管解码器并配 `DracoCompression.Configuration`)
- **改契约**:`src/types.ts` 与后端 `exhibition.types.ts` 两边同步
