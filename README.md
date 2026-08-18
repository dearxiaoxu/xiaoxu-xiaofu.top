# xiaoxu & xiaofu · 我们的小站

> xiaoxu 与 xiaofu 的记录站：他写代码，她画生活 · [www.xiaoxu-xiaofu.top](https://www.xiaoxu-xiaofu.top)

纯原生 **HTML / CSS / JavaScript + 零依赖 Node.js** 打造，自带**管理后台**与**数据存储**：所有内容（文章、项目、相册、留言等）都保存在内嵌 SQLite 数据库 `data/site.db` 里（首次启动自动从 `data/db.json` 迁移），通过浏览器后台可视化编辑，代码里不再有任何需要手动修改的内容数据。

## 快速开始

无需 `npm install`，只要本机装有 Node.js（≥22.13，需内置 `node:sqlite`）：

```bash
node server.js
# 或
npm start
```

- 前台：http://localhost:3000
- **管理后台**：http://localhost:3000/admin （默认密码 `admin123`，登录后请立即修改）
- 端口可用环境变量修改：`PORT=8080 node server.js`

## 目录结构

```
.
├── server.js              # 零依赖服务端：静态页面 + 内容 API + 鉴权 + 上传 + 留言
├── index.html             # 首页（骨架，内容由 js/site.js 从 API 渲染）
├── about.html             # 关于我们（双人档案 / 我们的故事 / 一起做的事）
├── blog.html              # 博客列表
├── post.html              # 文章详情（post.html?id=<文章ID>）
├── projects.html          # 项目作品
├── gallery.html           # 生活瞬间（相册，灯箱预览）
├── contact.html           # 联系我们 + 访客留言板
├── admin/                 # 管理后台（可视化编辑所有内容）
├── css/style.css          # 设计系统（暖橙金主题、暗色模式、响应式、科技感交互）
├── js/main.js             # 交互（主题、动效、灯箱、计时器等，事件委托）
├── js/site.js             # 前端渲染器（读 API 渲染所有内容，含迷你 Markdown）
├── data/site.db           # ★ SQLite 数据库（运行期唯一数据源，自动生成）
├── data/db.json           # 首次启动时的种子/备份（迁移后不再由服务写入）
├── data/uploads/          # ★ 上传的图片（后台相册上传，自动创建）
└── data/admin.json        # 管理员密码散列（首次启动自动生成）
```

## 管理后台功能

登录 `/admin` 后可编辑：

- **站点设置**：站名、标题、SEO 描述、邮箱、在一起纪念日（`2024-11-29`）、页脚标语等
- **首页 Hero**：标题、名字、打字机词库、按钮、统计数据、两人名片
- **关于我们**：双人档案、技能标签、我们的故事时间线、一起做的事
- **文章管理**：新建/编辑/删除文章（标题、作者、日期、分类、摘要、正文——正文支持迷你 Markdown：`## 标题`、`> 引用`、` ``` 代码块 `、`**加粗**`、`` `行内代码` ``）
- **项目管理**：图标、名称、描述、标签、状态
- **相册管理**：渐变占位块或上传真实图片（图片存进 `data/uploads/`）
- **联系与留言**：联系方式卡片、访客留言查看与删除
- **数据与安全**：一键导出/导入内容 JSON 备份、修改管理员密码

## API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/content` | 读取全部内容数据 |
| POST | `/api/login` | `{"password"}` → `{"token"}`（登录后台） |
| PUT | `/api/content` | 保存全部内容数据（需 `Authorization: Bearer <token>`） |
| POST | `/api/upload` | 上传图片 `{"name","data(base64)"}` → `{"url"}`（需 token） |
| PUT | `/api/password` | 修改管理员密码 `{"password"}`（需 token） |
| POST | `/api/messages` | 访客留言 `{"name","text"}`（带频率限制与蜜罐） |

## 存储与备份

- 全部内容在 SQLite `data/site.db`（WAL 模式、事务写入，留言单独成表，避免整库重写）；
- `data/db.json` 仅在首次启动时作为种子导入，之后以 `site.db` 为准，可作为初始备份保留；
- 上传图片在 `data/uploads/`，建议定期备份整个 `data/` 目录；
- 后台「数据与安全」页支持一键下载内容 JSON 备份、导入恢复。

## 部署上线

> 🚀 **有云服务器？直接看 [deploy/部署指南.md](deploy/部署指南.md)**：上传项目 → `sudo bash deploy/deploy.sh` 一键部署（自动装 Node、systemd 守护、开机自启、数据保护）。大陆服务器需先完成 ICP 备案再绑域名。

本版需要 Node 运行环境（后台与存储依赖服务端）。可选方案：

1. **云容器平台（推荐，最省心）**：Railway / Render / Fly.io —— 直接导入本目录，启动命令 `node server.js`；设置环境变量 `PORT`（平台要求）与 `ADMIN_PASSWORD`（初始密码）；持久化磁盘挂载 `data/` 目录。
2. **自有服务器 / VPS**：上传代码 → `nohup node server.js &` 或用 pm2：`pm2 start server.js --name xiaofu`；用 Nginx 反代 80/443 端口并配 HTTPS：

```nginx
server {
    listen 443 ssl;
    server_name xiaoxu-xiaofu.top www.xiaoxu-xiaofu.top;
    ssl_certificate     /etc/ssl/xiaoxu-xiaofu.pem;
    ssl_certificate_key /etc/ssl/xiaoxu-xiaofu.key;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        client_max_body_size 16m;
    }
}
```

3. 域名解析：`www` 与 `@` 记录指向服务器 IP（或平台提供的地址）。

> 若仍想用纯静态托管（Cloudflare Pages 等），本版的管理后台与存储不可用——那是上一版的能力范围。需要的话可以额外做一个「静态导出」脚本把内容渲染成纯 HTML。

## 设计要点

- 暖橙金主题配色：#FA8952 活力橙 / #FAA652 蜜橙 / #FABF52 暖金 / #FAA596 鲑鱼粉 / #FAD352 亮金 / #FAD3AD 蜜桃，呼应两个人的温暖日常；
- 支持暗色模式（自动跟随系统，可手动切换，localStorage 记忆）；
- 科技感交互：卡片聚光灯、3D 倾斜、磁性按钮、打字机文案、数字滚动与粒子背景；
- 在一起天数实时计时：以 2024.11.29 为起点，随时区与当前日期自动更新，跨天自动 +1；
- 响应式布局：电脑 / 平板 / 手机自适应，移动端折叠导航、安全区适配；
- 正文迷你 Markdown 渲染，所有用户内容均做 XSS 转义。
