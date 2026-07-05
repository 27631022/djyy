-- 首次初始化 pgdata 卷时自动执行(docker-entrypoint-initdb.d):
-- 给统一登录(Casdoor)建独立数据库,与业务库 djyy 隔离。
-- 已初始化过的老库不会执行本脚本,手动补:docker exec djyy-db createdb -U djyy casdoor
CREATE DATABASE casdoor;
