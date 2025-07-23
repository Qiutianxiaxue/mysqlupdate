// 开发环境的模块别名配置
const moduleAlias = require('module-alias');

// 在开发环境中，将 @ 别名指向 src 目录而不是 dist 目录
moduleAlias.addAlias('@', __dirname + '/../src');
