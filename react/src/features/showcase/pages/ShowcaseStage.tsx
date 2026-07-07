import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { StagePanel } from "../components/StagePanel";

/** 晒台详情直链页(/showcase/stages/:id):薄壳,内容全在 StagePanel(与门户中栏共用)。 */
export default function ShowcaseStage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF7F2] via-[#FDFCFA] to-white">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => navigate(`/showcase${id ? `?stage=${id}` : ""}`)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)]"
          >
            <ChevronLeft className="h-4 w-4" /> 先锋晒场
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 pb-16">
        <StagePanel stageId={id} />
      </div>
    </div>
  );
}
