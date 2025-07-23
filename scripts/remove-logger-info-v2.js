const fs = require('fs');
const path = require('path');

// 读取文件
const filePath = path.join(__dirname, '../src/services/SchemaDetectionService.ts');
let content = fs.readFileSync(filePath, 'utf8');

// 按行分割内容
let lines = content.split('\n');
let newLines = [];
let i = 0;

while (i < lines.length) {
  const line = lines[i];
  
  // 检查是否是 logger.info 行（包括注释掉的）
  const isLoggerInfo = line.trim().match(/^(\/\/\s*)?logger\.info\(/);
  
  if (isLoggerInfo) {
    // 找到 logger.info 行，需要找到对应的结束位置
    let openParens = 0;
    let currentLine = i;
    let inString = false;
    let stringChar = '';
    let escaped = false;
    
    // 计算括号匹配
    while (currentLine < lines.length) {
      const currentContent = lines[currentLine];
      
      for (let j = 0; j < currentContent.length; j++) {
        const char = currentContent[j];
        
        if (escaped) {
          escaped = false;
          continue;
        }
        
        if (char === '\\') {
          escaped = true;
          continue;
        }
        
        if (!inString && (char === '"' || char === "'" || char === '`')) {
          inString = true;
          stringChar = char;
          continue;
        }
        
        if (inString && char === stringChar) {
          inString = false;
          stringChar = '';
          continue;
        }
        
        if (!inString) {
          if (char === '(') {
            openParens++;
          } else if (char === ')') {
            openParens--;
          }
        }
      }
      
      // 如果括号匹配完成且行以分号结束，则删除这些行
      if (openParens === 0 && currentContent.trim().endsWith(';')) {
        i = currentLine + 1;
        break;
      }
      
      currentLine++;
      
      // 防止无限循环
      if (currentLine >= lines.length) {
        i = currentLine;
        break;
      }
    }
  } else {
    // 不是 logger.info 行，保留
    newLines.push(line);
    i++;
  }
}

// 重新组合内容
content = newLines.join('\n');

// 清理多余的空行（超过2个连续空行减少为2个）
content = content.replace(/\n\s*\n\s*\n+/g, '\n\n');

// 写回文件
fs.writeFileSync(filePath, content, 'utf8');

console.log('已成功删除所有 logger.info 调用');
