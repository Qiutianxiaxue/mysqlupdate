const fs = require('fs');
const path = require('path');

// 读取文件
const filePath = path.join(__dirname, '../src/services/DatabaseMigrationService.ts');
let content = fs.readFileSync(filePath, 'utf8');

// 正则表达式匹配 logger.info 调用（包括多行）
// 匹配从 logger.info( 开始到相应的闭合括号和分号结束
const loggerInfoRegex = /\s*logger\.info\([^;]*?\);?/gs;

// 删除所有 logger.info 调用
content = content.replace(loggerInfoRegex, '');

// 删除被注释掉的 logger.info 行
const commentedLoggerInfoRegex = /\s*\/\/\s*logger\.info\([^;]*?\);?/gs;
content = content.replace(commentedLoggerInfoRegex, '');

// 清理多余的空行（超过2个连续空行减少为2个）
content = content.replace(/\n\s*\n\s*\n+/g, '\n\n');

// 写回文件
fs.writeFileSync(filePath, content, 'utf8');

console.log('已成功删除所有 logger.info 调用');
