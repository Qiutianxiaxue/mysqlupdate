const fetch = require("node-fetch");

async function testNullableLogic() {
  console.log("=== 测试Nullable比较逻辑 ===");

  try {
    const response = await fetch(
      "http://localhost:3000/api/migration/execute",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          table_name: "store_orders",
          database_type: "main",
          schema_version: "1.0.1",
        }),
      }
    );

    const result = await response.json();
    console.log("迁移结果:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("API调用失败:", error.message);
  }
}

testNullableLogic();
