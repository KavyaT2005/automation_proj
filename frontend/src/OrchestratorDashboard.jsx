import React, { useState, useEffect } from 'react';
import { UploadCloud, Layers, Play, CheckCircle, RefreshCw, Server, AlertCircle, Trash2 } from 'lucide-react';

export default function OrchestratorDashboard({ secureFetch, addLog }) {
  const [workbooks, setWorkbooks] = useState([]);
  const [selectedWorkbookId, setSelectedWorkbookId] = useState(null);
  const [workbookDetails, setWorkbookDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchWorkbooks = async () => {
    try {
      const res = await secureFetch('/api/v1/orchestrator/workbooks');
      if (res.ok) {
        const data = await res.json();
        setWorkbooks(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchWorkbookDetails = async (id) => {
    try {
      const res = await secureFetch(`/api/v1/orchestrator/workbook/${id}`);
      if (res.ok) {
        const data = await res.json();
        setWorkbookDetails(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchWorkbooks();
  }, []);

  const deleteWorkbook = async (e, id) => {
    e.stopPropagation(); // prevent selecting the workbook
    if (!window.confirm('Are you sure you want to delete this workbook? This action cannot be undone.')) return;
    
    try {
      const res = await secureFetch(`/api/v1/orchestrator/workbook/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        addLog(`Deleted workbook ${id}`, 'sys');
        if (selectedWorkbookId === id) {
          setSelectedWorkbookId(null);
          setWorkbookDetails(null);
        }
        fetchWorkbooks();
      } else {
        alert("Failed to delete workbook");
      }
    } catch (e) {
      console.error(e);
      alert("Network error during deletion");
    }
  };

  useEffect(() => {
    if (selectedWorkbookId) {
      fetchWorkbookDetails(selectedWorkbookId);
      
      const interval = setInterval(() => {
        if (workbookDetails?.status === 'running') {
          fetchWorkbookDetails(selectedWorkbookId);
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedWorkbookId, workbookDetails?.status]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    addLog(`Uploading multi-sheet workbook: ${file.name}`, 'sys');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await secureFetch('/api/v1/orchestrator/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        addLog(`Workbook parsed successfully. ID: ${data.workbook_id}`, 'sys');
        await fetchWorkbooks();
        setSelectedWorkbookId(data.workbook_id);
      } else {
        const err = await res.json();
        alert(`Upload failed: ${err.detail}`);
      }
    } catch (err) {
      alert("Network error during upload.");
    } finally {
      setUploading(false);
    }
  };

  const handleTargetUrlChange = async (jobId, newUrl) => {
    // Optimistic UI update
    setWorkbookDetails(prev => ({
      ...prev,
      sheets: prev.sheets.map(s => s.job_id === jobId ? { ...s, target_url: newUrl } : s)
    }));

    try {
      await secureFetch(`/api/v1/orchestrator/job/${jobId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_url: newUrl })
      });
    } catch (e) {
      console.error("Failed to update config");
    }
  };

  const startOrchestration = async () => {
    if (!selectedWorkbookId) return;
    addLog(`Initiating master orchestration for workbook ID: ${selectedWorkbookId}`, 'sys');
    
    // Optimistic state
    setWorkbookDetails(prev => ({ ...prev, status: 'running' }));
    
    try {
      const res = await secureFetch(`/api/v1/orchestrator/start/${selectedWorkbookId}`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        addLog(`Master orchestration completed. Processed ${data.sheets_processed} sheets.`, 'sys');
        fetchWorkbookDetails(selectedWorkbookId);
      }
    } catch (e) {
      addLog(`Master orchestration failed.`, 'err');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Upper row: Upload & List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Upload Panel */}
        <div className="glass-panel flex flex-col gap-4">
          <div className="card-header-bar">
            <div className="card-header-title">
              <UploadCloud className="w-4 h-4 text-emerald-500" />
              <span>Upload Master Workbook</span>
            </div>
          </div>
          
          <div className="upload-dropzone border-2 border-dashed border-slate-700/50 rounded-lg p-8 flex flex-col items-center justify-center relative hover:bg-slate-800/30 transition-colors">
            <input 
              type="file" 
              accept=".xlsx"
              onChange={handleUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              disabled={uploading}
            />
            {uploading ? (
              <RefreshCw className="w-10 h-10 text-emerald-500 mb-4 animate-spin" />
            ) : (
              <UploadCloud className="w-10 h-10 text-slate-500 mb-4" />
            )}
            <h3 className="text-sm font-bold text-slate-300">Drop Multi-Sheet Excel (.xlsx)</h3>
            <p className="text-xs text-slate-500 mt-2 text-center max-w-xs">
              Upload a workbook containing multiple sheets. The system will automatically map and execute tasks for every sheet.
            </p>
          </div>
        </div>

        {/* List Panel */}
        <div className="glass-panel flex flex-col gap-4">
          <div className="card-header-bar">
            <div className="card-header-title">
              <Layers className="w-4 h-4 text-indigo-500" />
              <span>Workbooks Archive</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 overflow-y-auto max-h-[250px]">
            {workbooks.map(wb => (
              <div 
                key={wb.id} 
                onClick={() => setSelectedWorkbookId(wb.id)}
                className={`p-3 rounded border cursor-pointer transition-colors ${selectedWorkbookId === wb.id ? 'bg-indigo-900/20 border-indigo-500/30' : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'}`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-200">{wb.filename}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{new Date(wb.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider ${wb.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : wb.status === 'running' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400'}`}>
                      {wb.status}
                    </div>
                    <button 
                      onClick={(e) => deleteWorkbook(e, wb.id)}
                      className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      title="Delete Workbook"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {workbooks.length === 0 && (
              <div className="text-xs text-slate-500 text-center py-4">No workbooks uploaded yet.</div>
            )}
          </div>
        </div>

      </div>

      {/* Configuration & Dashboard */}
      {workbookDetails && (
        <div className="glass-panel flex flex-col gap-4">
          <div className="card-header-bar">
            <div className="card-header-title">
              <Server className="w-4 h-4 text-emerald-500" />
              <span>Master Orchestration Console - {workbookDetails.filename}</span>
            </div>
            {workbookDetails.status === 'running' ? (
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded text-[10px] font-bold">
                <RefreshCw className="w-3 h-3 animate-spin" />
                ORCHESTRATION IN PROGRESS
              </div>
            ) : (
              <button 
                onClick={startOrchestration}
                disabled={workbookDetails.status === 'running'}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold flex items-center gap-1.5 transition-colors"
              >
                <Play className="w-3 h-3" />
                START MASTER AUTOMATION
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Sheet Name</th>
                  <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Rows</th>
                  <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Target Config</th>
                  <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Execution Status</th>
                </tr>
              </thead>
              <tbody>
                {workbookDetails.sheets.map(sheet => (
                  <tr key={sheet.id} className="border-b border-slate-800/50 hover:bg-slate-900/30 transition-colors">
                    <td className="py-3 px-4 text-xs font-medium text-slate-300">
                      <div className="flex items-center gap-2">
                        <Layers className="w-3.5 h-3.5 text-slate-500" />
                        {sheet.sheet_name}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400 font-mono">
                      {sheet.record_count} Records
                    </td>
                    <td className="py-3 px-4">
                      <input 
                        type="text" 
                        value={sheet.target_url || ''}
                        onChange={(e) => handleTargetUrlChange(sheet.job_id, e.target.value)}
                        disabled={workbookDetails.status === 'running'}
                        placeholder="Paste target URL..."
                        className="input-glass text-xs w-full max-w-[250px]"
                      />
                    </td>
                    <td className="py-3 px-4">
                      {sheet.status === 'completed' ? (
                         <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                           <CheckCircle className="w-3.5 h-3.5" />
                           Done
                         </div>
                      ) : sheet.status === 'running' ? (
                         <div className="flex items-center gap-1.5 text-blue-400 text-xs font-medium">
                           <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                           Active
                         </div>
                      ) : sheet.status === 'failed' || sheet.status === 'completed_with_errors' ? (
                         <div className="flex items-center gap-1.5 text-red-400 text-xs font-medium">
                           <AlertCircle className="w-3.5 h-3.5" />
                           Failed
                         </div>
                      ) : (
                         <span className="text-xs text-slate-500">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}
    </div>
  );
}
