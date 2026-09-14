import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldCheck, Key, Eye, EyeOff, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import { SECURITY_QUESTIONS } from '../../types';

export const SecurityQuestionCard: React.FC = () => {
  const { userProfile, driverProfile, role, updateSecurityQuestion } = useAuth();
  const currentProfile = role === 'driver' ? driverProfile : userProfile;
  const hasConfiguredQuestion = Boolean(currentProfile?.securityQuestion);

  const [isEditing, setIsEditing] = useState<boolean>(!hasConfiguredQuestion);
  const [selectedQuestion, setSelectedQuestion] = useState<string>(
    currentProfile?.securityQuestion || SECURITY_QUESTIONS[0]
  );
  const [answer, setAnswer] = useState<string>('');
  const [showAnswer, setShowAnswer] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (answer.trim().length < 2) {
      setErrorMsg('Secret answer must be at least 2 characters.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      await updateSecurityQuestion(selectedQuestion, answer);
      setSuccessMsg('Security question configured successfully!');
      setAnswer('');
      setIsEditing(false);
    } catch (err: any) {
      console.error('Failed to update security question:', err);
      setErrorMsg(err.message || 'Failed to save security question.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 space-y-4 shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#E3F2FD] border border-[#0D47A1] text-[#0D47A1] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-black text-[#0D47A1] uppercase tracking-wider">
              Password Recovery Security Question
            </h4>
            <p className="text-[10px] text-slate-500 font-medium">
              Used to verify your identity before sending a password reset link
            </p>
          </div>
        </div>

        {hasConfiguredQuestion && !isEditing && (
          <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
            <CheckCircle className="w-3 h-3 text-emerald-600" /> Active
          </span>
        )}
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded-2xl text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-semibold">{errorMsg}</span>
        </div>
      )}

      {!isEditing && hasConfiguredQuestion ? (
        <div className="space-y-3">
          <div className="p-3.5 bg-[#E3F2FD]/50 border border-[#0D47A1]/30 rounded-2xl space-y-1">
            <span className="text-[10px] text-[#0D47A1] font-bold uppercase tracking-wider block">
              Configured Question:
            </span>
            <p className="text-xs font-extrabold text-slate-900 leading-snug">
              "{currentProfile?.securityQuestion}"
            </p>
            <p className="text-[10px] text-slate-500 pt-1">
              Your secret answer is securely stored and protected.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedQuestion(currentProfile?.securityQuestion || SECURITY_QUESTIONS[0]);
              setAnswer('');
              setErrorMsg(null);
              setSuccessMsg(null);
              setIsEditing(true);
            }}
            className="w-full py-2.5 px-3 bg-[#F8FAFC] hover:bg-[#E3F2FD] text-[#0D47A1] border border-[#0D47A1] rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
          >
            <Key className="w-3.5 h-3.5 text-[#0D47A1]" />
            <span>Change Security Question or Answer</span>
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-3">
          {!hasConfiguredQuestion && (
            <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 text-xs space-y-1">
              <span className="font-bold flex items-center gap-1 text-[11px]">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Action Recommended
              </span>
              <p className="text-[10px] text-amber-800">
                You do not have a secret question configured. Set one now so you can reset your password safely.
              </p>
            </div>
          )}

          <div>
            <label className="text-[11px] font-bold text-[#0D47A1] block mb-1">
              Select Secret Question
            </label>
            <select
              value={selectedQuestion}
              onChange={(e) => setSelectedQuestion(e.target.value)}
              className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-semibold focus:outline-none focus:border-[#1565C0] focus:bg-white"
            >
              {SECURITY_QUESTIONS.map((q) => (
                <option key={q} value={q} className="text-slate-800">
                  {q}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-[#0D47A1] block mb-1">
              Secret Answer (Case-Insensitive)
            </label>
            <div className="relative">
              <input
                type={showAnswer ? 'text' : 'password'}
                required
                placeholder="Enter your secret answer (e.g., Fluffy)"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] focus:border-[#1565C0] rounded-xl p-2.5 pr-10 text-xs text-[#0D47A1] font-semibold focus:outline-none focus:bg-white transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowAnswer((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#0D47A1] hover:text-[#1565C0] p-1 rounded-lg transition-colors focus:outline-none"
                title={showAnswer ? 'Hide answer' : 'Show answer'}
              >
                {showAnswer ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">At least 2 characters required.</p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={loading || answer.trim().length < 2}
              className="flex-1 py-2.5 bg-[#0D47A1] hover:bg-[#1565C0] disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {loading ? (
                'Saving...'
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Save Security Question</span>
                </>
              )}
            </button>
            {hasConfiguredQuestion && (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setErrorMsg(null);
                }}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
};
