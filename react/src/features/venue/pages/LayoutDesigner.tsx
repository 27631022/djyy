import { useParams } from "react-router-dom";
import { VenueLayoutEditor } from "../components/designer/VenueLayoutEditor";

/** 会场图设计器(独立页)= 编辑器内核 VenueLayoutEditor 的页面壳。
 *  同一内核也被排座向导第 3 步以 embedded 方式内嵌复用。 */
export default function LayoutDesigner() {
  const { layoutId } = useParams<{ layoutId: string }>();
  if (!layoutId) {
    return <div className="h-full flex items-center justify-center text-sm text-[#9CA3AF]">缺少会场图 ID</div>;
  }
  return <VenueLayoutEditor layoutId={layoutId} />;
}
