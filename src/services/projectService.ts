/**
 * Project Service - Centralized API layer for SCARO ERP Projects
 * 
 * Migrated in Phase 3A-4 to Node.js/Express + MariaDB REST APIs.
 */

import { projectApi } from './api/projectApi';
import type { SafeProjectDto, ProjectMemberDto } from './api/projectApi';
import { taskApi } from './api/taskApi';
import { userApi } from './api/userApi';
import type { Project, ProjectMember, CreateProjectPayload, UpdateProjectPayload } from '../types/project';

function mapSafeProjectToProject(p: SafeProjectDto, taskMetrics?: { total: number; completed: number; overdue: number; progress: number }): Project {
  const totalCount = taskMetrics ? taskMetrics.total : p.task_count;
  const completedCount = taskMetrics ? taskMetrics.completed : 0;
  const overdueCount = taskMetrics ? taskMetrics.overdue : 0;
  const progress = taskMetrics ? taskMetrics.progress : (totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0);

  return {
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    start_date: p.start_date,
    end_date: p.end_date,
    owner_id: p.owner?.id || null,
    created_by: p.creator?.id || '',
    created_at: p.created_at,
    updated_at: p.updated_at,
    owner: p.owner ? {
      full_name: p.owner.full_name || '',
      email: p.owner.email || undefined,
    } : null,
    member_count: p.member_count || 0,
    total_tasks_count: totalCount,
    completed_tasks_count: completedCount,
    overdue_tasks_count: overdueCount,
    progress: progress,
  };
}

export async function fetchProjects(statusFilter?: string): Promise<Project[]> {
  const projectsData = await projectApi.getProjects({
    status: statusFilter && statusFilter !== 'All' ? statusFilter : undefined,
  });

  if (!projectsData || projectsData.length === 0) {
    return [];
  }

  // Fetch tasks to compute derived progress and metrics
  let allTasks: any[] = [];
  try {
    allTasks = await taskApi.getTasks({ limit: 100 });
  } catch (err) {
    console.warn('Could not fetch task metrics for projects:', err);
  }

  const todayStr = new Date().toISOString().split('T')[0];

  return projectsData.map((p) => {
    const projTasks = allTasks.filter((t: any) => t.project_id === p.id);
    const nonCancelledTasks = projTasks.filter((t: any) => t.status !== 'Cancelled');
    const totalCount = nonCancelledTasks.length || p.task_count || 0;
    const completedCount = nonCancelledTasks.filter((t: any) => t.status === 'Completed').length;
    
    const overdueCount = nonCancelledTasks.filter((t: any) => {
      return t.due_date && t.due_date < todayStr && t.status !== 'Completed';
    }).length;

    const derivedProgress = totalCount > 0 
      ? Math.round((completedCount / totalCount) * 100) 
      : 0;

    return mapSafeProjectToProject(p, {
      total: totalCount,
      completed: completedCount,
      overdue: overdueCount,
      progress: derivedProgress,
    });
  });
}

export async function fetchProjectById(id: string): Promise<Project | null> {
  const data = await projectApi.getProjectById(id);
  if (!data) return null;
  return mapSafeProjectToProject(data);
}

export async function fetchProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const membersData = await projectApi.getMembers(projectId);
  return (membersData || []).map((m: ProjectMemberDto) => ({
    project_id: m.project_id,
    user_id: m.user_id,
    created_at: m.created_at,
    user: {
      id: m.user_id,
      full_name: m.full_name,
      email: m.email,
      avatar_url: m.avatar_url,
      employment_status: m.role || 'Employee',
    },
  }));
}

export async function createProject(payload: CreateProjectPayload): Promise<Project> {
  const data = await projectApi.createProject({
    name: payload.name.trim(),
    description: payload.description?.trim() || null,
    status: payload.status || 'Active',
    start_date: payload.start_date || null,
    end_date: payload.end_date || null,
    owner_id: payload.owner_id || null,
  });

  return mapSafeProjectToProject(data);
}

export async function updateProject(id: string, payload: UpdateProjectPayload): Promise<Project> {
  const updates: Record<string, any> = {};
  if (payload.name !== undefined) updates.name = payload.name.trim();
  if (payload.description !== undefined) updates.description = payload.description?.trim() || null;
  if (payload.status !== undefined) updates.status = payload.status;
  if (payload.start_date !== undefined) updates.start_date = payload.start_date || null;
  if (payload.end_date !== undefined) updates.end_date = payload.end_date || null;
  if (payload.owner_id !== undefined) updates.owner_id = payload.owner_id || null;

  const data = await projectApi.updateProject(id, updates);
  return mapSafeProjectToProject(data);
}

export async function addProjectMember(projectId: string, userId: string): Promise<void> {
  await projectApi.addMember(projectId, userId);
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  await projectApi.removeMember(projectId, userId);
}

export async function fetchCandidateProfiles(): Promise<Array<{ id: string; full_name: string; email: string; employment_status: string }>> {
  const users = await userApi.getUsers();
  return users.map((u) => ({
    id: u.id,
    full_name: u.full_name || u.email.split('@')[0],
    email: u.email,
    employment_status: u.employment_status || 'Active',
  }));
}

export async function fetchProjectActivity(projectId: string) {
  let projectTasks: any[] = [];
  try {
    const rawTasks = await taskApi.getTasks({ project_id: projectId, limit: 10 });
    projectTasks = rawTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      progress: t.progress,
      assignee: t.assignee ? { full_name: t.assignee.full_name } : null,
    }));
  } catch (err) {
    console.warn('Could not fetch project activity tasks:', err);
  }

  return {
    tasks: projectTasks,
    recentReportActivity: [],
  };
}
