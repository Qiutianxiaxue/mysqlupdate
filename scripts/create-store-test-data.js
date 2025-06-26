const mysql = require("mysql2/promise");
require("dotenv").config();

// 数据库配置
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "123456",
  database: process.env.DB_NAME || "enterprise_main", // 假设是企业主数据库
};

// 测试门店数据
const testStores = [
  {
    store_id: 1001,
    store_name: "北京朝阳店",
    store_code: "BJ001",
    address: "北京市朝阳区建国路88号",
    phone: "010-12345678",
    manager: "张三",
    status: 1,
  },
  {
    store_id: 1002,
    store_name: "北京海淀店",
    store_code: "BJ002",
    address: "北京市海淀区中关村大街1号",
    phone: "010-87654321",
    manager: "李四",
    status: 1,
  },
  {
    store_id: 1003,
    store_name: "上海浦东店",
    store_code: "SH001",
    address: "上海市浦东新区陆家嘴环路1000号",
    phone: "021-11111111",
    manager: "王五",
    status: 1,
  },
  {
    store_id: 1004,
    store_name: "上海徐汇店",
    store_code: "SH002",
    address: "上海市徐汇区淮海中路500号",
    phone: "021-22222222",
    manager: "赵六",
    status: 1,
  },
  {
    store_id: 1005,
    store_name: "广州天河店",
    store_code: "GZ001",
    address: "广州市天河区天河路208号",
    phone: "020-33333333",
    manager: "孙七",
    status: 1,
  },
  {
    store_id: 1006,
    store_name: "深圳福田店",
    store_code: "SZ001",
    address: "深圳市福田区深南大道1000号",
    phone: "0755-44444444",
    manager: "周八",
    status: 0, // 测试一个停用的门店
  },
];

async function createStoreTableAndData() {
  let connection;

  try {
    console.log("🏪 开始创建门店表和测试数据...\n");

    // 连接数据库
    console.log("1️⃣ 连接数据库...");
    connection = await mysql.createConnection(dbConfig);
    console.log(
      `✅ 已连接到数据库: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`
    );

    // 检查并创建门店表
    console.log("\n2️⃣ 创建门店表...");

    // 先检查表是否存在
    const [tables] = await connection.execute("SHOW TABLES LIKE 'store'");

    if (tables.length > 0) {
      console.log("⚠️  门店表已存在，将删除重建...");
      await connection.execute("DROP TABLE store");
    }

    // 创建门店表
    const createTableSQL = `
      CREATE TABLE store (
        store_id INT PRIMARY KEY COMMENT '门店ID',
        store_name VARCHAR(100) NOT NULL COMMENT '门店名称',
        store_code VARCHAR(20) NOT NULL UNIQUE COMMENT '门店编码',
        address VARCHAR(255) DEFAULT NULL COMMENT '门店地址',
        phone VARCHAR(20) DEFAULT NULL COMMENT '联系电话',
        manager VARCHAR(50) DEFAULT NULL COMMENT '店长姓名',
        status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1-正常，0-停用',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        INDEX idx_status (status),
        INDEX idx_store_code (store_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门店表'
    `;

    await connection.execute(createTableSQL);
    console.log("✅ 门店表创建成功");

    // 插入测试数据
    console.log("\n3️⃣ 插入测试门店数据...");

    const insertSQL = `
      INSERT INTO store (store_id, store_name, store_code, address, phone, manager, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    for (const store of testStores) {
      await connection.execute(insertSQL, [
        store.store_id,
        store.store_name,
        store.store_code,
        store.address,
        store.phone,
        store.manager,
        store.status,
      ]);

      console.log(
        `   ✅ 插入门店: ${store.store_name} (${store.store_code}) - 状态: ${
          store.status === 1 ? "正常" : "停用"
        }`
      );
    }

    // 验证数据
    console.log("\n4️⃣ 验证门店数据...");
    const [allStores] = await connection.execute(
      "SELECT * FROM store ORDER BY store_id"
    );
    const [activeStores] = await connection.execute(
      "SELECT * FROM store WHERE status = 1 ORDER BY store_id"
    );

    console.log(`📊 数据统计:`);
    console.log(`   - 总门店数: ${allStores.length}`);
    console.log(`   - 正常门店数: ${activeStores.length}`);
    console.log(`   - 停用门店数: ${allStores.length - activeStores.length}`);

    console.log("\n📋 门店列表:");
    allStores.forEach((store, index) => {
      console.log(
        `   ${index + 1}. ${store.store_name} (ID: ${store.store_id}, 编码: ${
          store.store_code
        }) - ${store.status === 1 ? "✅正常" : "❌停用"}`
      );
    });

    console.log("\n🎉 门店表和测试数据创建完成！");
    console.log("✨ 创建内容：");
    console.log("   - ✅ 门店表结构（包含索引）");
    console.log("   - ✅ 6个测试门店数据");
    console.log("   - ✅ 5个正常门店 + 1个停用门店");
    console.log("   - ✅ 覆盖北京、上海、广州、深圳等城市");
  } catch (error) {
    console.error("❌ 创建失败:", error.message);
    console.error("详细错误:", error);
  } finally {
    if (connection) {
      await connection.end();
      console.log("🔒 数据库连接已关闭");
    }
  }
}

// 运行脚本
createStoreTableAndData();
