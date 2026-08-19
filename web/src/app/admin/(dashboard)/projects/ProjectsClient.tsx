"use client";

import { useState, useMemo, useRef } from "react";
import { api, AdminProject } from "@/lib/api";
import { Plus, GripVertical, CheckCircle2, AlertTriangle, Clock, Activity, Edit, ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import ProjectModal from "./ProjectModal";

export default function ProjectsClient({ initialProjects }: { initialProjects: AdminProject[] }) {
  const [projects, setProjects] = useState<AdminProject[]>(initialProjects);
  const [isLoading, setIsLoading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<AdminProject | null>(null);

  // Financial calculations
  const ledgers = useMemo(() => {
    const summary: Record<string, { value: number; cost: number; profit: number; hours: number }> = {};
    
    projects.forEach((p) => {
      const c = p.finance_currency || "GHS";
      if (!summary[c]) summary[c] = { value: 0, cost: 0, profit: 0, hours: 0 };
      summary[c].value += (p.contract_value || 0);
      summary[c].cost += (p.actual_cost || 0);
      summary[c].profit += ((p.contract_value || 0) - (p.actual_cost || 0));
      summary[c].hours += (p.hours_worked || 0);
    });
    
    return summary;
  }, [projects]);

  // Metrics calculations
  const metrics = useMemo(() => {
    let onTrack = 0;
    let needsAttention = 0;
    let atRisk = 0;
    let dueThisMonth = 0;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    projects.forEach((p) => {
      if (p.delivery_status === "on_track") onTrack++;
      else if (p.delivery_status === "needs_attention") needsAttention++;
      else if (p.delivery_status === "at_risk") atRisk++;

      if (p.deadline) {
        const d = new Date(p.deadline);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          dueThisMonth++;
        }
      }
    });

    return { onTrack, needsAttention, atRisk, dueThisMonth };
  }, [projects]);

  // Format currency
  const formatAmount = (amount: number, currency: string) => {
    return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  // HTML5 Drag and Drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    if (draggedIndex === null || draggedIndex === index) return;
    
    const newProjects = [...projects];
    const draggedItem = newProjects[draggedIndex];
    newProjects.splice(draggedIndex, 1);
    newProjects.splice(index, 0, draggedItem);
    
    setDraggedIndex(index);
    setProjects(newProjects);
  };

  const handleDragEnd = async () => {
    setDraggedIndex(null);
    const ids = projects.map(p => p.id);
    try {
      await api.adminReorderProjects(ids);
    } catch (err) {
      console.error("Failed to reorder projects:", err);
    }
  };

  const deleteProject = async (id: number) => {
    if (!confirm("Are you sure you want to delete this project?")) return;
    try {
      await api.adminDeleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveProject = async (data: Partial<AdminProject>) => {
    if (editingProject) {
      await api.adminUpdateProject(editingProject.id, data);
      setProjects(prev => prev.map(p => p.id === editingProject.id ? { ...p, ...data } as AdminProject : p));
    } else {
      const res = await api.adminCreateProject(data);
      // Wait, we need the new project from the API if it returns it. The backend probably returns the ID or something. Let's just refetch to keep it simple, or assume we get back the ID.
      // But let's just refresh the page for now to be safe with all fields and ledgers updating, since it's an admin dashboard.
      window.location.reload();
    }
  };

  const openNewModal = () => {
    setEditingProject(null);
    setIsModalOpen(true);
  };

  const openEditModal = (p: AdminProject) => {
    setEditingProject(p);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <div className="text-sm font-medium text-text-3 uppercase tracking-wider mb-1">Portfolio case studies</div>
          <h2 className="text-3xl font-bold tracking-tight mb-1">Projects</h2>
          <p className="text-text-2">Manage your portfolio case studies.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={openNewModal}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 bg-text text-bg hover:bg-text/90 shadow-sm h-9 px-4 py-2 gap-2"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>
      </div>

      {Object.entries(ledgers).map(([currency, data]) => (
        <section key={currency} className="bg-bg-2 p-5 rounded-xl border border-hairline">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-hairline">
            <h3 className="font-semibold">Portfolio ledger ({currency})</h3>
            <small className="text-text-3">Private admin figures</small>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-text-2 mb-1">Project value</div>
              <div className="font-mono font-medium text-lg">{formatAmount(data.value, currency)}</div>
            </div>
            <div>
              <div className="text-sm text-text-2 mb-1">Actual cost</div>
              <div className="font-mono font-medium text-lg">{formatAmount(data.cost, currency)}</div>
            </div>
            <div>
              <div className="text-sm text-text-2 mb-1">Profit</div>
              <div className="font-mono font-medium text-lg text-green-500">{formatAmount(data.profit, currency)}</div>
            </div>
            <div>
              <div className="text-sm text-text-2 mb-1">Hours logged</div>
              <div className="font-mono font-medium text-lg">{data.hours}</div>
            </div>
          </div>
        </section>
      ))}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-bg-2 p-5 rounded-xl border border-hairline">
          <h3 className="text-sm font-medium text-text-2 mb-2 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500"/> On track</h3>
          <div className="text-3xl font-bold">{metrics.onTrack}</div>
        </div>
        <div className="bg-bg-2 p-5 rounded-xl border border-hairline">
          <h3 className="text-sm font-medium text-text-2 mb-2 flex items-center gap-2"><Activity className="w-4 h-4 text-yellow-500"/> Needs attention</h3>
          <div className="text-3xl font-bold">{metrics.needsAttention}</div>
        </div>
        <div className="bg-bg-2 p-5 rounded-xl border border-hairline">
          <h3 className="text-sm font-medium text-text-2 mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500"/> At risk</h3>
          <div className="text-3xl font-bold">{metrics.atRisk}</div>
        </div>
        <div className="bg-bg-2 p-5 rounded-xl border border-hairline">
          <h3 className="text-sm font-medium text-text-2 mb-2 flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500"/> Due this month</h3>
          <div className="text-3xl font-bold">{metrics.dueThisMonth}</div>
        </div>
      </div>

      <div className="rounded-xl border border-hairline bg-bg overflow-hidden">
        <div className="p-4 border-b border-hairline bg-bg-2">
          <h2 className="font-semibold mb-1">All projects</h2>
          <p className="text-sm text-text-3">Drag rows by the handle to reorder — this controls the order projects appear on the public site.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-bg-2/50 text-text-2 text-xs uppercase border-b border-hairline">
              <tr>
                <th className="px-3 py-3 w-10"></th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Progress</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-text-3">
                    No projects found.
                  </td>
                </tr>
              ) : (
                projects.map((project, index) => (
                  <tr
                    key={project.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragEnter={(e) => handleDragEnter(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                    className={`hover:bg-bg-2/50 transition-colors ${draggedIndex === index ? 'opacity-50' : ''}`}
                  >
                    <td className="px-3 py-4 text-text-3 cursor-grab active:cursor-grabbing text-center">
                      <GripVertical className="w-4 h-4 inline-block" />
                    </td>
                    <td className="px-4 py-4 font-medium text-text">
                      <div className="flex items-center gap-2">
                        {project.title}
                        {!project.is_published && <span className="px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 text-[10px] uppercase font-bold tracking-wider">Draft</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-text-2">
                      {project.linked_client_name || project.client_name || "—"}
                    </td>
                    <td className="px-4 py-4 text-text-2 capitalize">
                      {project.category}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium capitalize ${
                        project.delivery_status === 'on_track' ? 'bg-green-500/10 text-green-500' :
                        project.delivery_status === 'needs_attention' ? 'bg-yellow-500/10 text-yellow-500' :
                        'bg-red-500/10 text-red-500'
                      }`}>
                        {project.delivery_status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-bg-3 rounded-full h-2 max-w-[100px]">
                          <div className="bg-accent h-2 rounded-full" style={{ width: `${project.progress_percent}%` }}></div>
                        </div>
                        <span className="text-xs text-text-3">{project.progress_percent}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {project.is_published && (
                          <Link
                            href={`/projects/${project.slug}`}
                            target="_blank"
                            className="p-1.5 text-text-3 hover:text-text rounded hover:bg-bg-3 transition-colors"
                            title="View Public Page"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                        )}
                        <button
                          onClick={() => openEditModal(project)}
                          className="p-1.5 text-text-3 hover:text-accent rounded hover:bg-bg-3 transition-colors"
                          title="Edit Project"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteProject(project.id)}
                          className="p-1.5 text-text-3 hover:text-red-500 rounded hover:bg-bg-3 transition-colors"
                          title="Delete Project"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ProjectModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        project={editingProject}
        onSave={handleSaveProject}
      />
    </div>
  );
}
