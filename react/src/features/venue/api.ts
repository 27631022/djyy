import { api } from "@/shared/api/client";
import type { VenueLayoutSpec } from "./lib/venueAutoLayout";
import type { ZoneElement } from "./lib/venueTypes";

/* ─── 后端 venue 表镜像 ─── */

export interface MeetingRoomDto {
  id: string;
  name: string;
  location: string | null;
  capacity: number;
  description: string | null;
  photoFileIds: string[];
  facilities: string[];
  orgId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingRoomListItem extends MeetingRoomDto {
  layoutCount: number;
}

export interface VenueLayoutListItem {
  id: string;
  roomId: string;
  name: string;
  thumbnail: string | null;
  width: number;
  height: number;
  gridSize: number;
  seatCount: number;
  active: boolean;
  /** draft 草稿(排座不可选) | published 已发布 */
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingRoomDetail extends MeetingRoomDto {
  layouts: VenueLayoutListItem[];
}

/** 会场图详情(含 layoutJson;前端 JSON.parse 成 VenueDesignerState) */
export interface VenueLayoutDetail extends VenueLayoutListItem {
  layoutJson: string;
}

export interface CreateRoomInput {
  name: string;
  location?: string;
  capacity?: number;
  description?: string;
  photoFileIds?: string[];
  facilities?: string[];
  orgId?: string;
  active?: boolean;
}
export type UpdateRoomInput = Partial<CreateRoomInput>;

export interface CreateLayoutInput {
  roomId: string;
  name: string;
  layoutJson?: string;
  width?: number;
  height?: number;
  gridSize?: number;
}

export interface UpdateLayoutInput {
  name?: string;
  layoutJson?: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  gridSize?: number;
  seatCount?: number;
  active?: boolean;
  /** draft | published;发布按钮用 */
  status?: string;
}

export const roomApi = {
  list: (active?: boolean) =>
    api
      .get<MeetingRoomListItem[]>("/venue/rooms", {
        params: active === undefined ? undefined : { active },
      })
      .then((r) => r.data),
  get: (id: string) => api.get<MeetingRoomDetail>(`/venue/rooms/${id}`).then((r) => r.data),
  create: (input: CreateRoomInput) => api.post<MeetingRoomDto>("/venue/rooms", input).then((r) => r.data),
  update: (id: string, input: UpdateRoomInput) =>
    api.patch<MeetingRoomDetail>(`/venue/rooms/${id}`, input).then((r) => r.data),
  remove: (id: string) =>
    api.delete<{ id: string; deleted: boolean }>(`/venue/rooms/${id}`).then((r) => r.data),
};

export const layoutApi = {
  list: (roomId?: string, status?: string) =>
    api
      .get<VenueLayoutListItem[]>("/venue/layouts", {
        params: { ...(roomId ? { roomId } : {}), ...(status ? { status } : {}) },
      })
      .then((r) => r.data),
  get: (id: string) => api.get<VenueLayoutDetail>(`/venue/layouts/${id}`).then((r) => r.data),
  create: (input: CreateLayoutInput) =>
    api.post<VenueLayoutDetail>("/venue/layouts", input).then((r) => r.data),
  update: (id: string, input: UpdateLayoutInput) =>
    api.patch<VenueLayoutDetail>(`/venue/layouts/${id}`, input).then((r) => r.data),
  /** 另存为新图(复制成草稿,原图不动) */
  duplicate: (id: string) =>
    api.post<VenueLayoutDetail>(`/venue/layouts/${id}/duplicate`, {}).then((r) => r.data),
  remove: (id: string) =>
    api.delete<{ id: string; deleted: boolean }>(`/venue/layouts/${id}`).then((r) => r.data),
};

/** 会场 AI(智能生成布局的「AI 帮填」):一段描述 → 排式布局参数 */
export const venueAiApi = {
  extractLayout: (description: string) =>
    api.post<VenueLayoutSpec>("/venue/ai/extract-layout", { description }).then((r) => r.data),
  extractRoster: (text: string) =>
    api.post<{ roster: Attendee[]; count: number }>("/venue/ai/extract-roster", { text }).then((r) => r.data),
};

/* ─── 选座方案(排座) ─── */

/** 与会人(导入名单一行) */
export interface Attendee {
  id: string;
  name: string;
  empNo?: string;
  unit?: string;
  position?: string;
  score?: number;
  group?: string;
  /** 特殊身份(来宾/记者/列席/工作人员…,字典 venue_special_type);非空=不参与自动排座、待手动指定座 */
  special?: string;
  fixed?: boolean;
}

export interface SeatingPlanListItem {
  id: string;
  name: string;
  layoutId: string;
  layoutName: string;
  roomId: string;
  roomName: string;
  eventDate: string | null;
  status: string;
  attendeeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlanAssignment {
  seatId: string;
  attendeeId: string | null;
  attendeeName: string | null;
  unit: string | null;
  position: string | null;
  /** auto 自动排 | manual 手动放 | locked 锁定(钉死,重排不动);回存/读取锁定状态用 */
  source?: string;
}

export interface SeatingPlanDetail {
  id: string;
  name: string;
  layoutId: string;
  layoutName: string;
  roomId: string;
  roomName: string;
  eventDate: string | null;
  status: string;
  roster: Attendee[];
  /** 会议信息(起止时间 + 备注 + 参会人数);存在 rulesJson.meeting */
  meeting: { startAt?: string; endAt?: string; note?: string; headcount?: number };
  groupZoneMap: Record<string, string>;
  /** 方案专属区域(向导画框圈定,不入共享座次图);computeSeating 的 zonesOverride */
  zones: ZoneElement[];
  /** 预留座位 id(记者站位/设备位);方案专属,自动排座跳过 */
  reservedSeatIds: string[];
  /** 手动指定的中心参照点(尊位基准);null = 自动(主席台/会议桌/最前排) */
  anchor: { x: number; y: number } | null;
  assignments: PlanAssignment[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSeatingPlanInput {
  layoutId: string;
  name: string;
  eventDate?: string;
}

export interface UpdateSeatingPlanInput {
  /** 更换会场图:换图后后端清空分区映射 + 排座结果并回到草稿(名单保留) */
  layoutId?: string;
  name?: string;
  eventDate?: string;
  status?: string;
  roster?: Attendee[];
  groupZoneMap?: Record<string, string>;
  /** 方案专属区域(ZoneElement[]);存进 rulesJson.zones */
  zones?: ZoneElement[];
  /** 预留座位 id 列表;存进 rulesJson.reservedSeatIds,自动排座跳过 */
  reservedSeatIds?: string[];
  /** 会议信息(起止时间 + 备注 + 参会人数) */
  meeting?: { startAt?: string; endAt?: string; note?: string; headcount?: number };
  /** 中心参照点;{x,y}=手动指定,null=恢复自动。存进 rulesJson.anchor */
  anchor?: { x: number; y: number } | null;
}

export const seatingApi = {
  list: (layoutId?: string) =>
    api
      .get<SeatingPlanListItem[]>("/venue/seating-plans", { params: layoutId ? { layoutId } : undefined })
      .then((r) => r.data),
  get: (id: string) => api.get<SeatingPlanDetail>(`/venue/seating-plans/${id}`).then((r) => r.data),
  create: (input: CreateSeatingPlanInput) =>
    api.post<SeatingPlanDetail>("/venue/seating-plans", input).then((r) => r.data),
  update: (id: string, input: UpdateSeatingPlanInput) =>
    api.patch<SeatingPlanDetail>(`/venue/seating-plans/${id}`, input).then((r) => r.data),
  remove: (id: string) =>
    api.delete<{ id: string; deleted: boolean }>(`/venue/seating-plans/${id}`).then((r) => r.data),
  importRoster: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api
      .post<{ roster: Attendee[]; count: number }>(`/venue/seating-plans/${id}/import-roster`, fd)
      .then((r) => r.data);
  },
  saveAssignments: (id: string, assignments: PlanAssignment[]) =>
    api.post<SeatingPlanDetail>(`/venue/seating-plans/${id}/save-assignments`, { assignments }).then((r) => r.data),
  /** 导出 Excel(座位安排表 / 签到表):axios 取 blob,前端 createObjectURL 下载(HTTP 局域网不触发 insecure 警告) */
  exportXlsx: (id: string, type: "arrangement" | "signin") =>
    api
      .get(`/venue/seating-plans/${id}/export`, { params: { type }, responseType: "blob" })
      .then((r) => r.data as Blob),
};
