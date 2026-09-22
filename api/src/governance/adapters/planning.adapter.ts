import { Injectable } from "@nestjs/common";
import { isTaskLate, type TaskStatus } from "@amber/shared";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Read-only Task / Milestone adapter for Gate evaluation.
 * Must never create, update, or delete Planning rows.
 */
@Injectable()
export class PlanningGovernanceAdapter {
  constructor(private readonly prisma: PrismaService) {}

  async findTask(organizationId: string, projectId: string, taskId: string) {
    return this.prisma.task.findFirst({
      where: { id: taskId, organizationId, projectId },
    });
  }

  async findMilestone(organizationId: string, projectId: string, milestoneId: string) {
    const milestone = await this.prisma.milestone.findFirst({
      where: { id: milestoneId, organizationId, projectId },
    });
    if (!milestone) {
      return null;
    }
    const tasks = await this.prisma.task.findMany({
      where: { milestoneId: milestone.id, organizationId, projectId },
      select: { dueDate: true, status: true },
    });
    return {
      ...milestone,
      linkedTasksLate: tasks.some((task) =>
        isTaskLate({ dueDate: task.dueDate, status: task.status as TaskStatus }),
      ),
    };
  }
}
