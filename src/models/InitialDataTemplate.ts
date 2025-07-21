import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "@/config/database";

// 初始数据脚本模板接口
export interface InitialDataTemplateAttributes {
  template_id: number;
  template_name: string; // 脚本模板名称
  template_version: string; // 脚本模板版本
  database_type: "main" | "log" | "order" | "static"; // 数据库类型
  script_content: string; // SQL脚本内容
  description: string; // 脚本描述
  execution_order: number; // 执行顺序
  dependencies: string; // 依赖的其他模板（JSON格式的数组）
  is_enabled: boolean; // 是否启用
  create_time: Date;
  update_time: Date;
}

// 创建时的可选字段
export interface InitialDataTemplateCreationAttributes
  extends Optional<
    InitialDataTemplateAttributes,
    "template_id" | "create_time" | "update_time"
  > {}

class InitialDataTemplate extends Model<
  InitialDataTemplateAttributes,
  InitialDataTemplateCreationAttributes
> {
  public template_id!: number;
  public template_name!: string;
  public template_version!: string;
  public database_type!: "main" | "log" | "order" | "static";
  public script_content!: string;
  public description!: string;
  public execution_order!: number;
  public dependencies!: string;
  public is_enabled!: boolean;
  public readonly create_time!: Date;
  public readonly update_time!: Date;

  // 静态方法：获取启用的脚本模板
  public static async getEnabledTemplates(
    databaseType?: "main" | "log" | "order" | "static"
  ) {
    const whereClause: any = { is_enabled: true };
    if (databaseType) {
      whereClause.database_type = databaseType;
    }

    return await InitialDataTemplate.findAll({
      where: whereClause,
      order: [["execution_order", "ASC"], ["template_name", "ASC"]],
    });
  }

  // 静态方法：根据名称和版本查找模板
  public static async findByNameAndVersion(
    templateName: string,
    templateVersion: string,
    databaseType: "main" | "log" | "order" | "static"
  ) {
    return await InitialDataTemplate.findOne({
      where: {
        template_name: templateName,
        template_version: templateVersion,
        database_type: databaseType,
      },
    });
  }

  // 实例方法：获取依赖列表
  public getDependencies(): string[] {
    if (!this.dependencies) return [];
    try {
      return JSON.parse(this.dependencies);
    } catch {
      return [];
    }
  }

  // 实例方法：设置依赖列表
  public setDependencies(deps: string[]): void {
    this.dependencies = JSON.stringify(deps);
  }
}

InitialDataTemplate.init(
  {
    template_id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      comment: "初始数据脚本模板的唯一标识ID",
    },
    template_name: {
      type: DataTypes.STRING(200),
      allowNull: false,
      comment: "脚本模板名称",
    },
    template_version: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: "脚本模板版本号",
    },
    database_type: {
      type: DataTypes.ENUM("main", "log", "order", "static"),
      allowNull: false,
      comment: "数据库类型：main-主数据库，log-日志数据库，order-订单数据库，static-静态数据库",
    },
    script_content: {
      type: DataTypes.TEXT("long"),
      allowNull: false,
      comment: "SQL脚本内容",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: "脚本描述说明",
    },
    execution_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 999,
      comment: "执行顺序，数字越小越先执行",
    },
    dependencies: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "依赖的其他模板名称，JSON格式的字符串数组",
    },
    is_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: "是否启用该模板",
    },
    create_time: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: "记录创建时间",
    },
    update_time: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: "记录更新时间",
    },
  },
  {
    sequelize,
    modelName: "InitialDataTemplate",
    tableName: "qc_initial_data_template",
    timestamps: true,
    createdAt: "create_time",
    updatedAt: "update_time",
    comment: "初始数据脚本模板表",
    indexes: [
      {
        name: "idx_template_name_version_db",
        fields: ["template_name", "template_version", "database_type"],
        unique: true,
      },
      {
        name: "idx_database_type_order",
        fields: ["database_type", "execution_order"],
      },
      {
        name: "idx_is_enabled",
        fields: ["is_enabled"],
      },
    ],
  }
);

export default InitialDataTemplate;
