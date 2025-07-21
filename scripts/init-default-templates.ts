import dotenv from "dotenv";
import InitialDataTemplate from "../src/models/InitialDataTemplate";
import { syncDatabase } from "../src/models";
import logger from "../src/utils/logger";

// 加载环境变量
dotenv.config();

/**
 * 初始化默认的初始数据模板
 */
async function initializeDefaultTemplates() {
  try {
    logger.info("开始初始化默认的初始数据模板");

    // 确保数据库已同步
    await syncDatabase();

    const defaultTemplates = [
      // 主数据库模板
      {
        template_name: "001_system_config",
        template_version: "1.0.0",
        database_type: "main" as const,
        script_content: `-- 系统配置初始数据
INSERT INTO \`system_config\` (\`config_key\`, \`config_value\`, \`config_desc\`, \`status\`, \`create_time\`) VALUES
('app_name', 'MySQL数据库管理系统', '应用名称', 1, NOW()),
('app_version', '1.0.0', '应用版本', 1, NOW()),
('max_connection', '100', '最大数据库连接数', 1, NOW()),
('session_timeout', '3600', '会话超时时间（秒）', 1, NOW())
ON DUPLICATE KEY UPDATE 
  \`config_value\` = VALUES(\`config_value\`),
  \`update_time\` = NOW();`,
        description: "初始化系统配置数据",
        execution_order: 1,
        dependencies: "[]",
        is_enabled: true,
      },
      {
        template_name: "002_admin_users",
        template_version: "1.0.0",
        database_type: "main" as const,
        script_content: `-- 管理员用户初始数据
INSERT INTO \`admin_users\` (\`username\`, \`password\`, \`nickname\`, \`email\`, \`status\`, \`create_time\`) VALUES
('admin', MD5('123456'), '系统管理员', 'admin@example.com', 1, NOW())
ON DUPLICATE KEY UPDATE 
  \`nickname\` = VALUES(\`nickname\`),
  \`update_time\` = NOW();

INSERT INTO \`admin_roles\` (\`role_name\`, \`role_desc\`, \`status\`, \`create_time\`) VALUES
('super_admin', '超级管理员', 1, NOW()),
('admin', '管理员', 1, NOW()),
('operator', '操作员', 1, NOW())
ON DUPLICATE KEY UPDATE 
  \`role_desc\` = VALUES(\`role_desc\`),
  \`update_time\` = NOW();`,
        description: "初始化管理员用户和角色数据",
        execution_order: 2,
        dependencies: '["001_system_config"]',
        is_enabled: true,
      },
      {
        template_name: "003_admin_menus",
        template_version: "1.0.0",
        database_type: "main" as const,
        script_content: `-- 系统菜单初始数据
INSERT INTO \`admin_menus\` (\`menu_name\`, \`menu_url\`, \`parent_id\`, \`menu_icon\`, \`sort_order\`, \`status\`, \`create_time\`) VALUES
('系统管理', '#', 0, 'fa-cogs', 1, 1, NOW()),
('用户管理', '/admin/users', 1, 'fa-users', 1, 1, NOW()),
('角色管理', '/admin/roles', 1, 'fa-user-tag', 2, 1, NOW()),
('菜单管理', '/admin/menus', 1, 'fa-list', 3, 1, NOW()),
('数据库管理', '#', 0, 'fa-database', 2, 1, NOW()),
('表结构管理', '/migration/schema', 5, 'fa-table', 1, 1, NOW()),
('数据迁移', '/migration/data', 5, 'fa-exchange-alt', 2, 1, NOW()),
('初始数据', '/migration/initial-data', 5, 'fa-plus-circle', 3, 1, NOW())
ON DUPLICATE KEY UPDATE 
  \`menu_name\` = VALUES(\`menu_name\`),
  \`menu_url\` = VALUES(\`menu_url\`),
  \`update_time\` = NOW();`,
        description: "初始化系统菜单数据",
        execution_order: 3,
        dependencies: '["002_admin_users"]',
        is_enabled: true,
      },

      // 日志数据库模板
      {
        template_name: "001_log_config",
        template_version: "1.0.0",
        database_type: "log" as const,
        script_content: `-- 日志配置初始数据
INSERT INTO \`log_levels\` (\`level_name\`, \`level_value\`, \`level_desc\`, \`status\`, \`create_time\`) VALUES
('DEBUG', 1, '调试日志', 1, NOW()),
('INFO', 2, '信息日志', 1, NOW()),
('WARN', 3, '警告日志', 1, NOW()),
('ERROR', 4, '错误日志', 1, NOW()),
('FATAL', 5, '致命错误日志', 1, NOW())
ON DUPLICATE KEY UPDATE 
  \`level_desc\` = VALUES(\`level_desc\`),
  \`update_time\` = NOW();

INSERT INTO \`log_types\` (\`type_name\`, \`type_desc\`, \`status\`, \`create_time\`) VALUES
('login', '登录日志', 1, NOW()),
('operation', '操作日志', 1, NOW()),
('system', '系统日志', 1, NOW()),
('error', '错误日志', 1, NOW()),
('migration', '迁移日志', 1, NOW())
ON DUPLICATE KEY UPDATE 
  \`type_desc\` = VALUES(\`type_desc\`),
  \`update_time\` = NOW();`,
        description: "初始化日志配置数据",
        execution_order: 1,
        dependencies: "[]",
        is_enabled: true,
      },

      // 订单数据库模板
      {
        template_name: "001_order_config",
        template_version: "1.0.0",
        database_type: "order" as const,
        script_content: `-- 订单配置初始数据
INSERT INTO \`order_status\` (\`status_code\`, \`status_name\`, \`status_desc\`, \`sort_order\`, \`status\`, \`create_time\`) VALUES
('pending', '待支付', '订单已创建，等待支付', 1, 1, NOW()),
('paid', '已支付', '订单已支付，等待发货', 2, 1, NOW()),
('shipped', '已发货', '订单已发货，配送中', 3, 1, NOW()),
('delivered', '已送达', '订单已送达客户', 4, 1, NOW()),
('completed', '已完成', '订单交易完成', 5, 1, NOW()),
('cancelled', '已取消', '订单已取消', 6, 1, NOW())
ON DUPLICATE KEY UPDATE 
  \`status_name\` = VALUES(\`status_name\`),
  \`status_desc\` = VALUES(\`status_desc\`),
  \`update_time\` = NOW();

INSERT INTO \`payment_methods\` (\`method_code\`, \`method_name\`, \`method_desc\`, \`sort_order\`, \`status\`, \`create_time\`) VALUES
('alipay', '支付宝', '支付宝在线支付', 1, 1, NOW()),
('wechat', '微信支付', '微信在线支付', 2, 1, NOW()),
('bank', '银行转账', '银行转账支付', 3, 1, NOW())
ON DUPLICATE KEY UPDATE 
  \`method_name\` = VALUES(\`method_name\`),
  \`method_desc\` = VALUES(\`method_desc\`),
  \`update_time\` = NOW();`,
        description: "初始化订单配置数据",
        execution_order: 1,
        dependencies: "[]",
        is_enabled: true,
      },

      // 静态数据库模板
      {
        template_name: "001_dict_data",
        template_version: "1.0.0",
        database_type: "static" as const,
        script_content: `-- 数据字典初始数据
INSERT INTO \`dict_types\` (\`type_code\`, \`type_name\`, \`type_desc\`, \`status\`, \`create_time\`) VALUES
('gender', '性别', '用户性别分类', 1, NOW()),
('user_status', '用户状态', '用户账户状态', 1, NOW()),
('order_type', '订单类型', '订单业务类型', 1, NOW())
ON DUPLICATE KEY UPDATE 
  \`type_name\` = VALUES(\`type_name\`),
  \`type_desc\` = VALUES(\`type_desc\`),
  \`update_time\` = NOW();

INSERT INTO \`dict_items\` (\`dict_type\`, \`item_code\`, \`item_name\`, \`item_value\`, \`sort_order\`, \`status\`, \`create_time\`) VALUES
('gender', 'M', '男', '1', 1, 1, NOW()),
('gender', 'F', '女', '0', 2, 1, NOW()),
('user_status', 'active', '正常', '1', 1, 1, NOW()),
('user_status', 'disabled', '禁用', '0', 2, 1, NOW()),
('order_type', 'normal', '普通订单', '1', 1, 1, NOW()),
('order_type', 'presell', '预售订单', '2', 2, 1, NOW())
ON DUPLICATE KEY UPDATE 
  \`item_name\` = VALUES(\`item_name\`),
  \`item_value\` = VALUES(\`item_value\`),
  \`update_time\` = NOW();`,
        description: "初始化数据字典数据",
        execution_order: 1,
        dependencies: "[]",
        is_enabled: true,
      },
    ];

    // 创建默认模板
    for (const template of defaultTemplates) {
      try {
        // 检查是否已存在
        const existing = await InitialDataTemplate.findByNameAndVersion(
          template.template_name,
          template.template_version,
          template.database_type
        );

        if (!existing) {
          await InitialDataTemplate.create(template);
          logger.info(`创建默认初始数据模板: ${template.template_name}`);
        } else {
          logger.info(`跳过已存在的模板: ${template.template_name}`);
        }
      } catch (error) {
        logger.error(`创建模板失败: ${template.template_name}`, { error });
      }
    }

    logger.info("默认初始数据模板初始化完成");
  } catch (error) {
    logger.error("初始化默认模板失败", { error });
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  initializeDefaultTemplates()
    .then(() => {
      console.log("初始化完成");
      process.exit(0);
    })
    .catch((error) => {
      console.error("初始化失败:", error);
      process.exit(1);
    });
}

export default initializeDefaultTemplates;
