import type { ElementType } from "react";
import {
  TypeIcon,
  AlignLeftIcon,
  HashIcon,
  CalendarIcon,
  ListIcon,
  PaperclipIcon,
  ImageIcon,
  FileTextIcon,
  Link2Icon,
} from "lucide-react";
import type { TaskFieldType } from "../api";

/** 字段类型 → lucide 图标(编辑器 / 预览共用)。独立非组件模块,避免 react-refresh 警告。 */
export const FIELD_TYPE_ICONS: Record<TaskFieldType, ElementType> = {
  text: TypeIcon,
  textarea: AlignLeftIcon,
  number: HashIcon,
  date: CalendarIcon,
  select: ListIcon,
  file: PaperclipIcon,
  image: ImageIcon,
  richtext: FileTextIcon,
  doclink: Link2Icon,
};
