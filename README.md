# RiskMind 企业风险智能决策平台

用于 AI 创新大赛演示的企业风险管理 Demo，包含风险驾驶舱、全面风险管理、知识中心、期权估值和 AI 情景压力测试五个模块。

## 快速开始

环境要求：Node.js 22+。

```bash
npm install
npm run dev
```

启动后访问 `http://localhost:5173/`，由统一首页进入各演示模块。

## 生产构建

```bash
npm run build
npm run preview
```

构建产物位于 `dist/`。如果应用部署在子路径下，复制 `.env.example` 为 `.env.production`，并调整 `VITE_BASE_PATH`，例如：

```env
VITE_BASE_PATH=/risk-erm-ai/
```

## Docker 部署

Dockerfile 默认使用公司 Harbor 与 Nexus 镜像源。容器内由 Node/Fastify 同时提供静态页面和 `/api/knowledge-manifest` 清单接口：

```bash
docker build -t risk-erm-ai-demo .
docker run --rm -p 3000:3000 risk-erm-ai-demo
```

访问 `http://localhost:3000/risk-erm-ai/`。

现场 Kubernetes 环境使用 `configmap-pdfbox-dev` 中的 `application.yaml` 提供 S3 配置。Deployment 需要将它挂载到 `/config/application.yaml`：

```yaml
spec:
  template:
    spec:
      containers:
        - name: risk-erm-ai
          volumeMounts:
            - name: pdfbox-config
              mountPath: /config/application.yaml
              subPath: application.yaml
              readOnly: true
      volumes:
        - name: pdfbox-config
          configMap:
            name: configmap-pdfbox-dev
            items:
              - key: application.yaml
                path: application.yaml
```

Node 服务默认读取其中的 `s3.endpoint`、`s3.access-key`、`s3.secret-key`、`s3.bucket` 和 `s3.region`，不再使用 `omp-data-storage`。

## 项目结构

```text
.
├── index.html                         # 统一演示入口
├── modules/
│   ├── cockpit/                       # 风险驾驶舱
│   ├── knowledge-center/              # 合规与风险知识中心
│   └── quant/
│       ├── stress-test/               # AI 情景压力测试
│       └── valuation/                 # 期权估值前端与 Python 定价代码
├── public/modules/enterprise-risk/    # 全面风险管理及两个内嵌子模块
├── vite.config.js                     # Vite 多页面构建
├── server/index.js                    # 静态页面与 S3 清单 API
└── Dockerfile                         # Node 22 构建及运行镜像
```

## 演示说明

- 页面当前使用内置演示数据，适合比赛现场展示。
- 压力测试支持导入 `modules/quant/stress-test/交易记录.xlsx`。
- Python 定价代码可单独自测：

```bash
python modules/quant/valuation/demo_valuation.py
```

Windows 终端如出现字符编码问题，可先设置 UTF-8 模式后再运行。

<!-- CI build trigger: 2026-10-12 -->
