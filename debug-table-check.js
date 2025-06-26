const { Sequelize } = require('sequelize');

async function debugTableCheck() {
  console.log('=== 调试表存在检查 ===\n');

  // 使用你的数据库连接配置
  const sequelize = new Sequelize({
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: '123456',
    database: 'test_database', // 请替换为你的实际数据库名
    dialect: 'mysql',
    logging: console.log, // 显示SQL查询
  });

  try {
    // 测试连接
    console.log('1. 测试数据库连接...');
    await sequelize.authenticate();
    console.log('✅ 数据库连接成功\n');

    // 获取当前数据库名
    console.log('2. 获取当前数据库名...');
    const [dbResult] = await sequelize.query("SELECT DATABASE() as db_name");
    const currentDb = dbResult[0].db_name;
    console.log(`当前数据库: ${currentDb}\n`);

    // 显示所有表
    console.log('3. 显示所有表...');
    const [tables] = await sequelize.query("SHOW TABLES");
    console.log('所有表:');
    tables.forEach((table, index) => {
      const tableName = Object.values(table)[0];
      console.log(`  ${index + 1}. ${tableName}`);
    });
    console.log('');

    // 测试特定表检查
    const testTableName = 'users'; // 请替换为你要检查的表名
    console.log(`4. 检查表 "${testTableName}" 是否存在...`);
    
    // 方法1: SHOW TABLES LIKE
    try {
      const [likeResult] = await sequelize.query("SHOW TABLES LIKE ?", {
        replacements: [testTableName]
      });
      console.log(`SHOW TABLES LIKE结果:`, likeResult);
      console.log(`存在性: ${likeResult.length > 0 ? '存在' : '不存在'}\n`);
    } catch (error) {
      console.log('SHOW TABLES LIKE查询失败:', error.message);
    }

    // 方法2: information_schema
    try {
      const [schemaResult] = await sequelize.query(
        "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
        { replacements: [testTableName] }
      );
      console.log(`information_schema结果:`, schemaResult);
      console.log(`存在性: ${schemaResult[0].count > 0 ? '存在' : '不存在'}\n`);
    } catch (error) {
      console.log('information_schema查询失败:', error.message);
    }

    // 方法3: 直接查询
    try {
      await sequelize.query(`SELECT 1 FROM ${testTableName} LIMIT 1`);
      console.log(`直接查询结果: 表存在\n`);
    } catch (error) {
      console.log(`直接查询结果: 表不存在 (${error.message})\n`);
    }

  } catch (error) {
    console.error('❌ 调试失败:', error.message);
  } finally {
    await sequelize.close();
  }
}

// 提示用户修改配置
console.log('请先修改此脚本中的数据库连接配置：');
console.log('- database: 你的数据库名');
console.log('- testTableName: 你要检查的表名');
console.log('- 其他连接参数（host, username, password等）\n');

debugTableCheck(); 