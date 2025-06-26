const fs = require("fs");
const path = require("path");

console.log("🚀 开始初始化MySQL数据库自动升级工具...\n");

// 创建必要的目录
const directories = ["logs", "dist", "coverage"];

directories.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ 创建目录: ${dir}`);
  } else {
    console.log(`ℹ️  目录已存在: ${dir}`);
  }
});

// 检查.env文件
const envPath = path.join(__dirname, "..", ".env");
const envExamplePath = path.join(__dirname, "..", "env.example");

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log("✅ 创建.env文件（请修改数据库配置）");
  } else {
    console.log("⚠️  未找到env.example文件，请手动创建.env文件");
  }
} else {
  console.log("ℹ️  .env文件已存在");
}

console.log("\n📋 下一步操作：");
console.log("1. 修改.env文件中的数据库配置");
console.log("2. 运行 npm install 安装依赖");
console.log("3. 运行 npm run dev 启动开发服务器");
console.log("4. 访问 http://localhost:3000 查看API文档");

console.log("\n🎉 初始化完成！");
