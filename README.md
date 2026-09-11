# Cloud-Score 班级积分管理系统

<p align="center">
  <a href="README.en.md">English Documentation</a> | <b>简体中文文档</b>
</p>

<p align="center">
  <a href="https://github.com/mayunqing1230/Cloud-Score"><img src="https://img.shields.io/badge/GitHub-mayunqing1230%2FCloud--Score-blue?logo=github" alt="GitHub Repo"></a>
  <img src="https://img.shields.io/badge/Version-v1.5.1-brightgreen.svg" alt="Version: v1.5.1">
  <img src="https://img.shields.io/badge/Architecture-Serverless%20%7C%204--Files-orange.svg" alt="Serverless">
  <img src="https://img.shields.io/badge/Tests-32%2F32%20Pass-success.svg" alt="Tests">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT"></a>
</p>

<p align="center">
  基于 <b>Cloudflare Pages + Pages Functions + 私有 R2 强一致性对象存储</b> 构建的轻量级、企业级安全、全端自适应无服务器班级积分与学生评价管理系统。
</p>

---

## 🌟 核心特性

### 1. 纯无服务器与零框架架构（Zero Server & Zero Framework）
- **4 核心文件，零外部运行时依赖**：全站由恰好 4 个纯原生文件（`_worker.js`、`login.html`、`admin.html`、`teacher.html`）组成。原生 ES2022 JavaScript + 现代语义化 HTML5 + CSS3 变量与响应式网格，无 Webpack/Vite 等构建产物，无外部 CDN 脚本，加载毫秒级响应。
- **强一致性 R2 存储**：完全基于 Cloudflare 私有 R2 Standard 对象存储，放弃最终一致性的 KV，依托对象 ETag 乐观锁保障多名教师高并发记分零覆盖。
- **极简极低运维成本**：Cloudflare 后台仅需配置**唯一加密密钥** `ADMIN`，存储绑定名固定为 `R2`，零数据库实例，免费额度即可支持普通学校全年稳定运行。

### 2. 双角色体系与严格权限隔离
- **超级管理员（admin）**：负责教师账号维护（建号、重置密码、归档/恢复）、班级目录维护、教师-班级多对多绑定配置、全局密码策略设置与系统公告发布。
- **任课教师（Teacher）**：支持自主修改登录密码；支持管理所辖班级的学生、评分项目与小组结构（增删改、排序、软归档与恢复），仅对绑定的班级拥有操作权限。
- **严格路径白名单与角色互斥**：对外严格仅开放 `/login`、`/admin`、`/teacher` 及 `/api/*`，所有非法路径探测、隐藏文件和根路径强制 302 重定向到 `/login.html`；教师禁入管理台，管理员禁入教师台，未登录统一拦截。

### 3. 全局密码安全策略与初始密码标记（v1.5.0 全新）
- **全局密码强度策略**：管理员可在后台随时开启/关闭密码强度要求，支持按需组合：
  - 最小长度（6–32 位自定义）；
  - 强制包含大写字母（A-Z）；
  - 强制包含小写字母（a-z）；
  - 强制包含阿拉伯数字（0-9）；
  - 强制包含特殊符号（标点符号）。
- **双轨免限机制**：管理员创建教师或重置密码时直接遵循底层安全基线（6–128 位），**不受自定义复杂策略限制**，极大方便管理员批量分发简易初始口令；教师端自主改密时严格受全局策略限制。
- **初始密码状态精准跟踪**：教师账号精准记录 `initialPasswordChanged`；新创建教师与管理员重置密码后自动标为【初始密码】，在管理员教师列表中以高对比度橙色徽章醒目提示。
- **教师登录改密弹窗与实时正反馈**：未改密教师登录后自动弹出改密模态框；支持管理员配置【提醒模式（可跳过）】与【强制模式（禁关闭/Esc）】；新密码输入框下方动态渲染规则勾选清单（✓/○），提供直观正反馈。
- **一键全员改密应急操作**：后台提供【⚠️ 一键要求所有教师改密】操作（带二次防误触确认），一键批量置位所有有效教师，从容应对全校级安全合规升级。

### 4. 纯前端多级高级排序与拼音强制升序保底（v1.4.0 全新）
- **纯前端零后端交互**：完全在客户端内存与表格渲染计算流程中执行，零网络请求、零存储负担。
- **多级自定义优先级**：教师可在工具栏打开【⚡ 高级排序】面板，自由增删多个优先级条件（个人总分、小组总分、各自定义评分项目），并独立指定升序或降序；支持通过【↑】【↓】一键调整优先级顺序。
- **强制汉字拼音 A-Z 升序保底**：当所有设置的优先等级分值均相同时，系统自动执行汉字拼音（`Intl.Collator("zh-Hans-CN")`）升序保底，确保排版次序绝对确定、无歧义。
- **彩色状态标记框与互斥联动**：表格上方醒目展示高级排序生效状态卡片，支持一键 `[×]` 清除；点击表头单列排序时自动优先让位；按账号和班级在本地隔离记忆，切换班级时自动重置为默认录入顺序。

### 5. 系统公告与版本更新日志（v1.3.0 全新）
- **公告与时间线双模块**：管理员可在后台编辑面向全体教师的【置顶通知】（支持富文本排版）与【版本更新日志】卡片时间线（版本号、日期、详细更新说明）。
- **新公告发布与静默保存**：支持一键发布新公告触发全员教师重新弹出；支持静默保存修正错别字而不打扰教师。
- **教师端原生模态框展示**：教师登录后自动居中弹出原生 `<dialog>` 窗口，支持勾选【无新公告时不再弹出】（基于教师账号隔离的本地 Cookie 记录）；顶栏常驻【📢 公告】入口与未读小红点，方便教师随时调出复看。

### 6. Excel 式智能记分与冲突仲裁
- **自然语言混合记分智能解析**：单元格支持混合输入文字注释与分值（如 `[主动发言+2] 迟到-1` $\rightarrow$ 小计 `+1`）；仅统计带显式 `+` 或 `-` 的数字，普通无符号数字（如日期 `20260901`）不计分并给出友好黄色警示。
- **离线草稿暂存与防误关拦截**：未提交修改即时保存在 `sessionStorage`，意外刷新或断网重连后无缝恢复；存在未保存修改时，自动激活浏览器原生 `beforeunload` 弹窗拦截，杜绝误关导致心血白费。
- **乐观并发冲突逐项仲裁**：当多名教师并发修改同一学生的同一单元格时，弹出直观的版本差异对比面板，支持逐项选择保留服务器最新版或本地草稿版。

### 7. 极致全端交互与全场景深色模式
- **全端浅色 / 深色模式**：默认自动跟随操作系统 `prefers-color-scheme: dark`，页面右上角提供独立的 ☀️/🌙/🌓 三态切换按钮，全站界面与弹窗均采用深度定制的高品质护眼配色。
- **桌面端（PC）**：冻结左侧姓名列、顶部表头与右侧总分列；支持键盘上下左右方向键无缝跳格快速录入；编辑弹窗正居中聚焦。
- **移动端（手机）防异常专属排版（v1.5.1）**：
  - 44px 紧凑顶栏针对性隐藏长文本链接，杜绝顶栏折行撑破与横向滚动条，各操作按钮触控精准；
  - 顶栏 `[分] Cloud Score` 标志升级为可点击链接，移动端轻触直达 GitHub 仓库；
  - 主内容区顶部提供仅 20px 高的轻量流式指示行，在表格滚动记分时自然滑出视野，零挤占记分屏幕空间；
  - 悬浮工具栏双行紧凑排布（~68px 高），单屏横向容纳 6 个以上评分项目，支持平滑横向滑动浏览全部项目；
  - 记分编辑抽屉靠顶排布（`top: 12px`），彻底避开手机虚拟软键盘遮挡。

### 8. 企业级安全防线
- **纯数学计算题验证码**：加减乘整数动态算式挑战，防机器人碰撞与暴力破解，彻底告别图形验证码加载失败与小屏扭曲问题。
- **防爆破临时 IP 封禁**：密码连续错误 8 次自动触发 15 分钟临时 IP 封禁（哈希存储于 R2，不暴露原始 IP，隐私合规）。
- **严格 CSP 与安全 Cookie**：全站启用严格 Content-Security-Policy 内联脚本 SHA-256 哈希校验，禁止内联动态拼接；Cookie 强制启用 `HttpOnly; SameSite=Strict; Secure; Path=/`（生产环境使用 `__Host-` 前缀）。

---

## 📁 4 核心文件架构

整个生产运行系统由恰好 4 个纯原生核心文件构成，无多余子目录，极简纯粹：

```text
├── _worker.js         # Cloudflare Pages Advanced Mode 聚合后端 API 路由与安全鉴权
├── login.html         # 统一登录认证、深浅色切换与数学计算题验证码
├── admin.html         # 管理员控制台（教师/班级管理、密码策略与系统公告）
├── teacher.html       # 教师积分台（高密度记分、高级排序、班级设置与改密）
├── LICENSE            # MIT 开源协议许可文本
├── README.md          # 详细中文说明文档
└── README.en.md       # Detailed English Documentation
```

### R2 私有对象存储结构

```text
system/catalog.json            # 教师账号、PBKDF2 哈希、班级目录、密码策略与初始密码标记
system/announcement.json       # 系统公告置顶通知、版本更新日志与发布版本标识
classes/{classId}.json         # 班级稳定结构、个人/小组积分、修订版本号与变更回执
sessions/{tokenHash}.json      # 不透明会话、角色权限、CSRF 凭证与固定过期时间
captchas/{id}.json             # 一次性数学挑战哈希、IP 摘要与过期时间
guards/{ipHash}.json           # 登录失败计数时间窗口与临时 IP 封禁记录
```

> **稳定 ID 与软归档设计**：所有学生、评分项目与小组均采用全生命周期稳定的随机 ID（`s_*`, `p_*`, `g_*`）。删除操作为“软归档（Archive）”，历史积分永远按稳定 ID 关联保留，可随时一键恢复，杜绝误操作导致历史数据丢失。

---

## 📊 支持规模与系统边界

| 维度 | 建议指标 / 边界 | 说明 |
| :--- | :--- | :--- |
| **有效班级数量** | 最多 20 个班级 | 支持年级多班并行管理 |
| **教师账号数量** | 最多 100 个教师 | 支持多对多权限交叉绑定 |
| **每班学生容量** | 最多 100 名学生 | 满足超大班额教学需要 |
| **每班评分项目** | 最多 30 个项目 | 自定义德智体美劳等多维度考评 |
| **每班小组数量** | 最多 20 个小组 | 支持合作学习分组评价 |
| **单单元格限制** | 最多 500 字符，分值绝对值最大 `1,000,000` | 容纳翔实的日常评语备注 |
| **单批次保存** | 单次 API 请求最多提交 500 个单元格修改 | 满足整班批量保存打分需求 |

---

## 🚀 极速部署指南

### 方式一：Cloudflare Pages Direct Upload（网页拖拽 ZIP，最简推荐，3 分钟上线）

1. **获取 4 文件发布包**：
   下载本项目 Releases 中最新发布的 **`Cloud-Score-upload.zip`**（或由本地执行 `npm run build:release` 自动生成的无目录 ZIP 包）。
   *（注：该 ZIP 内部直接包含 `_worker.js`、`login.html`、`admin.html`、`teacher.html` 4 个文件，绝无嵌套子目录）*

2. **创建 Cloudflare Pages 项目**：
   - 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)；
   - 进入 **Workers & Pages** $\rightarrow$ **Create Application** $\rightarrow$ **Pages** $\rightarrow$ **Direct Upload**；
   - 输入项目名称（如 `cloud-score`），将 `Cloud-Score-upload.zip` 拖入上传并点击部署。

3. **配置 R2 存储桶与管理员密钥（关键步骤）**：
   - 在 Cloudflare 控制台左侧进入 **R2**，点击 **Create bucket** 创建一个私有存储桶（如 `cloud-score-data`，保持 Public Access 为关闭状态）；
   - 回到 Pages 项目详情页 $\rightarrow$ **Settings** $\rightarrow$ **Functions**：
     - **R2 bucket bindings**：点击 Add binding，Variable name **必须填大写 `R2`**，选择刚才创建的 Bucket；
     - **Environment variables**：点击 Add variable，选择 Type 为 **Secret（加密）**，Variable name **必须填大写 `ADMIN`**，Value 输入管理员初始强密码（建议 20 位以上包含字母与数字的随机口令）；
   - 回到 Pages 项目主页，再次点击 **Deploy a new version** 重新拖入上传一次 ZIP，使环境变量与 R2 绑定正式生效。

4. **初始化登录**：
   - 访问你的 Pages 默认域名（`https://<project-name>.pages.dev`）或绑定的自定义域名；
   - 系统将自动跳转至 `/login.html`；
   - 账号输入 `admin`，密码输入你在 Secret 中配置的 `ADMIN` 密码，计算数学题即可进入管理后台建班、添加教师、设置密码策略。

---

### 方式二：Git 仓库零配置一键部署

1. **Fork 或导入 GitHub 仓库**：
   - 将本项目 Fork 到你自己的 GitHub 账号；
   - 在 Cloudflare Pages 中点击 **Connect to Git**，选中你的仓库；
   - 构建设置（Framework preset 选 `None`，Build command 与 Build output directory **全部留空**）。
2. **配置 R2 与 Secret 变量**：
   - 在项目设置的 Functions 中绑定 R2 存储桶（变量名 `R2`）与 Secret 密钥（变量名 `ADMIN`）；
   - 重新触发一次部署即可。

---

## ❓ 常见问题排查（FAQ）

### Q1: 部署后访问域名提示 500 或 "Static asset binding is unavailable" / "Internal Server Error"？
- **排查原因**：Functions 运行时未正确读取到绑定的 R2 存储桶或加密 Secret。
- **解决方案**：
  1. 检查 Pages 的 **Settings $\rightarrow$ Functions** 中 R2 绑定的变量名是否为**严格纯大写的 `R2`**（不能写成 `r2` 或其他名称）；
  2. 检查环境变量中是否配置了类型为 **Secret** 且变量名为**严格纯大写的 `ADMIN`**；
  3. 配置变量后必须重新部署一次（上传 ZIP 或推送提交）才能让绑定生效。

### Q2: 教师登录连续提示密码错误后被锁定了？
- **排查原因**：系统内置防暴力破解机制，同一 IP 连续 8 次密码错误将触发 15 分钟临时 IP 封禁保护。
- **解决方案**：等待 15 分钟后系统自动解封；或者管理员可在管理后台（`admin.html`）一键为该教师重置密码。

### Q3: 为什么修改教师密码后登录提示改密弹窗？
- **排查原因**：v1.5.0 起引入了初始密码状态跟踪机制。由管理员新创建的教师或被管理员重置密码的教师，账号会被自动标记为【初始密码】状态。
- **解决方案**：教师根据界面实时规则指引设置一次个人新密码即可，改密成功后将自动进入工作台并不再弹出提示。管理员亦可在后台切换为“提醒模式”或直接关闭密码强度策略。

---

## 📄 开源许可

本项目遵循 [MIT License](LICENSE) 开源协议，个人与教育机构可免费商用、修改与私有部署。
