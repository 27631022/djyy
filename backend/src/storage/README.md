# storage 模块

平台统一文件存储。把"文件字节"从数据库挪出去,落到可配置的存储后端;消费方(证书 / 任务 等)只持有 `fileId` 引用。

## 拥有的表
- `StoredFile`(`// @module: storage`):一行 = 一个已落地文件的元数据(指针 + 校验信息),**不存字节**。

## 对外接口(走 barrel `../storage`)
- `StorageService.put(input, ctx)` → `StoredFileMeta`(含 `id`)。`input.folder` = 业务子文件夹。
- `StorageService.getStream(id)` / `getBuffer(id)` / `getMeta(id)` / `softDelete(id, ctx)`。
- 跨模块**只注入 `StorageService`**,不要直查 `StoredFile` 表(守 DAG + 表归属)。

## HTTP
- `POST /files`(`file:upload`,multipart)、`GET /files/:id`(仅登录,StreamableFile)、`DELETE /files/:id`(`file:delete`,软删)。
- **公开下载不在此**:证书公开下载走 `/public/certificates/verify/:token/file`,经 DI 调 `StorageService.getStream`。

## 存储后端(driver)
- env `STORAGE_DRIVER`:`local`(默认)| `synology` | `s3`。
- `STORAGE_LOCAL_DIR`:本地盘根目录(默认 `./storage-data`)。
- **群晖**:把群晖共享盘挂载到后端机器,`STORAGE_LOCAL_DIR` 指过去即可(LocalDiskDriver 同一份代码),文件落成 File Station 可浏览目录。`SynologyDriver`(File Station API)/ `S3Driver` 为占位,启用前需实现(规格见 `~/.claude/plans/ai-swirling-bear.md` 附录)。

## 业务文件夹约定
`storageKey = {ownerModule}/{folder}/{文件名}`。证书:`certificate/{表彰年度-荣誉名}/荣誉-姓名-工号.pdf`;任务(将来):`task/{报送单位}/...`。文件名/文件夹自动清洗非法字符,撞名加 `-2/-3`。

## 坑位备忘
- **multipart 上限 ≠ json limit**:`POST /files` 由本模块按扩展名分级校验(视频 300MB / 3D 100MB / 其余 30MB,`EXT_MAX_BYTES`),与 `main.ts` 的 `json({limit:'50mb'})` 互不相干。
- **多实例**:LocalDiskDriver 仅适合"单实例 + 持久卷/挂载网络盘"。水平扩展多副本必须切对象存储(各副本本地盘互相取不到文件)。
- **孤儿回收**(未实现):上传后未被业务引用、或删业务对象未删文件的字节会悬留。后续加定时任务 + 各消费模块经 DI 暴露 `isFileReferenced(fileId)`(storage 不能直扫别人的表)。
