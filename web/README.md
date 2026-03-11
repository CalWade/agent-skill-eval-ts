# web

Agent Skill 评测平台前端，基于 Vue 3 + Vite + Element Plus。

本目录作为 pnpm workspace 的子包，由根目录的 `pnpm dev` 统一启动，不需要单独运行。

## 单独启动（开发调试用）

```bash
pnpm install
pnpm dev      # 启动前端 dev server，默认 :5173
```

前端通过 Vite proxy 将 `/api` 请求转发到后端 `:3001`，需要后端同时运行。

## 构建

```bash
pnpm build    # 输出到 dist/
```
