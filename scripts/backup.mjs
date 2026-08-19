import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "data");
const backupRoot = path.resolve(process.env.XIAOFU_BACKUP_DIR || path.join(root, "..", "xiaofu-backups"));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(backupRoot, "data-" + stamp);

if (!fs.existsSync(source)) throw new Error("data 目录不存在：" + source);
fs.mkdirSync(backupRoot, { recursive: true });
fs.cpSync(source, target, { recursive: true, preserveTimestamps: true, errorOnExist: true });
fs.writeFileSync(path.join(target, "BACKUP-MANIFEST.json"), JSON.stringify({
  createdAt: new Date().toISOString(),
  source,
  note: "恢复前请停止服务，再将此目录内容复制回 data/。"
}, null, 2) + "\n");
console.log("备份完成：" + target);
