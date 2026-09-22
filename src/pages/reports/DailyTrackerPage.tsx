import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { useToast } from '../../components/ui/Toast';
import { FileText, CheckCircle2, AlertCircle, LogOut, Send } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { finalizeWorkdaySignOut } from '../../services/authWorkflowService';
import { dailyReportApi } from '../../services/api/dailyReportApi';
import { extractWorkDone, formatReportNotes } from '../../utils/dailyReport';

export const DailyTrackerPage: React.FC = () => {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const [reportId, setReportId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('draft');
  const [workSummary, setWorkSummary] = useState<string>('');
  const [existingTodayPlan, setExistingTodayPlan] = useState<string | null>(null);

  useEffect(() => {
    fetchTodayReport();
  }, [user]);

  const fetchTodayReport = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const reportData = await dailyReportApi.getTodayReport();

      if (reportData) {
        setReportId(reportData.id);
        setStatus(reportData.status.toLowerCase());
        setExistingTodayPlan(reportData.today_plan || null);
        setWorkSummary(extractWorkDone(reportData.notes) || reportData.notes || '');
      } else {
        setReportId(null);
        setStatus('draft');
        setExistingTodayPlan(null);
        setWorkSummary('');
      }
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (!user) return;
    try {
      setIsSigningOut(true);
      await finalizeWorkdaySignOut(user.id);
      navigate('/login', {
        state: {
          logoutSuccessMessage: 'Attendance captured successfully. You have been signed out.',
        },
      });
    } catch (err: any) {
      showError(err.message || 'Failed to sign out');
      setIsSigningOut(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) return;

    if (!workSummary.trim()) {
      showError('Please summarize the work you completed today before submitting.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const today = new Date().toISOString().split('T')[0];
      const formattedNotes = formatReportNotes(existingTodayPlan, workSummary);

      if (reportId) {
        await dailyReportApi.updateReport(reportId, {
          status: 'Submitted',
          notes: formattedNotes,
          today_plan: existingTodayPlan,
        });
      } else {
        const created = await dailyReportApi.createReport({
          report_date: today,
          status: 'Submitted',
          notes: formattedNotes,
          today_plan: existingTodayPlan,
        });
        setReportId(created.id);
      }

      setStatus('submitted');
      showSuccess('Daily summary submitted successfully.');
    } catch (err: any) {
      setError(err);
      showError(err.message || 'Failed to submit daily summary');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState text="Loading Daily Summary..." />;
  if (error && !reportId && !workSummary) {
    return <ErrorState title="Failed to load Daily Summary" message={error.message} onRetry={fetchTodayReport} />;
  }

  const isLocked = status === 'submitted';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Logout Barrier Alert Banner (if redirected here when trying to logout) */}
      {location.state?.requiredForLogout && !isLocked && (
        <div
          id="logout-blocked-alert"
          data-testid="logout-blocked-alert"
          className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm flex items-start gap-3 shadow-2xs"
        >
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-900">Please complete your Daily Summary before logging out.</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Record what you accomplished today before signing out of your work session.
            </p>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-content flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Daily Summary
          </h1>
          <p className="text-xs text-content-muted mt-1">
            Record what you accomplished today.
          </p>
        </div>
        {isLocked && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-status-success/10 text-status-success rounded-full text-xs font-semibold border border-status-success/20 self-start sm:self-auto">
            <CheckCircle2 className="h-4 w-4" /> Submitted
          </div>
        )}
      </div>

      {/* Success Confirmation Card when Submitted */}
      {isLocked && (
        <div
          id="daily-summary-submitted-card"
          data-testid="daily-summary-submitted-card"
          className="p-5 bg-gradient-to-r from-emerald-50 to-teal-50/40 border border-emerald-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs"
        >
          <div className="flex items-center gap-3.5 text-center sm:text-left">
            <div className="p-3 rounded-xl bg-emerald-100 text-emerald-700 shrink-0">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-emerald-950">Daily summary submitted successfully.</h3>
              <p className="text-xs text-emerald-800 mt-0.5">
                Your work summary is recorded. You may continue working or sign out to finalize attendance.
              </p>
            </div>
          </div>
          <Button
            id="tracker-sign-out-button"
            data-testid="tracker-sign-out-button"
            onClick={handleSignOut}
            isLoading={isSigningOut}
            disabled={isSigningOut}
            className="w-full sm:w-auto px-6 py-2.5 gap-2 font-semibold shadow-xs shrink-0 cursor-pointer"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        </div>
      )}

      {/* Primary Content: Today's Work Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-content">Today's Work Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <textarea
              id="tracker-work-summary-input"
              data-testid="tracker-work-completed-input"
              className="w-full h-48 sm:h-56 bg-surface border border-border rounded-lg px-4 py-3 text-sm text-content placeholder:text-content-muted focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-70 disabled:bg-surface-muted resize-none leading-relaxed transition-colors shadow-2xs"
              placeholder="Summarize the work you completed today, including important tasks, progress, meetings, deliverables, or issues."
              value={workSummary}
              onChange={(e) => setWorkSummary(e.target.value)}
              disabled={isLocked || submitting}
            />
          </div>

          {!isLocked && (
            <div className="flex items-center justify-end pt-2">
              <Button
                id="submit-daily-summary-button"
                data-testid="submit-daily-summary-button"
                type="button"
                variant="primary"
                onClick={handleSubmit}
                isLoading={submitting}
                disabled={submitting || !workSummary.trim()}
                className="w-full sm:w-auto px-6 py-2.5 gap-2 font-semibold shadow-xs cursor-pointer"
              >
                <Send className="h-4 w-4" />
                <span>Submit Daily Summary</span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
