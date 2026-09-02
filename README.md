# Cloud-Score 班级积分管理系统

<p align="center">
  <a href="README.en.md">English Documentation</a> | <b>简体中文文档</b>
</p>

<p align="center">
  <a href="https://github.com/mayunqing1230/Cloud-Score"><img src="https://img.shields.io/badge/GitHub-mayunqing1230%2FCloud--Score-blue?logo=github" alt="GitHub Repo"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT"></a>
</p>

<p align="center">
  基于 <b>Cloudflare Pages + Pages Functions + 私有 R2 强一致性对象存储</b> 构建的轻量级、企业级安全、全端自适应无服务器班级积分与学生评价管理系统。
</p>

---

## 🌟 核心特性

### 1. 纯无服务器架构（Zero Server & Zero Framework）
- **4 核心文件，零外部运行时依赖**：原生现代 HTML5 / CSS3 / ES2022 JavaScript 编写，无庞大前端打包产物，无外部 CDN 脚本，加载毫秒级响应。
- **强一致性 R2 存储**：完全基于 Cloudflare 私有 R2 Standard 对象存储，放弃最终一致性的 KV，依托对象 ETag 乐观锁保障多人并发记分零覆盖。
- **极简运维**：Cloudflare 后台仅需配置**唯一加密密钥** `ADMIN`，绑定名固定为 `R2`，零复杂数据库运维。

### 2. 双角色体系与严格权限隔离
- **超级管理员（admin）**：负责教师账号维护（创建、改密、归档/恢复）、班级目录维护与教师-班级多对多绑定配置。
- **任课教师（Teacher）**：支持自主修改登录密码；密码长度支持 6–128 位；支持管理所辖班级的学生、评分项目与小组结构（增删改、排序、软归档与恢复）。
- **严格路径白名单与角色互斥**：对外仅开放 `/login`、`/admin`、`/teacher` 及 `/api/*`，所有非法路径探测与根路径强制 302 重定向到 `/login.html`；教师禁入管理台，管理员禁入教师台，未登录统一拦截。

### 3. Excel 式智能记分与冲突解决
- **自然语言记分智能解析**：单元格支持混合输入文字注释与分值（如 `[课堂表现+2] 迟到-1` $\rightarrow$ `+1`）；仅统计带显式 `+` 或 `-` 的数字，日期等普通数字不计分并给黄色警示。
- **离线草稿与防误触拦截**：本地草稿即时暂存 `sessionStorage`，网络重连或刷新后自动提示恢复；检测到未保存修改时，自动触发浏览器原生 `beforeunload` 防关闭/防刷新拦截。
- **乐观锁冲突仲裁**：多人并发保存同一单元格产生版本冲突时，弹出冲突仲裁面板供逐项选择保留服务器最新版或本地修改版。

### 4. 全字段点击升降序与拼音 A-Z 智能排序
- **学生姓名 / 小组名称**：支持按汉字拼音 **A-Z（正序） $\rightarrow$ Z-A（倒序） $\rightarrow$ 默认顺序** 循环切换（采用国际标准 `Intl.Collator("zh-Hans-CN")`）。
- **评分项目与总分**：所有评分项目小计、个人总分、小组总分均支持 **降序（高到低） $\rightarrow$ 升序（低到高） $\rightarrow$ 默认顺序** 循环切换，实时联动计算本地未提交草稿。

### 5. 极致的移动端与桌面端体验
- **桌面端（PC）**：冻结左侧姓名列、顶部表头与右侧总分列；键盘上下左右键无缝定位；编辑弹窗正居中聚焦。
- **移动端（手机）**：
  - 顶部悬浮工具栏超紧凑双行排布（占用高度仅 ~68px）；
  - 积分表格高密度压缩排版，手机单屏横向直接呈现 **6 个以上评分项目**，支持平滑横向滑动浏览所有项目；
  - 记分编辑面板采用靠顶排布（`top: 12px`），彻底避开手机底部软键盘遮挡。

### 6. 企业级安全防线
- **纯数学计算题验证码**：加减乘整数算式挑战，防机器撞库与爆破，彻底解决图形验证码加载与移动端兼容问题。
- **防爆破临时 IP 封禁**：密码连续错误 8 次自动触发 15 分钟临时 IP 封禁（哈希存储于 R2，不暴露原始 IP）。
- **严格 CSP 与 Cookie 规范**：全站启用严格 Content-Security-Policy 内联脚本 SHA-256 哈希防护，Cookie 强制 `HttpOnly; SameSite=Strict; Secure; Path=/`（生产环境使用 `__Host-` 前缀）。

---

## 📁 4 个核心文件清单

整个系统由恰好 4 个纯原生核心文件构成，无任何多余子目录与依赖：

```text
├── _worker.js         # Cloudflare Pages Advanced Mode 聚合后端 API 路由与安全鉴权
├── login.html         # 登录认证与数学计算题验证码
├── admin.html         # 管理员控制台（教师管理、班级管理与权限绑定）
├── teacher.html       # 教师积分台（记分录入、排序、班级设置与改密）
├── README.md          # 详细中文说明文档
└── README.en.md       # Detailed English Documentation
```

### R2 私有对象存储结构

```text
system/catalog.json            # 教师账号、PBKDF2 哈希、班级目录和多对多绑定配置
classes/{classId}.json         # 班级稳定结构、个人/小组积分、修订版本号与变更回执
sessions/{tokenHash}.json      # 不透明会话、角色、CSRF 与固定过期时间
captchas/{id}.json             # 一次性数学挑战哈希、IP 摘要与过期时间
guards/{ipHash}.json           # 登录失败计数窗口与临时 IP 封禁记录
```

> **注**：所有学生、项目与小组均采用稳定随机 ID（`s_*`, `p_*`, `g_*`）。删除操作为“软归档（Archive）”，历史积分永远按 ID 关联保留，可随时一键恢复。

---

## 📊 支持规模与系统边界

| 维度 | 建议指标 / 边界 |
| :--- | :--- |
| **有效班级数量** | 最多 20 个班级 |
| **教师账号数量** | 最多 100 个教师 |
| **每班学生容量** | 最多 100 名学生 |
| **每班评分项目** | 最多 30 个项目 |
| **每班小组数量** | 最多 20 个小组 |
| **单单元格限制** | 最多 500 字符，分值绝对值最大 `1,000,000` |
| **单批次保存** | 单次 API 请求最多提交 500 个单元格修改 |

---

## 🚀 部署指南

### 方式一：Cloudflare Pages Direct Upload（网页拖拽 ZIP，最简推荐）

1. **准备 4 文件压缩包**：
   将仓库中的 `_worker.js`、`login.html`、`admin.html`、`teacher.html` 4 个文件直接打包为一个 ZIP 压缩包（或直接使用 Releases 中提供的 ZIP）。

2. **创建 Cloudflare Pages 项目**：
   - 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)；
   - 进入 **Workers & Pages** $\rightarrow$ **Create Application** $\rightarrow$ **Pages** $\rightarrow$ **Direct Upload**；
   - 项目名称自定义（如 `cloud-score`），上传 4 文件 ZIP 并点击部署。

3. **配置 R2 存储桶与密钥（关键步骤）**：
   - 在 Cloudflare 控制台进入 **R2**，创建一个私有 Bucket（如 `cloud-score-r2`，保持 Public Access 关闭）；
   - 回到 Pages 项目 $\rightarrow$ **Settings** $\rightarrow$ **Functions**：
     - 在 **R2 bucket bindings** 中添加绑定：Variable name 必须填纯大写 `R2`，选择刚创建的 Bucket；
     - 在 **Environment variables** 中添加加密变量（Type 选 **Secret**）：Variable name 填 `ADMIN`，Value 填你的管理员强密码（建议 20 位以上随机字符）；
   - 再次上传一次 ZIP 触发重新部署，使 R2 与 Secret 绑定正式生效。

4. **初始化使用**：
   - 访问你的 Pages 域名（或绑定的自定义域名），会自动跳转至 `/login.html`；
   - 用户名输入 `admin`，密码输入你设置的 `ADMIN` 密钥值，完成验证码即可进入管理台建班建号。

---

### 方式二：Git 仓库零配置一键部署

1. **关联 GitHub 仓库**：
   - Fork 或推送到你自己的 GitHub 仓库；
   - 在 Cloudflare Pages 中选择 **Connect to Git** 导入该仓库；
   - 构建配置（全部留空即可）：
     - **Framework preset**：`None`
     - **Build command**：*（留空）*
     - **Build output directory**：*（留空，即根目录）*
2. **配置 R2 绑定与 Secret**：
   - 在 Pages 项目设置中添加 R2 绑定（变量名 `R2`）以及 Secret（变量名 `ADMIN`）；
   - 保存并重新部署即可。

---

## ❓ 常见问题排查（FAQ）

### Q1: 部署后访问提示 500 或 "Internal Server Error"？
- **排查**：请检查 Pages 项目的 **Settings $\rightarrow$ Functions** 中是否正确配置了名为 `R2` 的 R2 Bucket 绑定以及名为 `ADMIN` 的 Secret。

### Q2: 教师密码被锁定了怎么办？
- **解决**：连续输错 8 次密码会触发 15 分钟 IP 封禁保护。等待 15 分钟后自动解封，或者由管理员在 `/admin.html` 页面一键为教师重置密码。

---

## 📄 开源许可

本项目遵循 [MIT License](https://opensource.org/licenses/MIT) 开源协议。
