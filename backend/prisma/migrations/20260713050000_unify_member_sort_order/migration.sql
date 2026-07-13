-- 统一成员排序:删除 directorySort,通讯录/组织/门户共用 UserOrganization.sortOrder。
-- 被删列此前全为默认 0(通讯录管理刚上线,未沉淀真实排序数据),丢弃无损。
ALTER TABLE "UserOrganization" DROP COLUMN "directorySort";
