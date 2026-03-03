# OSS / 云存储路径规范

为便于按用户、按资源类型管理和清理，存储路径建议如下。

## 规范（推荐）

在 Bucket 内（或 `OSS_PREFIX` 下）使用统一结构：

```
{prefix}users/{userId}/{type}/{uniqueId}-{filename}
```

- **prefix**：环境变量 `OSS_PREFIX`（可选），如 `nihongogpt`，用于多应用共用同一 Bucket。
- **userId**：当前用户 ID，隔离不同用户的数据。
- **type**：资源类型：
  - `sources` — 用户上传的来源文件（PDF、文本、音频等）
  - `audio` — TTS 生成的音频
  - `covers` — 牌组封面等图片
- **uniqueId**：唯一标识（如时间戳或 cuid），避免重名覆盖。
- **filename**：原始文件名或安全化后的名称。

## 示例

- 牌组封面：`users/clxxx/covers/1730123456789-cover.jpg`
- 来源 PDF：`users/clxxx/sources/1730123456790-document.pdf`
- TTS 音频：`users/clxxx/audio/1730123456791-tts.mp3`

## 实现说明

- 新上传（封面、新来源等）通过 `uploadToStorage(..., { pathPrefix: 'users/{userId}/{type}' })` 写入上述路径。
- 历史数据可继续保留在原有路径（如顶层 `sources/`、`audio/`），不做迁移；新功能统一走 `users/{userId}/...`。
- 按 `userId` 分目录便于后续做用量统计、按用户清理或合规导出。
