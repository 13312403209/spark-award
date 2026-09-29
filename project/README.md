# Spark Award · 可跨电脑继续编辑的项目

当前包含 100k 银色和 50k 黄绿色两个独立等级。奖牌素材全部英文，参考 UI 保持中文。技术栈为 Three.js r180、GSAP 3.13.0、静态 JavaScript；GLB、HDRI、视频与依赖全部随项目保存，不依赖原电脑路径。

## 在另一台电脑继续

1. 克隆 GitHub 仓库后，在 Codex 中打开本 `project` 文件夹。也可以先下载项目包、解压并打开此文件夹；持续同步推荐使用 Git 克隆。
2. 让 Codex 先读 `AGENTS.md` 与 `PROJECT_CONTEXT.md`，再说要修改哪个等级。
3. 运行下面的启动命令，或让 Codex 帮你启动。需要 Python 3，不需要 npm 安装。

```sh
python3 tools/preview.py --edition 50k
python3 tools/preview.py --edition 100k
```

Windows 如没有 `python3` 命令，可用 `py -3` 替代。启动后浏览器自动打开预览；Ctrl+C 停止。可使用 `--port 8767` 指定端口、`--no-open` 不自动打开浏览器。

## 源码位置

- `dist/`：100k 英文银色徽章，中文 UI，100,000 次。
- `editions/50k/threejs/`：50k 英文黄绿色徽章，中文 UI，50,000 次。
- 各等级的 `badge-lab.html`：材质、视角与模型调试。
- `docs/100K开发接入说明.md` / `docs/50K开发接入说明.md`：各等级模块边界与接入说明。
- [最新开发交接包](https://github.com/13312403209/spark-award/releases/tag/handoff-2026-09-29)：50k 最新黑底开屏版，以及保持不变的 100k 英文徽章版。
- `PROJECT_CONTEXT.md`：给另一台电脑 / 新对话的项目交接。

不要修改生成的自包含 HTML 来代替修改源码。需要离线预览时运行：

```sh
python3 tools/build-100k-preview.py
python3 editions/50k/tools/build-preview.py
```

100k 输出在 `outputs/`，50k 输出在 `editions/50k/preview/`；它们是生成文件，不必提交到 Git。

## 两台电脑同步方式

在一台电脑工作前先同步远端；修改完成后提交并推送，再到另一台电脑拉取。GitHub 是源文件的同步位置，不会自动同步尚未提交的改动，也不代替当前对话记录。此项目已保存继续工作所需的上下文。

不要在两台电脑同时改同一等级的同一文件；如有并行工作，使用不同分支并合并。新增等级使用独立目录、资源路径和调试存储键。

2026-09-29 已同步 50k 最新黑底开屏视频和交接资料，100k 实现保持不变。它不包含用户账号、密钥、原电脑临时工作文件或 Blender 工程。已有 GLB 可以继续完成网页材质、动画和 UI 修改；修改模型字形/几何时需要用户另行提供 Blender 源工程。

Codex 项目文件夹说明：https://learn.chatgpt.com/docs/projects
