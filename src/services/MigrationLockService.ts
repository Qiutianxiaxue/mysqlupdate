import { Transaction, Op } from "sequelize";
import sequelize from "@/config/database";
import MigrationLock from "@/models/MigrationLock";
import logger from "@/utils/logger";
import { v4 as uuidv4 } from "uuid";
import os from "os";

export class MigrationLockService {
  private static instance: MigrationLockService;
  private lockHolderInfo: string;

  private constructor() {
    // 生成锁持有者信息：主机名-进程ID-随机UUID
    this.lockHolderInfo = `${os.hostname()}-${process.pid}-${uuidv4().substring(
      0,
      8
    )}`;
  }

  public static getInstance(): MigrationLockService {
    if (!MigrationLockService.instance) {
      MigrationLockService.instance = new MigrationLockService();
    }
    return MigrationLockService.instance;
  }

  /**
   * 获取迁移锁
   * @param lockType 锁类型
   * @param tableName 表名（单表迁移时需要）
   * @param databaseType 数据库类型
   * @param partitionType 分区类型
   * @param operationInfo 操作信息
   * @returns 返回锁信息或null（如果获取失败）
   */
  async acquireLock(
    lockType: "SINGLE_TABLE" | "ALL_TABLES",
    tableName?: string,
    databaseType?: string,
    partitionType?: string,
    operationInfo?: string
  ): Promise<{
    success: boolean;
    lock?: MigrationLock;
    message: string;
    conflictLock?: MigrationLock;
  }> {
    const transaction = await sequelize.transaction();

    try {
      // 检查是否已有活跃的锁
      const conflictCheck = await this.checkConflictingLocks(
        lockType,
        tableName,
        databaseType,
        partitionType,
        transaction
      );

      if (!conflictCheck.canAcquire) {
        await transaction.rollback();
        const result: {
          success: boolean;
          lock?: MigrationLock;
          message: string;
          conflictLock?: MigrationLock;
        } = {
          success: false,
          message: conflictCheck.message,
        };
        if (conflictCheck.conflictLock) {
          result.conflictLock = conflictCheck.conflictLock;
        }
        return result;
      }

      // 生成锁键
      const lockKey = this.generateLockKey(
        lockType,
        tableName,
        databaseType,
        partitionType
      );

      // 创建锁
      const lockData: any = {
        lock_key: lockKey,
        lock_type: lockType,
        start_time: new Date(),
        lock_holder: this.lockHolderInfo,
        is_active: true,
      };

      if (tableName) lockData.table_name = tableName;
      if (databaseType) lockData.database_type = databaseType;
      if (partitionType) lockData.partition_type = partitionType;
      if (operationInfo) lockData.operation_info = operationInfo;

      const lock = await MigrationLock.create(lockData, { transaction });

      await transaction.commit();

      return {
        success: true,
        lock,
        message: "成功获取迁移锁",
      };
    } catch (error) {
      await transaction.rollback();
      logger.error("获取迁移锁失败:", error);

      return {
        success: false,
        message: `获取迁移锁失败: ${
          error instanceof Error ? error.message : "未知错误"
        }`,
      };
    }
  }

  /**
   * 释放迁移锁
   * @param lockKey 锁键
   * @returns 是否成功释放
   */
  async releaseLock(lockKey: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const lock = await MigrationLock.findOne({
        where: {
          lock_key: lockKey,
          is_active: true,
        },
      });

      if (!lock) {
        return {
          success: false,
          message: `锁不存在或已被释放: ${lockKey}`,
        };
      }

      // 检查锁持有者
      if (lock.lock_holder !== this.lockHolderInfo) {
        return {
          success: false,
          message: `无法释放他人持有的锁: ${lockKey}`,
        };
      }

      // 释放锁
      await lock.update({ is_active: false, update_time: new Date() });

      return {
        success: true,
        message: "成功释放迁移锁",
      };
    } catch (error) {
      logger.error("释放迁移锁失败:", error);
      return {
        success: false,
        message: `释放迁移锁失败: ${
          error instanceof Error ? error.message : "未知错误"
        }`,
      };
    }
  }

  /**
   * 强制释放锁（用于清理僵尸锁）
   * @param lockKey 锁键
   * @returns 是否成功释放
   */
  async forceReleaseLock(lockKey: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const result = await MigrationLock.update(
        { is_active: false },
        {
          where: {
            lock_key: lockKey,
            is_active: true,
          },
        }
      );

      if (result[0] === 0) {
        return {
          success: false,
          message: `锁不存在或已被释放: ${lockKey}`,
        };
      }

      return {
        success: true,
        message: "成功强制释放迁移锁",
      };
    } catch (error) {
      logger.error("强制释放迁移锁失败:", error);
      return {
        success: false,
        message: `强制释放迁移锁失败: ${
          error instanceof Error ? error.message : "未知错误"
        }`,
      };
    }
  }

  /**
   * 检查冲突的锁
   */
  private async checkConflictingLocks(
    lockType: "SINGLE_TABLE" | "ALL_TABLES",
    tableName?: string,
    databaseType?: string,
    partitionType?: string,
    transaction?: Transaction
  ): Promise<{
    canAcquire: boolean;
    message: string;
    conflictLock?: MigrationLock;
  }> {
    const findOptions: any = {
      where: { is_active: true },
    };
    if (transaction) {
      findOptions.transaction = transaction;
    }
    const activeLocks = await MigrationLock.findAll(findOptions);

    if (activeLocks.length === 0) {
      return {
        canAcquire: true,
        message: "没有冲突的锁",
      };
    }

    // 检查是否有全量迁移锁
    const allTablesLock = activeLocks.find(
      (lock) => lock.lock_type === "ALL_TABLES"
    );
    if (allTablesLock) {
      return {
        canAcquire: false,
        message: `存在全量迁移锁，无法执行${
          lockType === "ALL_TABLES" ? "全量迁移" : "单表迁移"
        }`,
        conflictLock: allTablesLock,
      };
    }

    // 如果是全量迁移，检查是否有任何活跃的锁
    if (lockType === "ALL_TABLES") {
      const conflictLock = activeLocks[0];
      const result: {
        canAcquire: boolean;
        message: string;
        conflictLock?: MigrationLock;
      } = {
        canAcquire: false,
        message: `存在活跃的迁移任务，无法执行全量迁移`,
      };
      if (conflictLock) {
        result.conflictLock = conflictLock;
      }
      return result;
    }

    // 如果是单表迁移，检查是否有相同表的锁
    if (
      lockType === "SINGLE_TABLE" &&
      tableName &&
      databaseType &&
      partitionType
    ) {
      const conflictLock = activeLocks.find(
        (lock) =>
          lock.lock_type === "SINGLE_TABLE" &&
          lock.table_name === tableName &&
          lock.database_type === databaseType &&
          lock.partition_type === partitionType
      );

      if (conflictLock) {
        return {
          canAcquire: false,
          message: `表 ${tableName}(${databaseType}, ${partitionType}) 正在迁移中`,
          conflictLock: conflictLock,
        };
      }
    }

    return {
      canAcquire: true,
      message: "没有冲突的锁",
    };
  }

  /**
   * 生成锁键
   */
  private generateLockKey(
    lockType: "SINGLE_TABLE" | "ALL_TABLES",
    tableName?: string,
    databaseType?: string,
    partitionType?: string
  ): string {
    if (lockType === "ALL_TABLES") {
      return `ALL_TABLES_${Date.now()}`;
    } else {
      return `${tableName}_${databaseType}_${partitionType}_${Date.now()}`;
    }
  }

  /**
   * 获取活跃的锁列表
   */
  async getActiveLocks(): Promise<MigrationLock[]> {
    try {
      return await MigrationLock.findAll({
        where: { is_active: true },
        order: [["start_time", "ASC"]],
      });
    } catch (error) {
      logger.error("获取活跃锁列表失败:", error);
      return [];
    }
  }

  /**
   * 清理过期的锁（超过指定时间的锁）
   * @param hoursOld 超过多少小时的锁视为过期，默认24小时
   */
  async cleanupExpiredLocks(hoursOld: number = 24): Promise<{
    success: boolean;
    message: string;
    cleanedCount: number;
  }> {
    try {
      const expiredTime = new Date();
      expiredTime.setHours(expiredTime.getHours() - hoursOld);

      const result = await MigrationLock.update(
        { is_active: false },
        {
          where: {
            is_active: true,
            start_time: { [Op.lt]: expiredTime },
          },
        }
      );

      const cleanedCount = result[0];

      return {
        success: true,
        message: `成功清理 ${cleanedCount} 个过期的迁移锁`,
        cleanedCount,
      };
    } catch (error) {
      logger.error("清理过期锁失败:", error);
      return {
        success: false,
        message: `清理过期锁失败: ${
          error instanceof Error ? error.message : "未知错误"
        }`,
        cleanedCount: 0,
      };
    }
  }

  /**
   * 清理所有锁（服务启动时使用）
   * 服务重启后，之前的锁都应该被清理掉
   */
  async cleanupAllLocks(): Promise<{
    success: boolean;
    message: string;
    cleanedCount: number;
  }> {
    try {
      const result = await MigrationLock.update(
        { is_active: false },
        {
          where: {
            is_active: true,
          },
        }
      );

      const cleanedCount = result[0];

      return {
        success: true,
        message: `成功清理 ${cleanedCount} 个活跃的迁移锁`,
        cleanedCount,
      };
    } catch (error) {
      logger.error("清理所有锁失败:", error);
      return {
        success: false,
        message: `清理所有锁失败: ${
          error instanceof Error ? error.message : "未知错误"
        }`,
        cleanedCount: 0,
      };
    }
  }
}

export default MigrationLockService;
