"use client";

import {
  approveCourseReviewRequestApi,
  rejectCourseReviewRequestApi,
} from "@/lib/review-api";
import { MonitoringPanel } from "@/components/admin/monitoring-panel";

export function CourseMonitoringPanel() {
  return (
    <MonitoringPanel
      apiBase="/api/course-monitoring"
      approveReview={approveCourseReviewRequestApi}
      rejectReview={rejectCourseReviewRequestApi}
    />
  );
}
