/**
 * 日志清理服务测试脚本
 */

const API_BASE = 'http://localhost:33000/api/log-cleanup';

// 测试函数
async function testLogCleanupService() {
  console.log('🧪 开始测试日志清理服务...\n');

  try {
    // 4. 手动触发清理 (可选，会实际执行清理)
    console.log('🧹 4. 手动触发清理任务:');
    const cleanupResponse = await fetch(`${API_BASE}/manual`, {
      method: 'POST',
    });
    const cleanupData = await cleanupResponse.json();
    console.log(JSON.stringify(cleanupData, null, 2));
    console.log('');

    console.log('✅ 日志清理服务测试完成!');

  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 运行测试
testLogCleanupService();
