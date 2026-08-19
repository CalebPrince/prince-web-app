"use client";

import { useState } from "react";
import { api, AdminContentIdea } from "@/lib/api";
import { Sparkles, X, FileText, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ContentIdeasClient({ initialIdeas }: { initialIdeas: AdminContentIdea[] }) {
  const [ideas, setIdeas] = useState<AdminContentIdea[]>(initialIdeas);
  const [isGenerating, setIsGenerating] = useState(false);
  const router = useRouter();

  const handleGenerate = async () => {
    if (!confirm("This will replace your current 30-day plan. Are you sure?")) return;
    setIsGenerating(true);
    try {
      await api.adminGenerateContentIdeas();
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to generate plan.");
      setIsGenerating(false);
    }
  };

  const handleUpdateStatus = async (id: number, status: 'idea' | 'used' | 'dismissed') => {
    try {
      await api.adminUpdateContentIdeaStatus(id, status);
      setIdeas(prev => prev.map(i => i.id === id ? { ...i, status } : i));
    } catch (err) {
      console.error(err);
      alert("Failed to update status.");
    }
  };

  const handleTurnIntoDraft = async (id: number) => {
    try {
      await api.adminCreateDraftFromIdea(id);
      // Update status locally to 'used'
      setIdeas(prev => prev.map(i => i.id === id ? { ...i, status: 'used' } : i));
      // Redirect to social drafts to see the new draft
      router.push("/admin/social-drafts");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to create draft.");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <div className="text-sm font-medium text-text-3 uppercase tracking-wider mb-1">30-day plan</div>
          <h2 className="text-3xl font-bold tracking-tight mb-1">Content Ideas</h2>
          <p className="text-text-2">
            LinkedIn ideas grounded in your tracked pages' real posts when available; YouTube ideas are AI-brainstormed from your service positioning.
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 bg-text text-bg hover:bg-text/90 shadow-sm h-9 px-4 py-2 gap-2"
          >
            <Sparkles className="w-4 h-4" />
            {isGenerating ? "Generating plan..." : "Generate 30-day plan"}
          </button>
        </div>
      </div>

      {isGenerating && (
        <div className="rounded-xl border border-hairline bg-bg-2 p-6 flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-accent border-t-transparent"></div>
          <span className="text-text-2">Generating 30 days of ideas — this can take up to a minute...</span>
        </div>
      )}

      {!isGenerating && ideas.length === 0 && (
        <div className="text-center py-12 rounded-xl border border-hairline bg-bg-2">
          <Sparkles className="w-8 h-8 text-text-3 mx-auto mb-3" />
          <h3 className="text-lg font-semibold">No content ideas yet</h3>
          <p className="text-text-3 mt-1">Click "Generate 30-day plan" to create one.</p>
        </div>
      )}

      {!isGenerating && ideas.length > 0 && (
        <div className="space-y-4">
          {ideas.map((idea) => {
            const isUsed = idea.status === 'used';
            const isDismissed = idea.status === 'dismissed';
            
            // Calculate week based on day_number
            const weekNumber = Math.ceil(idea.day_number / 7);
            const isFirstDayOfWeek = idea.day_number % 7 === 1;

            return (
              <div key={idea.id} className="space-y-4">
                {isFirstDayOfWeek && (
                  <h3 className="text-xs font-bold text-text-3 uppercase tracking-widest mt-8 mb-2">Week {weekNumber}</h3>
                )}
                
                <div 
                  className={`flex flex-col md:flex-row items-start gap-4 p-4 rounded-xl border border-hairline bg-bg transition-opacity ${
                    isUsed ? 'opacity-55' : isDismissed ? 'opacity-40' : ''
                  }`}
                >
                  <div className="flex-none w-12 text-center shrink-0">
                    <div className="text-xl font-extrabold text-text-3">{idea.day_number}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-text-3 mt-1">Day</div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                        idea.platform === 'linkedin' ? 'bg-[#0a66c2]/10 text-[#0a66c2]' : 'bg-[#c4302b]/10 text-[#c4302b]'
                      }`}>
                        {idea.platform}
                      </span>
                      {idea.grounded && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                          <CheckCircle2 className="w-3 h-3" /> Grounded
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-text mb-1">{idea.title}</h4>
                    <p className="text-sm text-text-2 mb-3">{idea.description}</p>
                    
                    <div className="flex items-center gap-2">
                      {idea.status === 'idea' && idea.platform === 'linkedin' && (
                        <button 
                          onClick={() => handleTurnIntoDraft(idea.id)}
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent bg-bg-3 hover:bg-bg-3/80 text-text h-7 px-3 gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Turn into draft
                        </button>
                      )}
                      
                      {idea.status === 'idea' && (
                        <button 
                          onClick={() => handleUpdateStatus(idea.id, 'dismissed')}
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent hover:bg-red-500/10 text-text-3 hover:text-red-500 h-7 px-3 gap-1.5"
                        >
                          <X className="w-3.5 h-3.5" />
                          Dismiss
                        </button>
                      )}

                      {idea.status !== 'idea' && (
                        <span className="text-xs font-medium text-text-3 uppercase tracking-wider">
                          {idea.status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
